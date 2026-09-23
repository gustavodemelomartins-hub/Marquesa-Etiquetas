# -*- coding: utf-8 -*-
"""FASE 1 — recorte FOCADO nos cadastros-alvo, sobre o dump de PRODUCAO."""
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')
con = sqlite3.connect('prod.db')
con.row_factory = sqlite3.Row
ALVOS = {64: 'Sthefany Marques -> uso_proprio',
         300: 'Brinde dia das maes -> brinde',
         311: 'Brinde festa junina -> brinde',
         326: 'Inventario -> perda'}


def sec(t):
    print("\n" + "=" * 78 + "\n" + t + "\n" + "=" * 78)


def rows(q, p=()):
    return con.execute(q, p).fetchall()


sec("A. Variacoes de nome da propria Sthefany em QUALQUER tabela")
print("  clientes:")
for r in rows("SELECT id,nome,nome_norm FROM clientes WHERE lower(nome) LIKE '%sthe%' "
              "OR lower(nome) LIKE '%sthef%' OR lower(nome) LIKE '%steph%'"):
    print("    #%s %s (norm=%s)" % (r["id"], r["nome"], r["nome_norm"]))
print("  revendedoras:")
for r in rows("SELECT * FROM revendedoras"):
    print("    #%s %s" % (r["id"], r["nome"]))
print("  vendas_historico_itens.cliente_nome_original distintos com 'sthe/steph':")
for r in rows("SELECT DISTINCT cliente_nome_original n, cliente_id, COUNT(*) c "
              "FROM vendas_historico_itens WHERE lower(cliente_nome_original) LIKE '%sthe%' "
              "OR lower(cliente_nome_original) LIKE '%steph%' GROUP BY 1,2"):
    print("    '%s' cliente_id=%s linhas=%s" % (r["n"], r["cliente_id"], r["c"]))
print("  revendedora_nome nos itens historicos:")
for r in rows("SELECT DISTINCT COALESCE(revendedora_nome,'(null)') n, COUNT(*) c "
              "FROM vendas_historico_itens GROUP BY 1 ORDER BY c DESC LIMIT 10"):
    print("    '%s' x%s" % (r["n"], r["c"]))

sec("B. NUMEROS por cadastro-alvo — lote 2 (importado), que e o que vale")
tot_l = tot_p = 0
tot_v = tot_pg = 0.0
for cid, rot in ALVOS.items():
    r = rows("SELECT COUNT(*) linhas, COALESCE(SUM(h.qtd),0) pecas, "
             "ROUND(COALESCE(SUM(h.valor_total),0),2) valor, "
             "COUNT(DISTINCT h.venda_historica_id) vendas, "
             "MIN(h.data) de, MAX(h.data) ate "
             "FROM vendas_historico_itens h "
             "JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status='importado' "
             "WHERE h.cliente_id=?", (cid,))[0]
    pg = rows("SELECT ROUND(COALESCE(SUM(vh.valor_pago),0),2) pago, "
              "ROUND(COALESCE(SUM(vh.valor_total),0),2) tot, "
              "SUM(CASE WHEN vh.elegivel_ticket=1 THEN 1 ELSE 0 END) tickets, "
              "COUNT(*) n, GROUP_CONCAT(DISTINCT vh.classe) classes "
              "FROM vendas_historicas vh WHERE vh.cliente_id=?", (cid,))[0]
    print("\n  cliente #%s — %s" % (cid, rot))
    print("    itens historicos : %s linhas | %s pecas | valor_total_itens=R$ %s | %s vendas | %s..%s"
          % (r["linhas"], r["pecas"], r["valor"], r["vendas"], r["de"], r["ate"]))
    print("    cabecalhos venda : %s vendas | valor_total=R$ %s | valor_pago=R$ %s | "
          "elegivel_ticket=%s | classes=%s"
          % (pg["n"], pg["tot"], pg["pago"], pg["tickets"], pg["classes"]))
    tot_l += r["linhas"]; tot_p += r["pecas"]
    tot_v += float(r["valor"] or 0); tot_pg += float(pg["pago"] or 0)
print("\n  TOTAL alvos: %s linhas | %s pecas | valor_itens=R$ %.2f | valor_pago_cabecalhos=R$ %.2f"
      % (tot_l, tot_p, tot_v, tot_pg))

sec("C. Sthefany — linha a linha (lote importado)")
for r in rows("SELECT h.id, h.origem_linha, h.data, h.sku, h.nome_produto_historico p, h.qtd, "
              "h.preco_unit, h.valor_total, h.venda_historica_id vh, "
              "COALESCE(h.observacao_original,'') obs, COALESCE(h.pagamento_forma,'') pag, "
              "vhh.classe, vhh.status, vhh.valor_pago, vhh.elegivel_ticket et "
              "FROM vendas_historico_itens h "
              "JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status='importado' "
              "LEFT JOIN vendas_historicas vhh ON vhh.id=h.venda_historica_id "
              "WHERE h.cliente_id=64 ORDER BY h.data IS NULL DESC, h.data, h.id"):
    print("  h#%-5s lin=%-5s %-10s sku=%-10s qtd=%s unit=%-7s tot=%-7s pago=%-7s et=%s vh#%-5s %s | %s"
          % (r["id"], r["origem_linha"], r["data"] or "(sem data)", r["sku"], r["qtd"],
             r["preco_unit"], r["valor_total"], r["valor_pago"], r["et"], r["vh"],
             (r["p"] or "")[:28], r["obs"][:40]))

sec("D. Brinde + Inventario — linha a linha")
for r in rows("SELECT h.id, h.origem_linha, h.data, h.sku, h.nome_produto_historico p, h.qtd, "
              "h.preco_unit, h.valor_total, h.cliente_id, h.venda_historica_id vh, "
              "COALESCE(h.observacao_original,'') obs, vhh.classe, vhh.valor_pago, "
              "vhh.elegivel_ticket et "
              "FROM vendas_historico_itens h "
              "JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status='importado' "
              "LEFT JOIN vendas_historicas vhh ON vhh.id=h.venda_historica_id "
              "WHERE h.cliente_id IN (300,311,326) ORDER BY h.data, h.id"):
    print("  h#%-5s cli=%-4s lin=%-5s %-10s sku=%-10s qtd=%s unit=%-7s tot=%-7s classe=%-7s "
          "pago=%-6s et=%s vh#%s | %s | %s"
          % (r["id"], r["cliente_id"], r["origem_linha"], r["data"], r["sku"], r["qtd"],
             r["preco_unit"], r["valor_total"], r["classe"], r["valor_pago"], r["et"],
             r["vh"], (r["p"] or "")[:26], r["obs"][:34]))

sec("E. OUTRAS linhas suspeitas de nao-venda (observacao), fora dos alvos")
for r in rows("SELECT h.id, h.data, h.cliente_id, h.cliente_nome_original n, h.sku, h.qtd, "
              "h.valor_total, COALESCE(h.observacao_original,'') obs, vhh.classe "
              "FROM vendas_historico_itens h "
              "JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status='importado' "
              "LEFT JOIN vendas_historicas vhh ON vhh.id=h.venda_historica_id "
              "WHERE h.cliente_id NOT IN (64,300,311,326) AND ("
              "lower(COALESCE(h.observacao_original,'')) LIKE '%brinde%' OR "
              "lower(COALESCE(h.observacao_original,'')) LIKE '%presente%' OR "
              "lower(COALESCE(h.observacao_original,'')) LIKE '%sorteio%' OR "
              "lower(COALESCE(h.observacao_original,'')) LIKE '%amostra%' OR "
              "lower(COALESCE(h.observacao_original,'')) LIKE '%perdid%' OR "
              "lower(COALESCE(h.observacao_original,'')) LIKE '%cortesia%' OR "
              "lower(COALESCE(h.observacao_original,'')) LIKE '%troca%' OR "
              "lower(COALESCE(h.observacao_original,'')) LIKE '%uso %') "
              "ORDER BY h.data"):
    print("  h#%-5s %-10s cli=%-4s %-24s sku=%-9s qtd=%s tot=%-7s classe=%-7s | %s"
          % (r["id"], r["data"], r["cliente_id"], (r["n"] or "")[:24], r["sku"], r["qtd"],
             r["valor_total"], r["classe"], r["obs"][:48]))

sec("F. Linhas com valor ZERO ou NULO nos alvos (ja nao somam dinheiro)")
r = rows("SELECT SUM(CASE WHEN h.valor_total IS NULL THEN 1 ELSE 0 END) nulos, "
         "SUM(CASE WHEN h.valor_total=0 THEN 1 ELSE 0 END) zeros, "
         "SUM(CASE WHEN COALESCE(h.valor_total,0)>0 THEN 1 ELSE 0 END) positivos, "
         "ROUND(SUM(CASE WHEN COALESCE(h.valor_total,0)>0 THEN h.valor_total ELSE 0 END),2) soma_pos "
         "FROM vendas_historico_itens h "
         "JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status='importado' "
         "WHERE h.cliente_id IN (64,300,311,326)")[0]
print("  nulos=%s  zeros=%s  positivos=%s  soma_dos_positivos=R$ %s"
      % (r["nulos"], r["zeros"], r["positivos"], r["soma_pos"]))

sec("G. Os SKUs envolvidos existem hoje em produtos?")
for r in rows("SELECT h.sku, COUNT(*) linhas, SUM(h.qtd) pecas, "
              "CASE WHEN p.sku IS NULL THEN 'NAO EXISTE' ELSE 'ok qtd='||p.qtd END sit, "
              "COALESCE(p.nome,'') nome "
              "FROM vendas_historico_itens h "
              "JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status='importado' "
              "LEFT JOIN produtos p ON p.sku=h.sku "
              "WHERE h.cliente_id IN (64,300,311,326) GROUP BY h.sku ORDER BY h.sku"):
    print("  sku=%-10s linhas=%-3s pecas=%-3s %-14s %s"
          % (r["sku"], r["linhas"], r["pecas"], r["sit"], r["nome"][:34]))

sec("H. Lote 1 (revertido) — os mesmos cadastros aparecem la?")
for r in rows("SELECT h.cliente_id, COUNT(*) linhas, SUM(h.qtd) pecas, "
              "ROUND(SUM(COALESCE(h.valor_total,0)),2) valor FROM vendas_historico_itens h "
              "JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status<>'importado' "
              "WHERE h.cliente_id IN (64,300,311,326) GROUP BY 1"):
    print("  cliente=%s linhas=%s pecas=%s valor=%s"
          % (r["cliente_id"], r["linhas"], r["pecas"], r["valor"]))
print("  (vazio acima = o lote revertido nao tem linhas desses cadastros)")
