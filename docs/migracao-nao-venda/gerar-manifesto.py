# -*- coding: utf-8 -*-
"""Gera o manifesto dos itens historicos a reclassificar, a partir do dump de PROD."""
import sqlite3, json, sys, hashlib
sys.stdout.reconfigure(encoding='utf-8')
con = sqlite3.connect('prod.db')
con.row_factory = sqlite3.Row

# cliente_id -> (classe, confianca_base, porque)
ALVO = {
    64:  ('uso_proprio', 'alta',
          'cliente #64 "Sthefany Marques" e a propria proprietaria da Marquesa; '
          'a linha registra retirada pessoal, nao compra de terceiro'),
    300: ('brinde', 'alta',
          'o nome do cadastro #300 e a propria ocasiao do brinde ("Brinde dia das maes")'),
    311: ('brinde', 'alta',
          'o nome do cadastro #311 e a propria ocasiao do brinde ("Brinde festa junina")'),
    326: ('perda', 'alta',
          'cadastro #326 "Inventario": diferenca de inventario lancada como se fosse compra'),
}
DUVIDA = ('acho que', 'talvez', 'nao sei', 'não sei', 'nao tenho certeza')

itens = []
for h in con.execute(
        "SELECT h.id, h.origem_linha, h.lote_id, h.data, h.data_original, h.cliente_id, "
        "h.cliente_nome_original, h.cliente_nome_norm, h.sku, h.sku_base, "
        "h.nome_produto_historico, h.qtd, h.preco_unit, h.valor_total, "
        "h.pagamento_forma, h.status_pagamento_original, h.observacao_original, "
        "h.canal, h.contexto, h.venda_historica_id, "
        "vh.classe vclasse, vh.valor_pago vpago, vh.elegivel_ticket vet, vh.status vstatus "
        "FROM vendas_historico_itens h "
        "JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status='importado' "
        "LEFT JOIN vendas_historicas vh ON vh.id=h.venda_historica_id "
        "WHERE h.cliente_id IN (64,300,311,326) ORDER BY h.id"):
    classe, conf, porque = ALVO[h["cliente_id"]]
    obs = (h["observacao_original"] or '').lower()
    revisar = None
    if any(d in obs for d in DUVIDA):
        conf, revisar = 'baixa', 'a propria observacao esta em duvida — ninguem pode decidir pela planilha'
    elif 'sorteio' in obs:
        conf, revisar = 'media', 'observacao fala em SORTEIO: pode ser premio (brinde) e nao retirada pessoal'
    itens.append({
        'historicoItemId': h["id"], 'origemLinha': h["origem_linha"], 'loteId': h["lote_id"],
        'data': h["data"], 'dataOriginal': h["data_original"],
        'clienteId': h["cliente_id"], 'clienteNome': h["cliente_nome_original"],
        'sku': h["sku"], 'skuBase': h["sku_base"], 'produto': h["nome_produto_historico"],
        'qtd': h["qtd"], 'precoUnit': h["preco_unit"], 'valorTotal': h["valor_total"],
        'pagamentoForma': h["pagamento_forma"], 'statusPagamento': h["status_pagamento_original"],
        'observacao': h["observacao_original"],
        'vendaHistoricaId': h["venda_historica_id"], 'vendaClasse': h["vclasse"],
        'vendaValorPago': h["vpago"], 'vendaElegivelTicket': h["vet"], 'vendaStatus': h["vstatus"],
        'classeProposta': classe, 'confianca': conf, 'motivo': porque,
        'precisaDecisaoHumana': revisar,
        'jaForaDoFaturamento': h["vclasse"] == 'ajuste',
    })

por_classe = {}
for i in itens:
    d = por_classe.setdefault(i['classeProposta'], {'linhas': 0, 'pecas': 0, 'valorItens': 0.0})
    d['linhas'] += 1
    d['pecas'] += i['qtd'] or 0
    d['valorItens'] += float(i['valorTotal'] or 0)

vendas = {}
for i in itens:
    if i['vendaHistoricaId'] and not i['jaForaDoFaturamento']:
        vendas[i['vendaHistoricaId']] = float(i['vendaValorPago'] or 0)

man = {
    'gerado_de': 'export do D1 de PRODUCAO (marquesa-db-prod, 51dd629b-52dc-46d0-a1af-fa37f0a79533)',
    'lote_valido': 2,
    'total_itens': len(itens),
    'por_classe': por_classe,
    'faturamento_que_sai': round(sum(vendas.values()), 2),
    'vendas_historicas_afetadas': sorted(vendas.keys()),
    'precisam_decisao_humana': [i['historicoItemId'] for i in itens if i['precisaDecisaoHumana']],
    'itens': itens,
}
blob = json.dumps(man, ensure_ascii=False, indent=2)
man['hash_manifesto'] = hashlib.sha256(blob.encode('utf-8')).hexdigest()[:16]
open('manifesto-nao-venda.json', 'w', encoding='utf-8').write(
    json.dumps(man, ensure_ascii=False, indent=2))

print('itens:', len(itens))
print('por classe:', json.dumps(por_classe, ensure_ascii=False))
print('faturamento que sai: R$', man['faturamento_que_sai'])
print('vendas historicas afetadas:', len(vendas))
print('precisam decisao humana:', man['precisam_decisao_humana'])
print('hash:', man['hash_manifesto'])
