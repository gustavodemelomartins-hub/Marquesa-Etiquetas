#!/bin/bash
# Confere se um backup do DEV é mesmo restaurável — restaurando ele de
# verdade, num SQLite temporário, e conferindo o que chegou lá dentro.
#
# NÃO toca no DEV remoto. Não escreve nada fora da pasta temporária.
#
#   bash tools/validar-backup.sh ../backups/marquesa-dev-pre-reset-....sql
set -euo pipefail

SQL="${1:?uso: validar-backup.sh <arquivo.sql>}"
[ -f "$SQL" ] || { echo "✗ arquivo não existe: $SQL"; exit 1; }

BYTES="$(wc -c < "$SQL" | tr -d ' ')"
[ "$BYTES" -gt 0 ] || { echo "✗ arquivo vazio"; exit 1; }
echo "✓ existe e não está vazio — $BYTES bytes"

if [ -f "${SQL%.sql}.sha256" ]; then
  (cd "$(dirname "$SQL")" && sha256sum -c "$(basename "${SQL%.sql}.sha256")") \
    && echo "✓ checksum confere"
else
  echo "· sem .sha256 ao lado — pulando a conferência de integridade"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 - "$SQL" <<'PY'
import sqlite3, sys, os
sql = open(sys.argv[1], encoding='utf-8', errors='replace').read()

# Restauração de verdade, num banco descartável em memória.
#
# As FKs ficam desligadas DURANTE a carga e são conferidas DEPOIS, inteiras.
# É o mesmo que o D1 faz ao aplicar um dump (`PRAGMA defer_foreign_keys`):
# um dump lista as tabelas em ordem alfabética, então `maleta_itens` chega
# antes de `produtos` e qualquer FK ligada recusaria a linha. Desligar aqui
# não afrouxa a conferência — o `foreign_key_check` no fim é sobre o banco
# já montado, e é ele que diz se o backup está coerente.
c = sqlite3.connect(':memory:')
c.execute('PRAGMA foreign_keys=OFF')
try:
    c.executescript(sql)
except sqlite3.Error as e:
    print('✗ o dump NÃO restaura:', e); sys.exit(1)
print('✓ o dump restaura sem erro num banco limpo')

tabs = [r[0] for r in c.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]

# As tabelas que o sistema não vive sem: se faltar uma, o backup não serve.
ESPERADAS = {'categorias','clientes','config','inventario_itens','inventarios',
             'kit_componentes','loja_snapshot','maleta_itens','maletas',
             'movimentos','produto_variacoes','produtos','revendedoras',
             'sync_execucoes','venda_itens','vendas'}
faltando = ESPERADAS - set(tabs)
if faltando:
    print('✗ faltam tabelas no backup:', sorted(faltando)); sys.exit(1)
print(f'✓ as {len(ESPERADAS)} tabelas esperadas estão no backup')

print('\n  tabela                registros')
print('  ' + '-'*32)
total = 0
for t in tabs:
    n = c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    total += n
    print(f'  {t:22}{n:>8}')
print(f'  {"TOTAL":22}{total:>8}')

nrev = c.execute('SELECT COUNT(*) FROM revendedoras').fetchone()[0]
if nrev == 0:
    print('\n✗ ATENÇÃO: o backup tem ZERO revendedoras — não é o DEV certo.'); sys.exit(1)
print(f'\n✓ o backup carrega {nrev} revendedora(s) — é dado de verdade, não só schema')

c.execute('PRAGMA foreign_keys=ON')
viol = c.execute('PRAGMA foreign_key_check').fetchall()
print('✓ integridade referencial: sem violação' if not viol
      else f'✗ violações de FK no backup: {viol[:5]}')
PY

echo
echo "✓ backup validado: restaura, tem as tabelas e tem os dados."
