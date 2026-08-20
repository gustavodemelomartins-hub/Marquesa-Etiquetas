#!/bin/bash
# Sobe o Worker local do zero: derruba o que estiver de pé, zera o banco de
# teste e espera a API responder. Nada aqui toca a nuvem — o `--local` usa um
# SQLite dentro de `api/.wrangler` e as variáveis saem do `.dev.vars`.
#
# Existe porque matar só o processo do runtime não resolve: o wrangler que
# ficou vivo sobe outro na hora, e o novo encontra a porta ocupada pelo
# antigo. Aqui os dois caem, e a porta é esperada de verdade.
#
#   api/dev-local.sh            zera o banco e sobe
#   api/dev-local.sh --manter   sobe sem zerar o banco
set -e
API="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$API"

# O -o exclui este próprio script do alvo, senão ele se mata ao procurar por
# um padrão que a própria linha de comando contém.
ALVOS='wrangler-dist/cli.js|workerd'
pkill -o -f "$ALVOS" 2>/dev/null || true
pkill -f "$ALVOS" 2>/dev/null || true

for _ in $(seq 1 15); do
  ss -ltn 2>/dev/null | grep -q ':8787 ' || break
  sleep 1
done

if [ "$1" != "--manter" ]; then
  rm -rf .wrangler/state
  npx wrangler d1 execute marquesa-db --local --file=schema.sql > /dev/null 2>&1
fi

setsid nohup npx wrangler dev --local --port 8787 > "$API/wrangler.log" 2>&1 < /dev/null &
disown

for _ in $(seq 1 40); do
  if curl -s -m 2 http://localhost:8787/api/health 2>/dev/null | grep -q '"ok"'; then
    echo "API local no ar em http://localhost:8787"
    exit 0
  fi
  sleep 2
done
echo "a API local não subiu — veja api/wrangler.log" >&2
exit 1
