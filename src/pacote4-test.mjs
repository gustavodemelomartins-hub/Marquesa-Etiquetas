/** Pacote 4 — contrato de Central + publicação.
 *
 * Pré-condição: Worker local/staging em API_URL sobre schema.sql limpo.
 * O teste grava somente no D1/R2 locais. Não chama sync e não publica na loja.
 */
const API = process.env.API_URL || 'http://127.0.0.1:8790';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';
const SUFIXO = Date.now().toString(36).toUpperCase();
const SKU_FALTA = `P4F-${SUFIXO}`;
const SKU_PRONTO = `P4P-${SUFIXO}`;
let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x === '' ? '' : ` → ${x}`}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x === '' ? '' : ` → ${x}`}`); };
const eq = (t, a, b) => String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}; veio ${a}`);

async function api(metodo, path, corpo, tipo = 'application/json') {
  const body = corpo == null ? undefined
    : tipo === 'application/json' ? JSON.stringify(corpo) : corpo;
  const resp = await fetch(API + path, {
    method: metodo,
    headers: { Authorization: `Bearer ${KEY}`, ...(body == null ? {} : { 'Content-Type': tipo }) },
    body,
  });
  const json = await resp.json();
  return { status: resp.status, ...json };
}

console.log('\n=== 1. gates derivam do dado real ===');
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: SKU_FALTA, desc: 'Brinco Aurora', cat: 'Brinco', preco: null, qtd: 2 },
    { sku: SKU_PRONTO, desc: 'Colar Horizonte', cat: 'Colar', preco: 149.9, qtd: 3 },
  ],
});

/* Os bytes ficam no R2 local. O fluxo preserva original e tratada. */
const imagem = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
await api('PUT', `/api/produtos/${SKU_PRONTO}/foto/original`, imagem, 'image/png');
await api('PUT', `/api/produtos/${SKU_PRONTO}/foto/tratada`, imagem, 'image/png');

let lista = await api('GET', '/api/catalogo/publicacao');
const falta = lista.itens.find((x) => x.sku === SKU_FALTA);
const pronto = lista.itens.find((x) => x.sku === SKU_PRONTO);
eq('sem preço fica em Falta informação', falta?.estado, 'falta_informacao');
eq('preço aparece entre os gates faltantes', falta?.falta.includes('preco'), true);
eq('não aparece aguardando aprovação', falta?.estado === 'aguardando_aprovacao', false);
eq('produto completo entra em preparação', pronto?.estado, 'em_preparacao_agente');
eq('original e tratada foram preservadas', pronto?.temOriginal && pronto?.temTratada, true);
eq('API declara escrita externa bloqueada', lista.escritaNaLojaHabilitada, false);

console.log('\n=== 2. prévia completa e aprovação humana ===');
let r = await api('POST', `/api/catalogo/publicacao/${SKU_PRONTO}/previa`, {
  nomeSite: 'Colar Horizonte',
  descricaoSite: 'Colar Horizonte com acabamento delicado para compor produções do dia à noite.',
  seoTitulo: 'Colar Horizonte | Marquesa',
  seoDescricao: 'Conheça o Colar Horizonte da Marquesa e veja os detalhes desta peça.',
});
eq('prévia salva', r.ok, true);
eq('estado vira Aguardando aprovação', r.item?.estado, 'aguardando_aprovacao');
eq('salvar prévia não escreve na loja', r.escritaNaLoja, false);

r = await api('POST', `/api/catalogo/publicacao/${SKU_PRONTO}/aprovar`, { aprovadoPor: 'teste-pacote-4' });
eq('aprovação aceita', r.ok, true);
eq('estado vira Aprovado para publicar', r.item?.estado, 'aprovado_para_publicar');
eq('aprovação não publica', r.escritaNaLoja, false);

console.log('\n=== 3. mudança do dado invalida a aprovação ===');
await api('PATCH', `/api/produtos/${SKU_PRONTO}`, { preco: 159.9, versaoEsperada: null });
lista = await api('GET', '/api/catalogo/publicacao');
const alterado = lista.itens.find((x) => x.sku === SKU_PRONTO);
eq('volta para Aguardando aprovação', alterado?.estado, 'aguardando_aprovacao');
eq('explica que a aprovação perdeu validade', alterado?.aprovacaoInvalidada, true);

console.log('\n=== 4. Central reúne publicação e descreve o efeito ===');
const central = await api('GET', '/api/pendencias');
const caso = central.pendencias.find((x) => x.chave === `publicacao:${SKU_FALTA}`);
eq('produto bloqueado aparece na Central', !!caso, true);
eq('a linha informa o que falta', /preço/i.test(caso?.informacaoFaltante || ''), true);
eq('a linha informa o efeito', /não avança|não pode ser publicado/i.test(caso?.efeito || ''), true);
eq('há caminho de resolver', caso?.acoes.includes('editar_produto'), true);
eq('e opção Revisar depois', caso?.acoes.includes('revisar_depois'), true);

console.log('\n=== 5. preparação sem serviço expõe bloqueio real ===');
r = await api('POST', `/api/catalogo/publicacao/${SKU_PRONTO}/preparar`, {});
eq('continua em preparação, sem falso sucesso', r.estado, 'em_preparacao_agente');
eq('motivo externo é explícito', /PREPARADOR_CATALOGO_URL/.test(r.bloqueioExterno?.motivo || ''), true);
eq('continua sem escrita na loja', r.escritaNaLoja, false);

console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ PACOTE 4 API PASSOU');
process.exit(falhas ? 1 : 0);
