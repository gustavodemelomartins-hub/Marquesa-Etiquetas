#!/bin/bash
# Backup completo e restaurável do D1 DEV, ANTES do reset.
#
# Produz três coisas na pasta de saída:
#   <nome>.sql        o dump inteiro (schema + dados), restaurável
#   <nome>.sha256     a soma de verificação do dump
#   <nome>.md         o cartão do checkpoint: origem, hora, commit, contagens
#                     e o comando exato de restauração
#
# Não imprime, não grava e não lê Secret nenhum: o wrangler autentica pelo
# login da máquina (ou por CLOUDFLARE_API_TOKEN no ambiente), e nada disso
# entra nos arquivos gerados.
set -euo pipefail

DB="${DB:-marquesa-db}"
DEST="${DEST:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/backups}"
CARIMBO="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
NOME="${NOME:-marquesa-dev-pre-reset-sthefany-$CARIMBO}"
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$DEST"
SQL="$DEST/$NOME.sql"

echo "→ banco:  $DB (remoto)"
echo "→ saída:  $SQL"

cd "$API"

# 1. O ponto de retorno do Time Travel, ANTES de qualquer escrita. Vale 30
#    dias e restaura o banco inteiro sem depender do arquivo .sql.
echo "→ marcando o bookmark do Time Travel…"
BOOKMARK="$(npx wrangler d1 time-travel info "$DB" --json 2>/dev/null \
            | grep -o '"bookmark"[^,]*' | cut -d'"' -f4 || true)"
[ -n "$BOOKMARK" ] && echo "  bookmark: $BOOKMARK" || echo "  (não consegui ler o bookmark — o .sql continua valendo)"

# 2. O dump.
echo "→ exportando…"
npx wrangler d1 export "$DB" --remote --output="$SQL" --skip-confirmation

# 3. Soma de verificação.
sha256sum "$SQL" | awk '{print $1"  '"$NOME"'.sql"}' > "$DEST/$NOME.sha256"

# 4. As contagens de ANTES, tiradas do banco (não do dump), para o relatório
#    do reset ter contra o que comparar.
echo "→ contando registros…"
CONTAGEM="$(npx wrangler d1 execute "$DB" --remote --file="$API/tools/contagem.sql" --json 2>/dev/null || true)"
REV="$(npx wrangler d1 execute "$DB" --remote --file="$API/tools/revendedoras-antes-depois.sql" --json 2>/dev/null || true)"

BYTES="$(wc -c < "$SQL" | tr -d ' ')"
LINHAS="$(wc -l < "$SQL" | tr -d ' ')"
COMMIT="$(git -C "$API" rev-parse HEAD)"
BRANCH="$(git -C "$API" rev-parse --abbrev-ref HEAD)"

cat > "$DEST/$NOME.md" <<CARTAO
# Checkpoint DEV — $NOME

| | |
|---|---|
| Banco de origem | \`$DB\` (D1 remoto, ambiente DEV/staging) |
| Data/hora (UTC) | $(date -u +"%Y-%m-%d %H:%M:%S") |
| Commit | \`$COMMIT\` |
| Branch | \`$BRANCH\` |
| Arquivo | \`$NOME.sql\` |
| Tamanho | $BYTES bytes · $LINHAS linhas |
| SHA-256 | \`$(cut -d' ' -f1 < "$DEST/$NOME.sha256")\` |
| Bookmark Time Travel | \`${BOOKMARK:-(não capturado)}\` |

Nenhum Secret foi lido ou gravado por este backup.

## Contagem no momento do backup

\`\`\`json
$CONTAGEM
\`\`\`

## Revendedoras no momento do backup

\`\`\`json
$REV
\`\`\`

## Como restaurar

### Caminho 1 — Time Travel (preferido: mais rápido, sem arquivo)

\`\`\`bash
cd api
npx wrangler d1 time-travel restore $DB --bookmark='${BOOKMARK:-COLE-O-BOOKMARK}'
\`\`\`

Volta o banco inteiro ao instante do checkpoint. Vale até 30 dias depois
de $(date -u +"%Y-%m-%d").

### Caminho 2 — a partir deste arquivo

\`\`\`bash
cd api
bash tools/restaurar-backup.sh ../backups/$NOME.sql
\`\`\`

O script valida o arquivo, pede confirmação por extenso, remove as tabelas
atuais e as recria a partir do dump. As tabelas precisam sair antes porque
o \`wrangler d1 export\` grava \`CREATE TABLE\` **sem** \`IF NOT EXISTS\` —
aplicado sobre um banco que ainda as tem, o arquivo falha na primeira
linha. Quem repõe tudo (schema, índices e linhas) é o próprio dump.

Para conferir o arquivo sem restaurar nada:

\`\`\`bash
bash tools/validar-backup.sh ../backups/$NOME.sql
\`\`\`
CARTAO

echo
echo "✓ backup:   $SQL"
echo "✓ cartão:   $DEST/$NOME.md"
echo "✓ checksum: $DEST/$NOME.sha256"
