#!/bin/bash
# Volta o DEV ao estado de um backup feito por backup-dev.sh.
#
# É o caminho 2 — o que parte do arquivo. O caminho 1, mais rápido e sem
# arquivo nenhum, é o Time Travel:
#
#   npx wrangler d1 time-travel restore marquesa-db --bookmark='<do cartão>'
#
# Este aqui existe para quando os 30 dias do Time Travel já passaram, ou
# para restaurar num banco diferente do original.
#
# ⚠️ ESTE COMANDO SUBSTITUI O BANCO INTEIRO. Tudo o que estiver lá agora
#    — inclusive uma importação que a Sthefany tenha feito depois — some.
#
#   bash tools/restaurar-backup.sh ../backups/marquesa-dev-pre-reset-....sql
set -euo pipefail

SQL="${1:?uso: restaurar-backup.sh <arquivo.sql>}"
DB="${DB:-marquesa-db}"
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$(cd "$(dirname "$SQL")" && pwd)/$(basename "$SQL")"

[ -f "$SQL" ] || { echo "✗ arquivo não existe: $SQL"; exit 1; }

# 1. Nunca restaurar um arquivo que não foi conferido.
echo "→ validando o backup antes de encostar no banco…"
bash "$API/tools/validar-backup.sh" "$SQL" > /dev/null || {
  echo "✗ o backup não passou na validação. Restauração cancelada."; exit 1; }
echo "✓ backup válido"

echo
echo "⚠️  Vai SUBSTITUIR o banco '$DB' (remoto) pelo conteúdo de:"
echo "    $SQL"
read -r -p "    Digite RESTAURAR para confirmar: " c
[ "$c" = "RESTAURAR" ] || { echo "cancelado."; exit 1; }

cd "$API"

# 2. O dump do `wrangler d1 export` traz CREATE TABLE **sem** IF NOT EXISTS:
#    aplicá-lo sobre um banco que ainda tem as tabelas falha na primeira
#    linha. Por isso as tabelas saem antes — e é seguro, porque o próprio
#    arquivo que estamos aplicando as recria, com dados e índices.
#    (Isto é uma RESTAURAÇÃO. O reset normal, o `reset-dev.sql`, não dropa
#    tabela nenhuma.)
echo "→ removendo as tabelas atuais…"
TABELAS="$(npx wrangler d1 execute "$DB" --remote --json --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'" \
  2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(" ".join(r["name"] for r in (d[0] if isinstance(d,list) else d)["results"]))')"

for t in $TABELAS; do
  npx wrangler d1 execute "$DB" --remote --command "DROP TABLE IF EXISTS \"$t\"" > /dev/null
  echo "  dropada: $t"
done

# 3. E o arquivo repõe tudo: schema, índices e linhas.
echo "→ aplicando o backup…"
npx wrangler d1 execute "$DB" --remote --file="$SQL"

echo "→ conferindo o que chegou…"
npx wrangler d1 execute "$DB" --remote --file="$API/tools/contagem.sql"
npx wrangler d1 execute "$DB" --remote --file="$API/tools/revendedoras-antes-depois.sql"

echo
echo "✓ restaurado. Compare as contagens acima com as do cartão do backup."
