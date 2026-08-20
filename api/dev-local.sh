#!/bin/bash
# Sobe o Worker local do zero: derruba o que estiver de pé, zera o banco de
# teste e espera a API responder. Nada aqui toca a nuvem — o `--local` usa um
# SQLite (e, com --env staging, também um R2) dentro de `api/.wrangler`, e as
# variáveis saem do `.dev.vars`.
#
# Existe porque matar só o processo do runtime não resolve: o wrangler que
# ficou vivo sobe outro na hora, e o novo encontra a porta ocupada pelo
# antigo. Aqui os dois caem, e a porta é esperada de verdade.
#
#   api/dev-local.sh                     zera o banco (produção-shaped) e sobe
#   api/dev-local.sh --manter            sobe sem zerar o banco
#   api/dev-local.sh --env staging       usa o ambiente [env.staging] do
#                                         wrangler.toml (Worker, D1 e R2 com
#                                         nome de DEV) — ainda 100% local, o
#                                         --local nunca chega a olhar para os
#                                         IDs reais da Cloudflare.
#   api/dev-local.sh --env staging --manter   os dois juntos
set -e
API="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$API"

MANTER=""
AMBIENTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --manter) MANTER=1 ;;
    --env) shift; AMBIENTE="$1" ;;
  esac
  shift
done
FLAG_ENV=()
DB_NOME="marquesa-db"
if [ -n "$AMBIENTE" ]; then
  FLAG_ENV=(--env "$AMBIENTE")
  DB_NOME="marquesa-db-$AMBIENTE"   # o `d1 execute` quer o nome do banco
fi                                   # DAQUELE ambiente, não o binding "DB"

# O -o exclui este próprio script do alvo, senão ele se mata ao procurar por
# um padrão que a própria linha de comando contém.
ALVOS='wrangler-dist/cli.js|workerd'
pkill -o -f "$ALVOS" 2>/dev/null || true
pkill -f "$ALVOS" 2>/dev/null || true

for _ in $(seq 1 15); do
  ss -ltn 2>/dev/null | grep -q ':8787 ' || break
  sleep 1
done

if [ -z "$MANTER" ]; then
  rm -rf .wrangler/state
  npx wrangler d1 execute "$DB_NOME" "${FLAG_ENV[@]}" --local --file=schema.sql > /dev/null 2>&1
fi

setsid nohup npx wrangler dev "${FLAG_ENV[@]}" --local --port 8787 > "$API/wrangler.log" 2>&1 < /dev/null &
disown

for _ in $(seq 1 40); do
  if curl -s -m 2 http://localhost:8787/api/health 2>/dev/null | grep -q '"ok"'; then
    echo "API local no ar em http://localhost:8787${AMBIENTE:+ (ambiente: $AMBIENTE)}"
    exit 0
  fi
  sleep 2
done
echo "a API local não subiu — veja api/wrangler.log" >&2
exit 1
