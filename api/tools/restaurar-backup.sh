#!/bin/bash
# Volta o marquesa-db-dev ao estado de um backup feito por backup-dev.sh.
#
# ⚠️ Restore é Classe C (docs/SECURITY.md): NUNCA roda por iniciativa de um
#    agente. Só quando uma pessoa diz, naquele momento, que quer restaurar
#    aquele banco a partir daquele arquivo. Por isso este script pede a
#    palavra RESTAURAR digitada por extenso e não aceita nada automatizado.
#
# É o caminho 2 — o que parte do arquivo. O caminho 1, preferido, não
# depende de arquivo nenhum:
#
#   npx wrangler d1 time-travel restore marquesa-db-dev --bookmark='<do MANIFESTO>'
#
# Este aqui existe para quando os 30 dias do Time Travel já passaram, ou
# para restaurar num banco diferente do original.
#
#   bash tools/restaurar-backup.sh ../backups/d1/<carimbo>/marquesa-db-dev.sql
set -euo pipefail

SQL="${1:?uso: restaurar-backup.sh <arquivo.sql>}"
DB="marquesa-db-dev"
UUID_DEV="dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b"
UUID_PROD="089153a9-cee5-4887-b789-a23b1cf419f5"
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$(cd "$(dirname "$SQL")" && pwd)/$(basename "$SQL")"

[ -f "$SQL" ] || { echo "✗ arquivo não existe: $SQL"; exit 1; }
cd "$API"

# 1. Provar o alvo antes de qualquer coisa (skill `database-dev`).
UUID="$(npx wrangler d1 info "$DB" --json 2>/dev/null | grep -o '"uuid"[^,]*' | cut -d'"' -f4 || true)"
[ "$UUID" = "$UUID_PROD" ] && { echo "✗ PARE. '$DB' resolveu para PRODUÇÃO. Nada foi feito."; exit 1; }
[ "$UUID" = "$UUID_DEV" ]  || { echo "✗ uuid inesperado para '$DB': '${UUID:-vazio}'. Nada foi feito."; exit 1; }
echo "✓ alvo provado: $DB = $UUID (DEV)"

# 2. Nunca restaurar um arquivo que não foi conferido.
echo "→ validando o backup antes de encostar no banco…"
bash "$API/tools/validar-backup.sh" "$SQL" > /dev/null || {
  echo "✗ o backup não passou na validação. Restauração cancelada."; exit 1; }
echo "✓ backup válido"

# 3. Guardar o que existe AGORA, mesmo que pareça ruim. Um restore sobre
#    dado ruim ainda é uma perda se ninguém guardou o ruim
#    (docs/BACKUP_RECOVERY.md § Antes de qualquer restore).
echo "→ exportando o estado atual antes de substituí-lo…"
ANTES="$(dirname "$(dirname "$SQL")")/$(date +%Y-%m-%d_%H-%M)_ANTES-DO-RESTORE"
mkdir -p "$ANTES"
npx wrangler d1 export "$DB" --env staging --remote --output="$ANTES/$DB.sql" --skip-confirmation
echo "✓ estado atual guardado em $ANTES"

echo
echo "⚠️  Vai SUBSTITUIR o banco '$DB' pelo conteúdo de:"
echo "    $SQL"
echo "    Tudo o que estiver lá agora — inclusive uma importação feita depois — some."
read -r -p "    Digite RESTAURAR para confirmar: " c
[ "$c" = "RESTAURAR" ] || { echo "cancelado."; exit 1; }

# 4. O dump do `wrangler d1 export` traz CREATE TABLE **sem** IF NOT EXISTS:
#    aplicá-lo sobre um banco que ainda tem as tabelas falha na primeira
#    linha. Por isso as tabelas saem antes — e é seguro, porque o próprio
#    arquivo que estamos aplicando as recria, com dados e índices.
#    (Isto é uma RESTAURAÇÃO. O reset normal, o reset-dev.sql, não dropa
#    tabela nenhuma.)
echo "→ removendo as tabelas atuais…"
TABELAS="$(npx wrangler d1 execute "$DB" --env staging --remote --json --file="$API/tools/tabelas.sql" \
  2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(" ".join(r["name"] for r in (d[0] if isinstance(d,list) else d)["results"]))')"
for t in $TABELAS; do
  npx wrangler d1 execute "$DB" --env staging --remote --command "DROP TABLE IF EXISTS \"$t\"" > /dev/null
  echo "  dropada: $t"
done

echo "→ aplicando o backup…"
npx wrangler d1 execute "$DB" --env staging --remote --file="$SQL"

echo "→ conferindo o que chegou…"
npx wrangler d1 execute "$DB" --env staging --remote --file="$API/tools/revendedoras-antes-depois.sql"
npx wrangler d1 execute "$DB" --env staging --remote --command \
  "SELECT COUNT(*) AS divergentes FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.soma,0)"

echo
echo "✓ restaurado. Compare com as contagens do MANIFESTO.txt do backup."
echo "  divergentes = 0 é o critério de aceitação."
