#!/bin/bash
# Backup completo e restaurável do D1 DEV, ANTES do reset.
#
# ALVO FIXO: marquesa-db-dev (dcc36f65-…). Produção (marquesa-db,
# 089153a9-…) não é alcançável por este script nem se você digitar errado:
# o nome está escrito aqui, e o passo 1 confere o uuid antes de qualquer
# outra coisa. Ver a skill `database-dev`.
#
# Produz, em backups/d1/<carimbo>/ (a convenção de docs/BACKUP_RECOVERY.md):
#   marquesa-db-dev.sql         o dump inteiro, restaurável
#   marquesa-db-dev.sql.sha256  a soma de verificação
#   fotos-manifesto.json        de qual SKU é cada objeto no R2
#   MANIFESTO.txt               origem, hora, commit, contagens, restauração
#
# Só leitura no banco. Não lê e não grava Secret nenhum.
set -euo pipefail

DB="marquesa-db-dev"
UUID_DEV="dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b"
UUID_PROD="089153a9-cee5-4887-b789-a23b1cf419f5"
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$API/.." && pwd)"
CARIMBO="$(date +%Y-%m-%d_%H-%M)"
DEST="${DEST:-$REPO/backups/d1/${CARIMBO}_pre-reset-sthefany}"

cd "$API"

# ---------------------------------------------------------------- 1. provar
# "Não existe escrita provavelmente em DEV" — e não existe backup
# provavelmente do DEV. O uuid é conferido antes de o dump começar.
echo "→ provando o alvo…"
INFO="$(npx wrangler d1 info "$DB" --json 2>/dev/null || true)"
UUID="$(printf '%s' "$INFO" | grep -o '"uuid"[^,]*' | cut -d'"' -f4 || true)"

if [ "$UUID" = "$UUID_PROD" ]; then
  echo "✗ PARE. O nome '$DB' resolveu para o uuid de PRODUÇÃO. Nada foi feito."; exit 1
fi
if [ "$UUID" != "$UUID_DEV" ]; then
  echo "✗ uuid inesperado para '$DB': '${UUID:-vazio}'"
  echo "  esperado: $UUID_DEV"
  echo "  Confira o wrangler.toml e a autenticação (npx wrangler whoami). Nada foi feito."
  exit 1
fi
echo "✓ $DB = $UUID (DEV)"

mkdir -p "$DEST"
SQL="$DEST/$DB.sql"

# ------------------------------------------------ 2. o ponto de retorno
# O bookmark do Time Travel vale 30 dias e restaura sem depender de
# arquivo. Capturado ANTES de qualquer escrita.
echo "→ marcando o bookmark do Time Travel…"
BOOKMARK="$(npx wrangler d1 time-travel info "$DB" --json 2>/dev/null \
            | grep -o '"bookmark"[^,]*' | cut -d'"' -f4 || true)"
[ -n "$BOOKMARK" ] && echo "  bookmark: $BOOKMARK" \
                   || echo "  (não consegui ler o bookmark — o .sql continua valendo)"

# ------------------------------------------------------- 3. o retrato de antes
echo "→ listando tabelas e contando registros…"
TABELAS="$(npx wrangler d1 execute "$DB" --env staging --remote --json \
             --file="$API/tools/tabelas.sql" 2>/dev/null \
           | python3 -c 'import json,sys; d=json.load(sys.stdin); print(" ".join(r["name"] for r in (d[0] if isinstance(d,list) else d)["results"]))')"
echo "  $(printf '%s' "$TABELAS" | wc -w) tabelas: $TABELAS"

# Uma linha só, com uma subconsulta por tabela. O D1 recusa um SELECT
# composto com este tanto de UNION ALL ("too many terms in compound
# SELECT"), e montá-la a partir das tabelas que EXISTEM evita o "no such
# table" quando falta uma migration.
CONSULTA="SELECT $(for t in $TABELAS; do printf "(SELECT COUNT(*) FROM %s) AS %s," "$t" "$t"; done | sed 's/,$//')"
CONTAGEM="$(npx wrangler d1 execute "$DB" --env staging --remote --json --command "$CONSULTA" 2>/dev/null \
            | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps((d[0] if isinstance(d,list) else d)["results"][0], indent=2, ensure_ascii=False))')"

REV="$(npx wrangler d1 execute "$DB" --env staging --remote --json \
         --file="$API/tools/revendedoras-antes-depois.sql" 2>/dev/null \
       | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps((d[0] if isinstance(d,list) else d)["results"][0], ensure_ascii=False))')"

# O mapa das fotos: o reset apaga a LINHA que guarda a chave do objeto,
# e os bytes ficam no bucket sem dono declarado. Este arquivo é o dono.
echo "→ guardando o mapa das fotos (D1 → R2)…"
npx wrangler d1 execute "$DB" --env staging --remote --json \
  --file="$API/tools/fotos-manifesto.sql" 2>/dev/null \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); json.dump((d[0] if isinstance(d,list) else d)["results"], open(sys.argv[1],"w"), indent=2, ensure_ascii=False)' \
  "$DEST/fotos-manifesto.json"
N_FOTOS="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$DEST/fotos-manifesto.json")"
echo "  $N_FOTOS produto(s) com foto ou URL de foto"

# ------------------------------------------------------------- 4. o dump
# ⚠️ O wrangler imprime um link temporário do R2 (1 h) que dá acesso ao
# dump inteiro SEM autenticação. Não cole a saída deste comando em lugar
# nenhum — ver docs/BACKUP_RECOVERY.md.
echo "→ exportando (o banco fica indisponível para consulta enquanto isso)…"
npx wrangler d1 export "$DB" --env staging --remote --output="$SQL" --skip-confirmation

sha256sum "$SQL" | awk -v n="$DB.sql" '{print $1"  "n}' > "$SQL.sha256"

BYTES="$(wc -c < "$SQL" | tr -d ' ')"
N_CREATE="$(grep -c "^CREATE TABLE" "$SQL" || true)"
N_INSERT="$(grep -c "^INSERT INTO" "$SQL" || true)"
COMMIT="$(git -C "$REPO" rev-parse HEAD)"
BRANCH="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"

cat > "$DEST/MANIFESTO.txt" <<CARTAO
Backup D1 — checkpoint antes do reset para o teste de importação da Sthefany
===========================================================================

Banco de origem   $DB  (uuid $UUID)
Ambiente          DEV / staging — Worker marquesa-api-staging
                  NÃO é produção (marquesa-db, $UUID_PROD)
Data/hora (UTC)   $(date -u +"%Y-%m-%d %H:%M:%S")
Data/hora (local) $(date +"%Y-%m-%d %H:%M:%S %Z")
Commit            $COMMIT
Branch            $BRANCH
Wrangler          $(npx wrangler --version 2>/dev/null | tail -1)

Arquivo           $DB.sql
Tamanho           $BYTES bytes
CREATE TABLE      $N_CREATE
INSERT INTO       $N_INSERT
SHA-256           $(cut -d' ' -f1 < "$SQL.sha256")

Time Travel       ${BOOKMARK:-(nao capturado)}
                  valido ate $(date -u -d '+30 days' +%Y-%m-%d 2>/dev/null || date -u -v+30d +%Y-%m-%d)

Fotos             $N_FOTOS produto(s) com foto — mapa em fotos-manifesto.json
                  Os BYTES continuam no bucket marquesa-fotos-dev. Este
                  backup nao copia nem apaga objeto nenhum do R2.

Secrets           NAO fazem parte deste backup e nao sao legiveis. Se um dia
                  se perderem, e rotacao, nao recuperacao.

Contagem por tabela no momento do backup
----------------------------------------
$CONTAGEM

Revendedoras no momento do backup
---------------------------------
$REV

Como restaurar
--------------
Caminho 1 — Time Travel (preferido: rapido, nao depende do arquivo)

  cd api
  npx wrangler d1 time-travel restore $DB --bookmark='${BOOKMARK:-COLE-O-BOOKMARK}'

Caminho 2 — a partir deste arquivo

  cd api
  bash tools/validar-backup.sh $DEST/$DB.sql     # confere sem restaurar
  bash tools/restaurar-backup.sh $DEST/$DB.sql   # restaura, pedindo confirmacao

O dump traz CREATE TABLE SEM "IF NOT EXISTS": aplicado sobre um banco que
ainda tem as tabelas, ele falha na primeira linha. Por isso o restaurador
remove as tabelas antes — e o proprio arquivo que as recria, com dados e
indices. Restore e Classe C (docs/SECURITY.md): nunca roda sem uma pessoa
pedindo, naquele momento, aquele arquivo naquele banco.
CARTAO

echo
echo "✓ dump:      $SQL"
echo "✓ manifesto: $DEST/MANIFESTO.txt"
echo "✓ fotos:     $DEST/fotos-manifesto.json"
echo "✓ checksum:  $SQL.sha256"
echo
echo "Próximo passo: bash tools/validar-backup.sh \"$SQL\""
