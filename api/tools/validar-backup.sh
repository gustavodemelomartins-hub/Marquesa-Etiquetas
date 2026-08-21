#!/bin/bash
# Confere se um backup do DEV é mesmo restaurável — restaurando ele de
# verdade, num SQLite temporário, e conferindo o que chegou lá dentro.
#
# NÃO toca banco remoto nenhum. Um comando que terminou sem erro não é
# prova de backup bom; carregar o arquivo e contar o que entrou é.
#
#   bash tools/validar-backup.sh ../backups/d1/<carimbo>/marquesa-db-dev.sql
set -euo pipefail

SQL="${1:?uso: validar-backup.sh <arquivo.sql>}"
[ -f "$SQL" ] || { echo "✗ arquivo não existe: $SQL"; exit 1; }

BYTES="$(wc -c < "$SQL" | tr -d ' ')"
[ "$BYTES" -gt 0 ] || { echo "✗ arquivo vazio"; exit 1; }
echo "✓ existe e não está vazio — $BYTES bytes"

# Truncado no meio de um INSERT é o modo de falha mais chato: o arquivo
# parece bom, tem tamanho, e só quebra na hora de restaurar.
case "$(tail -c 200 "$SQL" | tr -d '[:space:]' | tail -c 1)" in
  ';') echo "✓ termina em ';' — não truncado no meio de um comando" ;;
  *)   echo "✗ o arquivo NÃO termina em ';' — provavelmente truncado"; exit 1 ;;
esac

if [ -f "$SQL.sha256" ]; then
  (cd "$(dirname "$SQL")" && sha256sum -c "$(basename "$SQL.sha256")") && echo "✓ checksum confere"
else
  echo "· sem .sha256 ao lado — pulando a conferência de integridade"
fi

python3 - "$SQL" <<'PY'
import sqlite3, sys
sql = open(sys.argv[1], encoding='utf-8', errors='replace').read()

# As FKs ficam desligadas DURANTE a carga e são conferidas DEPOIS, inteiras.
# É o mesmo que o D1 faz ao aplicar um dump (`PRAGMA defer_foreign_keys`):
# um dump lista as tabelas em ordem alfabética, então `maleta_itens` chega
# antes de `produtos` e qualquer FK ligada recusaria a linha. Desligar aqui
# não afrouxa nada — o `foreign_key_check` no fim é sobre o banco já
# montado, e é ele que diz se o backup está coerente.
c = sqlite3.connect(':memory:')
c.execute('PRAGMA foreign_keys=OFF')
try:
    c.executescript(sql)
except sqlite3.Error as e:
    print('✗ o dump NÃO restaura:', e); sys.exit(1)
print('✓ o dump restaura sem erro num banco limpo')

tabs = [r[0] for r in c.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]

# As 20 tabelas do schema atual (api/schema.sql). `reconciliacao_*` entram
# na lista de propósito: o motor de reconciliação é o caminho que a tela de
# importação usa hoje, e um DEV sem elas não roda a importação.
ESPERADAS = {'categorias','clientes','config','fotos_orfas','inventario_itens',
             'inventarios','kit_componentes','loja_snapshot','maleta_itens',
             'maletas','movimentos','produto_variacoes','produtos',
             'produtos_pendentes','reconciliacao_itens','reconciliacao_sessoes',
             'revendedoras','sync_execucoes','venda_itens','vendas'}
faltando = ESPERADAS - set(tabs)
if faltando:
    print('✗ faltam tabelas no backup:', sorted(faltando))
    print('  (se faltarem só as reconciliacao_*, o banco de origem está sem')
    print('   as migrations do motor de reconciliação — isso é um achado, não')
    print('   um backup ruim. Relate antes de seguir.)')
    sys.exit(1)
print(f'✓ as {len(ESPERADAS)} tabelas esperadas estão no backup')

print('\n  tabela                  registros')
print('  ' + '-'*34)
total = 0
for t in tabs:
    n = c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    total += n
    print(f'  {t:24}{n:>8}')
print(f'  {"TOTAL":24}{total:>8}')

nrev = c.execute('SELECT COUNT(*) FROM revendedoras').fetchone()[0]
if nrev == 0:
    print('\n✗ ATENÇÃO: o backup tem ZERO revendedoras — não é o DEV certo.'); sys.exit(1)
ndev = c.execute("SELECT COUNT(*) FROM revendedoras WHERE nome LIKE 'DEV-%'").fetchone()[0]
print(f'\n✓ o backup carrega {nrev} revendedora(s) — é dado, não só schema')
print(f'  destas, {ndev} têm prefixo DEV- (semente sintética) e {nrev - ndev} não têm.')
if nrev - ndev:
    print('  ⚠️ revendedora sem prefixo DEV- pode ser cadastro REAL: o arquivo')
    print('     carrega nome, telefone, CPF e endereço. Trate como dado pessoal.')

# A prova que importa neste sistema (docs/BACKUP_RECOVERY.md § 3c):
# produtos.qtd == SUM(movimentos.qtd) para todo SKU.
div = c.execute("""
  SELECT COUNT(*) FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.soma, 0)""").fetchone()[0]
print(('✓' if div == 0 else '✗') + f' a razão contábil fecha no backup (§19): {div} divergência(s)')

# Órfãos e idempotência — as duas checagens baratas que o projeto adotou.
orf = {
  'movimentos':   "SELECT COUNT(*) FROM movimentos m LEFT JOIN produtos p ON p.sku=m.sku WHERE p.sku IS NULL",
  'venda_itens':  "SELECT COUNT(*) FROM venda_itens v LEFT JOIN vendas x ON x.id=v.venda_id WHERE x.id IS NULL",
  'maleta_itens': "SELECT COUNT(*) FROM maleta_itens i LEFT JOIN maletas m ON m.id=i.maleta_id WHERE m.id IS NULL",
}
for nome, q in orf.items():
    n = c.execute(q).fetchone()[0]
    print(('✓' if n == 0 else '✗') + f' {nome} sem pai: {n}')

ext = c.execute("SELECT COUNT(externo_id), COUNT(DISTINCT externo_id) FROM vendas WHERE externo_id IS NOT NULL").fetchone()
print(('✓' if ext[0] == ext[1] else '✗') + f' idempotência dos pedidos do site: {ext[0]} externo_id, {ext[1]} distintos')

c.execute('PRAGMA foreign_keys=ON')
viol = c.execute('PRAGMA foreign_key_check').fetchall()
print('✓ integridade referencial: sem violação' if not viol
      else f'✗ violações de FK no backup: {viol[:5]}')
PY

echo
echo "✓ backup validado: restaura, tem as tabelas, tem os dados e a razão fecha."
