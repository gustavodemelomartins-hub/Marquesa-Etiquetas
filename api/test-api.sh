#!/bin/bash
set -e
API=http://localhost:8787
KEY=troque-por-uma-chave-de-teste
H="-H Authorization:\ Bearer\ $KEY -H Content-Type:\ application/json"

j() { python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=1))"; }

echo "== health (sem chave) =="
curl -s $API/api/health; echo

echo "== state sem chave -> deve dar 401 =="
curl -s -o /dev/null -w "%{http_code}\n" $API/api/state

echo "== state com chave errada -> 401 =="
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer errada" $API/api/state

echo "== importar produtos =="
curl -s -X POST $API/api/produtos/importar -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"produtos":[
    {"sku":"111111","desc":"Colar Teste API","cat":"Colar","preco":89,"qtd":5},
    {"sku":"222222","desc":"Brinco Teste API","cat":"Brinco","preco":49,"qtd":3}
  ]}' | j

echo "== state depois de importar =="
curl -s $API/api/state -H "Authorization: Bearer $KEY" | j

echo "== criar revendedora =="
REV=$(curl -s -X POST $API/api/revendedoras -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"nome":"Teste API","tel":"11999999999"}')
echo "$REV" | j
REVID=$(echo "$REV" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")

echo "== criar maleta para a revendedora $REVID =="
MAL=$(curl -s -X POST $API/api/maletas -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"revId\":$REVID,\"acertoEm\":\"2026-09-01\"}")
echo "$MAL" | j
MALID=$(echo "$MAL" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")

echo "== bipar 2 do colar (tem 5 em casa) -> deve aceitar =="
curl -s -X POST $API/api/maletas/$MALID/itens -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"itens":{"111111":2}}' | j

echo "== bipar 4 do colar de novo (só sobra 3 em casa) -> deve recusar =="
curl -s -X POST $API/api/maletas/$MALID/itens -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"itens":{"111111":4}}' | j

echo "== state: colar deve mostrar 2 fora, 3 em casa (via maleta_itens) =="
curl -s $API/api/state -H "Authorization: Bearer $KEY" | j

echo "== fechar acerto: 1 devolvida, 1 vendida =="
curl -s -X POST $API/api/maletas/$MALID/acerto -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"devolvidas":{"111111":1},"faltas":[{"sku":"111111","linhas":[{"qtd":1,"destino":"vendida"}]}]}' | j

echo "== produto 111111 deve ter caído para 4 (5 - 1 vendida) =="
curl -s $API/api/state -H "Authorization: Bearer $KEY" | python3 -c "
import json,sys
s=json.load(sys.stdin)
p=[x for x in s['produtos'] if x['sku']=='111111'][0]
print('qtd atual:', p['qtd'], '(esperado 4)')
m=[x for x in s['maletas'] if x['id']==$MALID][0]
print('maleta status:', m['status'], '| acerto:', m['acerto'])
"

echo "== registrar venda direta (fora de maleta) =="
curl -s -X POST $API/api/vendas -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"clienteNome":"Cliente Balcão","itens":[{"sku":"222222","qtd":2}]}' | j

echo "== vendas de hoje =="
curl -s "$API/api/vendas?data=$(date +%F)" -H "Authorization: Bearer $KEY" | j

echo "== venda maior que estoque -> deve recusar =="
curl -s -X POST $API/api/vendas -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"clienteNome":"Cliente X","itens":[{"sku":"222222","qtd":99}]}' | j

echo "== importar retrato da loja =="
curl -s -X POST $API/api/loja/importar -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"snapshot":{"lidoEm":"2026-08-16","produtosNaLoja":614,"produtosCasados":611,"soNaLoja":3,"codigosCasados":630,"duplicados":["216029","716521"]},
       "produtos":[{"sku":"111111","urlLoja":"colar-teste-api","estoqueLoja":4,"visivel":true,"nomeLoja":"Colar Teste API"}]}' | j

echo "== state final =="
curl -s $API/api/state -H "Authorization: Bearer $KEY" | j

echo "TUDO OK"
