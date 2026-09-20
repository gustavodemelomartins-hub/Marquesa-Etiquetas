#!/bin/bash
# Sobe o Worker local com o banco de staging local e o semeia pela API real.
# Mata pelo PID guardado, e não por padrão de linha de comando: um `pkill -f`
# aqui derruba o próprio shell que o invoca, porque a linha dele contém o
# padrão.
set -e
PID=.tmp/worker-local.pid
[ -f "$PID" ] && kill "$(cat "$PID")" 2>/dev/null || true
sleep 1
cd .
setsid nohup node scripts/v2-local/worker-local.mjs . 8787 \
  scripts/v2-local/seed-catalogo.sql > /tmp/worker.log 2>&1 < /dev/null &
echo $! > "$PID"
for _ in $(seq 1 30); do
  curl -s -m 2 http://127.0.0.1:8787/api/health 2>/dev/null | grep -q '"ok"' && break
  sleep 1
done
curl -s http://127.0.0.1:8787/api/health | grep -q '"ok"' || { echo "worker nao subiu"; tail -5 /tmp/worker.log; exit 1; }
node scripts/v2-local/semear.mjs
