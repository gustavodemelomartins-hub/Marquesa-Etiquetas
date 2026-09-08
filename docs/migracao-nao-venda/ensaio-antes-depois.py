# -*- coding: utf-8 -*-
"""Ensaio ANTES/DEPOIS numa COPIA local do dump de producao.
Producao nao e tocada. Prova que a FASE 2 faz o que o relatorio promete."""
import sqlite3, json, shutil, sys, io
sys.stdout.reconfigure(encoding='utf-8')

shutil.copyfile('prod.db', 'ensaio.db')
con = sqlite3.connect('ensaio.db')
con.row_factory = sqlite3.Row
man = json.load(io.open(
    'C:/Users/User/Desktop/Marquesa-Claude-NonRevenue/docs/migracao-nao-venda/'
    'manifesto-nao-venda.json', encoding='utf-8'))

FATURAMENTO = """
SELECT ROUND(SUM(vh.valor_pago),2) faturamento, COUNT(*) vendas, SUM(vh.pecas) pecas,
       SUM(CASE WHEN vh.elegivel_ticket=1 THEN 1 ELSE 0 END) tickets
  FROM vendas_historicas vh WHERE vh.classe='venda'
   AND EXISTS (SELECT 1 FROM vendas_historico_itens hi
                WHERE hi.venda_historica_id=vh.id
                  AND NOT EXISTS (SELECT 1 FROM historico_reclassificacao rc
                                   WHERE rc.historico_item_id=hi.id AND rc.status='aplicada'))"""
RAZAO = ("SELECT (SELECT COALESCE(SUM(qtd),0) FROM produtos) p,"
         "(SELECT COALESCE(SUM(qtd),0) FROM movimentos) m,"
         "(SELECT COUNT(*) FROM movimentos) nm,"
         "(SELECT COUNT(*) FROM vendas_historico_itens) nh,"
         "(SELECT COUNT(*) FROM produtos) np")
LEGITIMOS = ("SELECT ROUND(SUM(vh.valor_pago),2) pago, COUNT(*) n FROM vendas_historicas vh "
             "WHERE vh.cliente_id IN (3,73,96,130,164,195,250,312,314)")
IMPRESSAO = ("SELECT GROUP_CONCAT(h.id||':'||COALESCE(h.sku,'-')||':'"
             "||COALESCE(h.data,'-')||':'||h.qtd,'|') imp FROM vendas_historico_itens h "
             "WHERE h.cliente_id IN (64,300,311,326)")


def snap(rot):
    f = con.execute(FATURAMENTO).fetchone()
    r = con.execute(RAZAO).fetchone()
    g = con.execute(LEGITIMOS).fetchone()
    i = con.execute(IMPRESSAO).fetchone()
    print("\n--- %s" % rot)
    print("  faturamento=R$ %-11s vendas=%-4s pecas=%-5s tickets=%s"
          % (f["faturamento"], f["vendas"], f["pecas"], f["tickets"]))
    print("  razao: produtos=%s movimentos=%s (n=%s)  linhas_historico=%s produtos=%s"
          % (r["p"], r["m"], r["nm"], r["nh"], r["np"]))
    print("  9 Marques legitimos: R$ %s em %s vendas" % (g["pago"], g["n"]))
    return dict(f=dict(f), r=dict(r), g=dict(g), imp=i["imp"])


a = snap("ANTES")

# ── a FASE 2, exatamente como a rota oficial a grava
for it in man['itens']:
    con.execute(
        "INSERT INTO historico_reclassificacao "
        "(historico_item_id, classe_nova, confianca, motivo, status, decidido_em, decidido_por) "
        "VALUES (?,?,?,?, 'aplicada', datetime('now'), 'ensaio')",
        (it['historicoItemId'], it['classeProposta'], it['confianca'], it['motivo']))
con.commit()

d = snap("DEPOIS (37 reclassificacoes aplicadas)")

print("\n" + "=" * 74 + "\nVEREDITO\n" + "=" * 74)
ok = True


def chk(nome, cond, detalhe):
    global ok
    ok = ok and cond
    print("  [%s] %-46s %s" % ("OK" if cond else "FALHA", nome, detalhe))


delta = round(a['f']['faturamento'] - d['f']['faturamento'], 2)
chk("faturamento cai exatamente R$ 1100,00", delta == 1100.0,
    "%.2f -> %.2f  (delta %.2f)" % (a['f']['faturamento'], d['f']['faturamento'], delta))
chk("vendas caem 30", a['f']['vendas'] - d['f']['vendas'] == 30,
    "%s -> %s" % (a['f']['vendas'], d['f']['vendas']))
chk("pecas vendidas caem 34", a['f']['pecas'] - d['f']['pecas'] == 34,
    "%s -> %s" % (a['f']['pecas'], d['f']['pecas']))
chk("tickets caem 17", a['f']['tickets'] - d['f']['tickets'] == 17,
    "%s -> %s" % (a['f']['tickets'], d['f']['tickets']))
chk("estoque intacto (nenhuma baixa dupla)",
    a['r']['p'] == d['r']['p'] and a['r']['m'] == d['r']['m'] and a['r']['nm'] == d['r']['nm'],
    "produtos=%s movimentos=%s n=%s" % (d['r']['p'], d['r']['m'], d['r']['nm']))
chk("razao contabil fecha", d['r']['p'] == d['r']['m'], "%s == %s" % (d['r']['p'], d['r']['m']))
chk("nenhuma linha historica apagada", a['r']['nh'] == d['r']['nh'] == 1375, str(d['r']['nh']))
chk("SKUs e datas identicos (impressao)", a['imp'] == d['imp'], "37 linhas byte a byte")
chk("9 Marques legitimos intocados", a['g'] == d['g'],
    "R$ %s em %s vendas" % (d['g']['pago'], d['g']['n']))
div = con.execute("SELECT COUNT(*) c FROM (SELECT p.sku FROM produtos p "
                  "LEFT JOIN movimentos m ON m.sku=p.sku GROUP BY p.sku,p.qtd "
                  "HAVING p.qtd<>COALESCE(SUM(m.qtd),0))").fetchone()["c"]
chk("zero SKU divergente", div == 0, "%d divergentes" % div)
fora = con.execute("SELECT COUNT(*) c FROM historico_reclassificacao rc "
                   "JOIN vendas_historico_itens h ON h.id=rc.historico_item_id "
                   "WHERE h.cliente_id NOT IN (64,300,311,326)").fetchone()["c"]
chk("nenhum outro cliente afetado", fora == 0, "%d fora dos alvos" % fora)

# ── idempotencia: a segunda rodada nao pode gravar de novo
dup = 0
for it in man['itens']:
    try:
        con.execute("INSERT INTO historico_reclassificacao "
                    "(historico_item_id, classe_nova, confianca, motivo, status) "
                    "VALUES (?,?,?,?, 'aplicada')",
                    (it['historicoItemId'], it['classeProposta'], it['confianca'], 'repeticao'))
        dup += 1
    except sqlite3.IntegrityError:
        pass
con.rollback()
chk("indice unico barra rodada repetida", dup == 0, "%d insercoes duplicadas aceitas" % dup)

# ── rollback
con.execute("DELETE FROM historico_reclassificacao WHERE decidido_por='ensaio'")
con.commit()
v = snap("APOS ROLLBACK")
chk("rollback devolve os numeros exatos", v['f'] == a['f'],
    "faturamento R$ %s / %s vendas" % (v['f']['faturamento'], v['f']['vendas']))
chk("rollback nao devolve peca ao estoque", v['r']['m'] == a['r']['m'] == 1487,
    "movimentos=%s" % v['r']['m'])

print("\n%s" % ("TODOS OS CRITERIOS PASSARAM" if ok else "HOUVE FALHA — NAO APLICAR"))
sys.exit(0 if ok else 1)
