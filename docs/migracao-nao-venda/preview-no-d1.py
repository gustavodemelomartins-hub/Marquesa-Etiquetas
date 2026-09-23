"""PREVIEW do backfill das saídas sem faturamento, lido do D1.

SOMENTE LEITURA. Nada é escrito, em banco nenhum.

Existe porque o manifesto foi gerado em 07/09/2026 contra um dump, e
aplicar uma decisão de duas semanas atrás sobre um banco que mudou é
como escrever sobre um número que não se sabe explicar. Este arquivo
prova, ANTES de qualquer escrita, que o alvo continua sendo o alvo.

O que ele responde:

  1. os 37 itens do manifesto ainda existem, com os mesmos valores?
  2. quanto sai do faturamento, e quanto NÃO sai (porque nunca esteve lá)?
  3. o antes/depois de cada indicador;
  4. há movimento de estoque ligado a eles? (tem de ser zero — e se não
     for, a migração PARA: alguma coisa mudou desde a FASE 1);
  5. as tabelas de destino estão como se espera?
  6. o que fica de fora por precisar de decisão humana.

USO
    python docs/migracao-nao-venda/preview-no-d1.py
    MQDB=<outro-banco> python docs/migracao-nao-venda/preview-no-d1.py

O padrão é `marquesa-db-staging-v2`, o DEV da V2. Produção é lida por
`auditar-prod.py`, que tem o próprio caminho e as próprias travas.
"""
import io, json, subprocess, sys, os

DB = os.environ.get('MQDB', 'marquesa-db-staging-v2')
# A raiz do repositório, a partir deste arquivo — dois níveis acima de
# `docs/migracao-nao-venda/`. Nada de caminho absoluto de uma máquina.
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')).replace('\\', '/')


def consultar(sql):
    sql = ' '.join(sql.split())
    out = subprocess.run(
        ['npx.cmd', 'wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql],
        capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=f'{RAIZ}/api',
    )
    texto = out.stdout
    i = texto.find('[')
    if i < 0:
        print(texto[-1500:], out.stderr[-1500:])
        sys.exit(1)
    dec = json.JSONDecoder()
    linhas, pos = [], i
    while pos >= 0 and pos < len(texto):
        try:
            doc, fim = dec.raw_decode(texto[pos:])
        except ValueError:
            break
        if isinstance(doc, list):
            for b in doc:
                if isinstance(b, dict) and 'results' in b:
                    linhas.extend(b['results'])
        pos = texto.find('[', pos + fim)
    return linhas


man = json.load(io.open(f'{RAIZ}/docs/migracao-nao-venda/manifesto-nao-venda.json', encoding='utf-8'))
itens = man['itens']
ids = [i['historicoItemId'] for i in itens]
lista_ids = ','.join(str(x) for x in ids)

print('=' * 74)
print('PREVIEW — backfill das saídas sem faturamento')
print(f'banco: {DB}   (SOMENTE LEITURA — nada será escrito)')
print('=' * 74)

# ── 1. os itens ainda existem, e com os mesmos valores? ────────────────
achados = consultar(
    f'SELECT id, cliente_id, sku, qtd, valor_total, pago, observacao_original '
    f'FROM vendas_historico_itens WHERE id IN ({lista_ids})')
por_id = {r['id']: r for r in achados}

sumidos = [i for i in ids if i not in por_id]
divergentes = []
for it in itens:
    r = por_id.get(it['historicoItemId'])
    if not r:
        continue
    if r['cliente_id'] != it['clienteId'] or (r['qtd'] or 0) != (it['qtd'] or 0):
        divergentes.append((it['historicoItemId'], r['cliente_id'], it['clienteId'],
                            r['qtd'], it['qtd']))
    vt_banco = round(float(r['valor_total'] or 0), 2)
    vt_man = round(float(it['valorTotal'] or 0), 2)
    if vt_banco != vt_man:
        divergentes.append((it['historicoItemId'], 'valor', vt_man, vt_banco, ''))

print(f'\n1. OS 37 ITENS DO MANIFESTO')
print(f'   encontrados no banco : {len(por_id)} de {len(ids)}')
print(f'   sumidos              : {sumidos or "nenhum"}')
print(f'   divergentes          : {divergentes or "nenhum"}')

# ── 2. quanto sai de cada indicador ────────────────────────────────────
por_classe = {}
pecas = 0
lancado = 0.0
pago_total = 0.0
for it in itens:
    por_classe[it['classeProposta']] = por_classe.get(it['classeProposta'], 0) + 1
    pecas += it['qtd'] or 0
    lancado += float(it['valorTotal'] or 0)
    r = por_id.get(it['historicoItemId'])
    if r and r['pago'] == 1:
        pago_total += float(r['valor_total'] or 0)

print(f'\n2. O QUE SAI')
print(f'   linhas               : {len(itens)}')
print(f'   peças                : {pecas}')
print(f'   valor lançado        : R$ {lancado:,.2f}')
print(f'   valor PAGO (sai do faturamento) : R$ {pago_total:,.2f}')
print(f'   por classe proposta  : {por_classe}')
print(f'   manifesto diz que sai do faturamento: R$ {man["faturamento_que_sai"]}')

# ── 3. antes/depois dos indicadores ────────────────────────────────────
antes = consultar("""
  SELECT
    (SELECT ROUND(SUM(i.valor_total), 2) FROM vendas_historico_itens i
       JOIN vendas_historico_lotes l ON l.id = i.lote_id
      WHERE l.status = 'importado' AND i.pago = 1) AS faturamento,
    (SELECT COUNT(*) FROM vendas_historicas) AS vendas,
    (SELECT SUM(i.qtd) FROM vendas_historico_itens i
       JOIN vendas_historico_lotes l ON l.id = i.lote_id
      WHERE l.status = 'importado') AS pecas
""")[0]

print(f'\n3. INDICADORES — ANTES e DEPOIS')
fat_antes = float(antes['faturamento'] or 0)
print(f'   faturamento histórico : R$ {fat_antes:,.2f}  ->  R$ {fat_antes - pago_total:,.2f}')
print(f'   peças no histórico    : {antes["pecas"]}  ->  {int(antes["pecas"]) - pecas}')
print(f'   cabeçalhos de venda   : {antes["vendas"]} (preservados; a exclusão é por FILTRO)')

# ── 4. o estoque NÃO pode se mexer ─────────────────────────────────────
mov = consultar(
    "SELECT COUNT(*) AS n FROM movimentos WHERE origem IN "
    "('historico','importacao_historica','vendas_historicas')")[0]
razao = consultar("""
  SELECT (SELECT COALESCE(SUM(qtd),0) FROM produtos)  AS produtos,
         (SELECT COALESCE(SUM(qtd),0) FROM movimentos) AS movimentos
""")[0]

print(f'\n4. ESTOQUE — tem de ficar intocado')
print(f'   movimentos de origem histórica : {mov["n"]}  (esperado: 0)')
print(f'   razão hoje: produtos={razao["produtos"]}  movimentos={razao["movimentos"]}  '
      f'{"FECHA" if razao["produtos"] == razao["movimentos"] else "*** NAO FECHA ***"}')
print('   o backfill NÃO cria movimento: as 37 peças nunca saíram por causa')
print('   destas linhas, e baixá-las agora inventaria 37 unidades a menos.')

# ── 5. o destino ───────────────────────────────────────────────────────
dest = consultar("""
  SELECT (SELECT COUNT(*) FROM historico_reclassificacao)   AS reclassificacao,
         (SELECT COUNT(*) FROM saidas_sem_faturamento)      AS saidas
""")[0]
print(f'\n5. DESTINO')
print(f'   historico_reclassificacao : {dest["reclassificacao"]} linhas')
print(f'   saidas_sem_faturamento    : {dest["saidas"]} linhas')
print(f'   depois do backfill        : +{len(itens)} em cada uma')

# ── 6. o que NÃO entra sem decisão humana ──────────────────────────────
duvidosos = [i for i in itens if i.get('precisaDecisaoHumana')]
print(f'\n6. FICAM DE FORA — precisam de decisão humana ({len(duvidosos)})')
for i in duvidosos:
    print(f'   h#{i["historicoItemId"]}  {i["data"]}  {i["clienteNome"]}  '
          f'R$ {i["valorTotal"]}  ({i["confianca"]})')
    print(f'      obs: "{i["observacao"]}"')
    print(f'      por quê: {i["precisaDecisaoHumana"]}')

print(f'\n   aplicáveis sem decisão: {len(itens) - len(duvidosos)}')

# ── 7. os IDs, para o registro ─────────────────────────────────────────
print(f'\n7. IDs AFETADOS ({len(ids)})')
print('   ' + ', '.join(str(x) for x in sorted(ids)))
print()
