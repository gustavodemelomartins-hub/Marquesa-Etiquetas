/* Semeia o ambiente local PELA API REAL.
 *
 *  Nada aqui escreve SQL: cada cliente, venda, pagamento, garantia e troca
 *  entra pelas mesmas rotas que o painel usa, e portanto pelas mesmas regras
 *  de negócio. Se uma regra recusar, o seed falha — que é o que se quer: o
 *  dado da tela precisa ser um dado que o sistema aceitaria de verdade.
 *
 *  O que este cenário foi desenhado para mostrar:
 *   · §30, as três datas — vendeu 10/09, recebeu 12/09, lançou 16/09;
 *   · §38, os três números — comprou, pago e em aberto, que não fecham;
 *   · pagamento parcial, que não é "em aberto" nem "pago";
 *   · garantia em andamento e garantia que virou troca por peça mais barata,
 *     que é de onde nasce crédito de verdade;
 *   · §2, homônimas — duas "Camila Souza", para a ficha poder avisar.
 */
const API = process.env.API || 'http://127.0.0.1:8787';
const CHAVE = process.env.CHAVE || 'chave-local-de-teste';

async function chamar(metodo, caminho, corpo) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: `Bearer ${CHAVE}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${metodo} ${caminho} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const cliente = (d) => chamar('POST', '/api/clientes', d);
const venda = (d) => chamar('POST', '/api/vendas', d);

/* ── as clientes ─────────────────────────────────────────────────────── */
const vitoria = await cliente({
  nome: 'Vitória Prado', tel: '11988887777', cidade: 'Hortolândia',
  email: 'vitoria.prado@exemplo.com', instagram: '@vitoriaprado',
  obs: 'Prefere dourado. Usa brinco pequeno, nunca argola grande.',
});
const camilaSP = await cliente({ nome: 'Camila Souza', tel: '11977776666', cidade: 'Campinas' });
const camilaSantos = await cliente({ nome: 'Camila Souza', tel: '13966665555', cidade: 'Santos' });
const renata = await cliente({ nome: 'Renata Lima', tel: '11955554444', cidade: 'Sumaré' });
const bruna = await cliente({ nome: 'Bruna Carvalho', tel: '19944443333', cidade: 'Paulínia' });
const juliana = await cliente({ nome: 'Juliana Alves', tel: '', cidade: 'Hortolândia' });

/* ── Vitória: a ficha rica ───────────────────────────────────────────── */

/* §30 na letra: vendeu 10/09, o dinheiro entrou 12/09, e o lançamento é
   hoje. Três datas, e a ficha tem de mostrar as três como coisas distintas. */
const v1 = await venda({
  clienteId: vitoria.id, clienteNome: vitoria.nome, data: '2026-09-10',
  pago: true, dataPagamento: '2026-09-12',
  observacao: 'Levou para o casamento da irmã.',
  itens: [
    { sku: '100101', qtd: 1, preco: 189.0 },
    { sku: '100201', qtd: 1, preco: 119.0 },
  ],
});

/* Venda a receber, com vencimento: é ela que acende "Em aberto". */
const v2 = await venda({
  clienteId: vitoria.id, clienteNome: vitoria.nome, data: '2026-09-15',
  pago: false, itens: [
    { sku: '100301', qtd: 1, preco: 159.0 },
    { sku: '100401', qtd: 1, preco: 139.0 },
    { sku: '100402', qtd: 1, preco: 99.0 },
  ],
});

/* Compra antiga, que dá profundidade à relação e faz a frequência existir. */
const v0 = await venda({
  clienteId: vitoria.id, clienteNome: vitoria.nome, data: '2026-06-02',
  pago: true, dataPagamento: '2026-06-02',
  itens: [{ sku: '100102', qtd: 2, preco: 149.0 }],
});

/* ── a garantia que vira troca, e a troca que vira crédito ───────────── */
const itens = await chamar('GET', `/api/clientes/perfil?id=${vitoria.id}`);
const compraDeSetembro = itens.vendas.find((v) => v.id === v1.id ?? v1.vendaId);

const g1 = await chamar('POST', '/api/garantias', {
  vendaId: v1.id ?? v1.vendaId, sku: '100101',
  motivo: 'Fecho abrindo sozinho', dataEntrada: '2026-09-16',
});
/* Trocada por peça MAIS BARATA: a diferença negativa é o que a regra de
   12/09/2026 manda virar crédito da cliente. */
await chamar('POST', `/api/garantias/${g1.garantia?.id ?? g1.id}/troca`, {
  skuNovo: '100102', data: '2026-09-18',
});

/* Uma garantia ainda EM ANDAMENTO, com prazo correndo. */
await chamar('POST', '/api/garantias', {
  vendaId: v2.id ?? v2.vendaId, sku: '100401',
  motivo: 'Elo solto na terceira volta', dataEntrada: '2026-09-18',
});

/* ── as outras clientes, para a lista não ser uma pessoa só ──────────── */
await venda({
  clienteId: camilaSP.id, clienteNome: camilaSP.nome, data: '2026-09-05',
  pago: true, dataPagamento: '2026-09-05',
  itens: [{ sku: '100202', qtd: 2, preco: 89.0 }],
});
await venda({
  clienteId: camilaSantos.id, clienteNome: camilaSantos.nome, data: '2026-08-21',
  pago: false, itens: [{ sku: '100302', qtd: 1, preco: 129.0 }],
});
await venda({
  clienteId: renata.id, clienteNome: renata.nome, data: '2026-09-17',
  pago: true, dataPagamento: '2026-09-19',
  itens: [{ sku: '100201', qtd: 3, preco: 119.0 }, { sku: '100402', qtd: 1, preco: 99.0 }],
});
/* Bruna comprou há muito tempo: é ela quem mostra "em risco"/"inativa". */
await venda({
  clienteId: bruna.id, clienteNome: bruna.nome, data: '2026-02-14',
  pago: true, dataPagamento: '2026-02-14',
  itens: [{ sku: '100101', qtd: 1, preco: 189.0 }],
});
/* Juliana está cadastrada e nunca comprou: o estado "sem histórico". */

/* ── o pagamento PARCIAL, que é um estado próprio ────────────────────── */
const vParcial = await venda({
  clienteId: camilaSP.id, clienteNome: camilaSP.nome, data: '2026-09-14',
  pago: false, itens: [{ sku: '100101', qtd: 2, preco: 189.0 }],
});
await chamar('POST', `/api/vendas/${vParcial.id ?? vParcial.vendaId}/pagamento`, {
  valor: 200.0, dataPagamento: '2026-09-16', forma: 'pix',
}).catch((e) => console.log('  (pagamento parcial recusado:', e.message, ')'));

const perfil = await chamar('GET', `/api/clientes/perfil?id=${vitoria.id}`);
const credito = await chamar('GET', `/api/clientes/${vitoria.id}/credito`);
const lista = await chamar('GET', '/api/clientes?limite=100');

console.log(JSON.stringify({
  clientes: lista.length,
  vitoria: {
    comprou: perfil.resumo.comprou, pago: perfil.resumo.pago, emAberto: perfil.resumo.emAberto,
    vendas: perfil.resumo.vendas, pecas: perfil.resumo.pecas, estado: perfil.resumo.estado,
    garantias: perfil.garantias.length, pendentes: perfil.garantiasPendentes.length,
    creditoReais: credito.saldoCentavos / 100,
  },
}, null, 1));
