#!/bin/bash
# Fase 1 do go-live: o retrato dos DOIS bancos, lado a lado, e a diferença
# entre eles. Ver docs/PLANO-MESTRE-MARQUESA.md § 7.3 Fase 1.
#
# SOMENTE LEITURA. Todo comando aqui é SELECT. Nenhum INSERT, UPDATE,
# DELETE, CREATE, DROP ou ALTER, em nenhum dos dois bancos. Não lê Secret,
# não toca no R2, não chama a Nuvemshop, não publica nada.
#
# Por que existe: promover o DEV para produção sem antes olhar os dois lados
# perderia dado em silêncio. As duas bases divergiram — o DEV tem a operação
# da Sthefany, e o `marquesa-db` pode ter vendas do site que o cron puxou e
# que o DEV não conhece (Risco R3 do plano). Este script produz os números
# que tornam essa perda impossível de acontecer sem alguém ver.
#
# A saída também é o CRITÉRIO DE ACEITAÇÃO da Fase 4: depois de carregar o
# dump no banco novo, as contagens têm que bater com as daqui.
#
#   cd api && bash tools/inventario-golive.sh
#
# Precisa de `npx wrangler login` (ou CLOUDFLARE_API_TOKEN com D1) feito por
# uma pessoa. Um agente não roda isto contra produção por conta própria —
# `wrangler d1 execute --remote` em marquesa-db está no deny do
# .claude/settings.json, e continua estando.
set -euo pipefail

DB_PROD="marquesa-db"
DB_DEV="marquesa-db-dev"
UUID_PROD="089153a9-cee5-4887-b789-a23b1cf419f5"
UUID_DEV="dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b"

API="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$API/.." && pwd)"
CARIMBO="$(date +%Y-%m-%d_%H-%M)"
DEST="${DEST:-$REPO/backups/golive/${CARIMBO}_inventario}"

cd "$API"
mkdir -p "$DEST"
REL="$DEST/RELATORIO.txt"

# Achata o JSON do wrangler, que às vezes vem como lista de resultados e às
# vezes como objeto único — a mesma normalização de tools/backup-dev.sh.
sofrer() { python3 -c 'import json,sys
d=json.load(sys.stdin)
print(json.dumps((d[0] if isinstance(d,list) else d)["results"], indent=2, ensure_ascii=False))'; }

# consultar <banco> <"--env staging"|""> <sql>
consultar() {
  local db="$1" amb="$2" sql="$3"
  # shellcheck disable=SC2086
  npx wrangler d1 execute "$db" $amb --remote --json --command "$sql" 2>/dev/null | sofrer
}

# --------------------------------------------------------------- 1. provar
# Nome parecido, consequência oposta. O uuid é conferido antes de qualquer
# leitura, para nenhum número deste relatório sair rotulado com o banco
# errado — que seria pior do que não ter relatório nenhum.
provar() {
  local db="$1" esperado="$2" amb="$3"
  local uuid
  # shellcheck disable=SC2086
  uuid="$(npx wrangler d1 info "$db" $amb --json 2>/dev/null \
          | grep -o '"uuid"[^,]*' | cut -d'"' -f4 || true)"
  if [ "$uuid" != "$esperado" ]; then
    echo "✗ PARE. '$db' resolveu para '${uuid:-vazio}', esperado '$esperado'."
    echo '  Confira o wrangler.toml e a autenticacao (npx wrangler whoami). Nada foi lido.'
    exit 1
  fi
  echo "✓ $db = $uuid"
}

echo "→ provando os dois alvos…"
provar "$DB_PROD" "$UUID_PROD" ""
provar "$DB_DEV"  "$UUID_DEV"  "--env staging"

# ------------------------------------------------------ 2. retrato de cada
# `esperado` de cada consulta está escrito ao lado, no relatório, para quem
# ler depois não precisar reconstruir o raciocínio.
retrato() {
  local rotulo="$1" db="$2" amb="$3" pasta="$DEST/$rotulo"
  mkdir -p "$pasta"

  echo "→ [$rotulo] tabelas…"
  # Um banco pode estar sem as últimas migrations. Contar uma tabela que não
  # existe derruba a consulta inteira, e "no such table" não diz qual das
  # vinte faltou — por isso a lista vem primeiro e a contagem é montada dela.
  # shellcheck disable=SC2086
  npx wrangler d1 execute "$db" $amb --remote --json --file="$API/tools/tabelas.sql" 2>/dev/null \
    | sofrer > "$pasta/tabelas.json"
  local tabelas
  tabelas="$(python3 -c 'import json,sys; print(" ".join(r["name"] for r in json.load(open(sys.argv[1]))))' "$pasta/tabelas.json")"
  echo "   $(printf '%s' "$tabelas" | wc -w) tabelas"

  echo "→ [$rotulo] contagem por tabela…"
  # Uma linha só com uma subconsulta por tabela: o D1 recusa um SELECT
  # composto com este tanto de UNION ALL ("too many terms in compound
  # SELECT").
  local q="SELECT $(for t in $tabelas; do printf "(SELECT COUNT(*) FROM %s) AS %s," "$t" "$t"; done | sed 's/,$//')"
  consultar "$db" "$amb" "$q" > "$pasta/contagem.json"

  echo "→ [$rotulo] a razão contábil fecha?…"
  # §19. Zero linhas = produtos.qtd == SUM(movimentos.qtd) para todo SKU.
  # É a prova que decide se um banco presta. Se der diferente de zero em
  # qualquer um dos dois, o go-live PARA aqui.
  consultar "$db" "$amb" \
    "SELECT p.sku, p.qtd AS saldo, COALESCE(m.soma,0) AS soma_movimentos
       FROM produtos p
       LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
      WHERE p.qtd <> COALESCE(m.soma,0)" > "$pasta/razao-divergentes.json"

  echo "→ [$rotulo] vendas por origem…"
  consultar "$db" "$amb" \
    "SELECT origem, COUNT(*) AS n, SUM(total) AS soma,
            MIN(data) AS primeira, MAX(data) AS ultima,
            SUM(cancelada) AS canceladas
       FROM vendas GROUP BY origem ORDER BY origem" > "$pasta/vendas-por-origem.json"

  echo "→ [$rotulo] maletas por status…"
  # Maleta 'aberta' ou 'em_acerto' é consignação VIVA: peça que está
  # fisicamente com alguém. Precisa sobreviver ao corte inteira.
  consultar "$db" "$amb" \
    "SELECT m.status, COUNT(DISTINCT m.id) AS maletas,
            COALESCE(SUM(mi.qtd - mi.devolvida),0) AS pecas_fora
       FROM maletas m LEFT JOIN maleta_itens mi ON mi.maleta_id = m.id
      GROUP BY m.status ORDER BY m.status" > "$pasta/maletas-por-status.json"

  echo "→ [$rotulo] testemunhas do congelamento…"
  # Os números que provam, na hora do corte, que nada entrou durante a
  # cópia: relidos depois do dump, têm que estar idênticos.
  consultar "$db" "$amb" \
    "SELECT (SELECT COALESCE(MAX(id),0) FROM vendas)     AS max_venda,
            (SELECT COALESCE(MAX(id),0) FROM movimentos) AS max_movimento,
            (SELECT COALESCE(MAX(criado_em),'') FROM movimentos) AS ultimo_movimento_em
    " > "$pasta/testemunhas.json"

  echo "→ [$rotulo] órfãos e idempotência…"
  # Órfão = filho apontando para pai que não existe. Zero é o esperado.
  # A segunda linha prova, no dado real, que nenhum pedido do site foi
  # cobrado duas vezes (o índice único de vendas.externo_id fazendo efeito).
  consultar "$db" "$amb" \
    "SELECT (SELECT COUNT(*) FROM movimentos   WHERE sku      NOT IN (SELECT sku FROM produtos)) AS mov_orfaos,
            (SELECT COUNT(*) FROM venda_itens  WHERE venda_id NOT IN (SELECT id  FROM vendas))   AS item_orfaos,
            (SELECT COUNT(*) FROM maleta_itens WHERE maleta_id NOT IN (SELECT id FROM maletas))  AS maleta_orfaos,
            (SELECT COUNT(externo_id) FROM vendas)          AS externo_total,
            (SELECT COUNT(DISTINCT externo_id) FROM vendas) AS externo_distintos
    " > "$pasta/integridade.json"

  echo "→ [$rotulo] últimas rodadas de sincronização…"
  # O que o robô andou fazendo. Em produção é isto que responde se o cron
  # vinha empurrando estoque velho para a loja ou se o freio o barrava.
  consultar "$db" "$amb" \
    "SELECT id, iniciado_em, terminado_em, status,
            pedidos_lidos, vendas_criadas, produtos_enviados
       FROM sync_execucoes ORDER BY id DESC LIMIT 30" > "$pasta/sync-execucoes.json" || \
    echo '[]' > "$pasta/sync-execucoes.json"

  echo "→ [$rotulo] vendas do site (para o diff)…"
  # O material do Risco R3: o que existe de um lado e não do outro.
  consultar "$db" "$amb" \
    "SELECT externo_id, id, data, total, cliente_nome, cancelada
       FROM vendas WHERE origem = 'site' AND externo_id IS NOT NULL
      ORDER BY externo_id" > "$pasta/vendas-site.json"

  echo "→ [$rotulo] estoque, em números redondos…"
  consultar "$db" "$amb" \
    "SELECT COUNT(*) AS skus,
            SUM(CASE WHEN status='ativo' THEN 1 ELSE 0 END) AS ativos,
            SUM(qtd) AS pecas_total,
            SUM(CASE WHEN preco IS NULL THEN 1 ELSE 0 END) AS sem_preco
       FROM produtos" > "$pasta/estoque-resumo.json"
}

retrato "producao" "$DB_PROD" ""
retrato "dev"      "$DB_DEV"  "--env staging"

# ------------------------------------------------------------- 3. o diff
echo "→ comparando as vendas do site dos dois lados…"
node "$API/tools/diff-vendas-site.mjs" \
  "$DEST/producao/vendas-site.json" \
  "$DEST/dev/vendas-site.json" > "$DEST/diff-vendas-site.txt"

# ---------------------------------------------------------- 4. o relatório
{
  echo "Inventário do go-live — retrato dos dois bancos"
  echo "==============================================="
  echo
  echo "Gerado em      $(date +"%Y-%m-%d %H:%M:%S %Z")  ·  $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Commit         $(git -C "$REPO" rev-parse HEAD)"
  echo "Branch         $(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
  echo "Wrangler       $(npx wrangler --version 2>/dev/null | tail -1)"
  echo
  echo "PRODUÇÃO       $DB_PROD  ($UUID_PROD)"
  echo "DEV            $DB_DEV   ($UUID_DEV)"
  echo
  echo "Somente leitura. Nenhuma escrita em nenhum dos dois bancos."
  echo
  for lado in producao dev; do
    echo "--------------------------------------------------------------- $lado"
    echo
    echo "Contagem por tabela:"; cat "$DEST/$lado/contagem.json"; echo
    echo "Estoque:";             cat "$DEST/$lado/estoque-resumo.json"; echo
    echo "Vendas por origem:";   cat "$DEST/$lado/vendas-por-origem.json"; echo
    echo "Maletas por status:";  cat "$DEST/$lado/maletas-por-status.json"; echo
    echo "Integridade:";         cat "$DEST/$lado/integridade.json"; echo
    echo "Testemunhas do congelamento:"; cat "$DEST/$lado/testemunhas.json"; echo
    n="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$DEST/$lado/razao-divergentes.json")"
    if [ "$n" = "0" ]; then
      echo "Razão contábil: FECHA (0 divergências)  ← critério de aceitação"
    else
      echo "Razão contábil: *** $n DIVERGÊNCIAS *** — ver razao-divergentes.json"
      echo "                O go-live PARA aqui até isso ser explicado."
    fi
    echo
  done
  echo "----------------------------------------------- diff das vendas do site"
  echo
  cat "$DEST/diff-vendas-site.txt"
} > "$REL"

echo
echo "✓ relatório: $REL"
echo "✓ dados brutos: $DEST/{producao,dev}/*.json"
echo
echo "Leia o relatório antes de qualquer próximo passo. Se a razão não fechar"
echo "em algum dos dois lados, ou o diff acusar venda só em produção, o corte"
echo "não começa — as duas coisas mudam o que precisa ser feito."
