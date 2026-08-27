#!/bin/bash
# Zera o D1 local, sobe o wrangler de novo e roda o teste ponta a ponta.
# O wrangler segura o arquivo do SQLite, então precisa parar antes de apagar.
#
# Nada aqui toca a nuvem: --local usa um SQLite dentro de api/.wrangler.
set -e
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$REPO/api"

# Encerra só quem está na porta 8787 deste projeto — nunca "todo wrangler"
# ou "todo workerd" da máquina. Ver api/scripts/encerrar-porta.ps1.
powershell.exe -NoProfile -NonInteractive -File "$API/scripts/encerrar-porta.ps1" -Porta 8787
sleep 1

# o dashboard precisa ser servido por HTTP: aberto como file:// o navegador
# bloqueia a chamada à API por causa do CORS
if ! curl -s -m 2 -o /dev/null http://localhost:8000/dashboard.html; then
  setsid nohup python3 -m http.server 8000 --directory "$REPO" > /dev/null 2>&1 < /dev/null &
  disown
fi

cd "$API"
rm -rf .wrangler/state
npx wrangler d1 execute DB --local --file=schema.sql > /dev/null 2>&1
setsid nohup npx wrangler dev --local --port 8787 > "$API/wrangler.log" 2>&1 < /dev/null &
disown

for i in $(seq 1 30); do
  curl -s -m 2 http://localhost:8787/api/state -H "Authorization: Bearer troque-por-uma-chave-de-teste" 2>/dev/null | grep -q '"produtos"' && break
  sleep 2
done

node "$REPO/src/e2e.mjs"
