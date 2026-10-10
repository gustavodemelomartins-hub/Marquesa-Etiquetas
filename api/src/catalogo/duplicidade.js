/** §66 — POSSÍVEL DUPLICIDADE: o mesmo produto sob dois códigos.
 *
 *  Até 10/10/2026 a pergunta "é o mesmo modelo já anunciado?" só era feita
 *  para a peça SEM anúncio, contra os nomes da loja. Peça já criada oculta
 *  passava direto: 481514 e 454953 nasceram ocultos com o mesmo nome, e
 *  186027 nasceu oculto com o nome exato do 170308, que está publicado.
 *  Completados foto e preço, cada um iria a "Pronto para publicar" — e a
 *  loja ganharia um segundo anúncio do mesmo produto.
 *
 *  Agora a comparação cobre todo código que tem anúncio (publicado, oculto
 *  novo, oculto antigo) ou peça em casa, e NOME IGUAL NÃO DECIDE NADA. Ele só
 *  levanta a suspeita; quem decide são os dados, nesta ordem:
 *
 *    MESMO       a mesma foto (arquivo idêntico, pelo hash) está nos dois
 *                códigos. Não publica um segundo anúncio; a proposta de
 *                vínculo vai para gente — nada é unido sozinho.
 *    DIFERENTE   categoria diferente, ou acabamento/cor diferente nas
 *                variantes da loja ("Banho de Prata" × "Banho de Ouro 18K").
 *                A suspeita sai sozinha.
 *                A suspeita sai sozinha.
 *    TAMANHO     o mesmo modelo em outro aro (334078 "nº27" × 334079): não é
 *                duplicata, mas é pergunta — vira variação do anúncio que
 *                existe, ou anúncio próprio?
 *    INCONCLUSIVO nada acima. Decisão de gente, com o que foi comparado.
 *
 *  Preço NÃO prova nada, nem com o lote junto. 150163 (R$ 49) e 159930
 *  (R$ 59) são o mesmo brinco rosa em dois anúncios antigos, e vieram da
 *  mesma planilha do go-live (772 códigos de uma vez) — de duas compras.
 *  481514 (R$ 194) e 454953 (R$ 159) entraram juntos na sessão 8 da
 *  reconciliação: pode ser tamanho, pode ser outra compra. Preço e lote
 *  entram na pergunta como indício, para quem decide; não a respondem.
 *  Preço igual também não prova que é o mesmo. Nem uma palavra a mais no
 *  cadastro daqui: o 838474 é "Anel Micro Zircônias Regulável" aqui, mas o
 *  anúncio dele na loja se chama "Anel Micro Zircônias Banho de Ouro 18k" —
 *  exatamente o nome do 450320. Criar o 450320 poria dois anúncios com o
 *  mesmo nome na loja.
 *
 *  Publicado × publicado é só informação: os dois já estão na loja, e nada
 *  aqui os altera. Peça sem anúncio ou oculta com suspeita real não é
 *  criada, não fica "Pronta para publicar" e não entra em "Publicar todos".
 *
 *  Funções puras: não leem banco, não escrevem nada. */
import { normalizar } from './texto-site.js';
import { chaveDaVariacao } from '../variacao-nome.js';
import { normSku } from '../sku.js';
import { tipoDoValor } from './taxonomia.js';

export const FAMILIAS = {
  anel: 'anel', aneis: 'anel', brinco: 'brinco', brincos: 'brinco', colar: 'colar', colares: 'colar',
  pulseira: 'pulseira', pulseiras: 'pulseira', argola: 'argola', argolas: 'argola', berloque: 'berloque',
  berloques: 'berloque', pingente: 'pingente', pingentes: 'pingente', conjunto: 'conjunto', piercing: 'piercing',
};

const ARO = /\bn\s*[º°o.]?\s*(\d{1,2})\b/g;

/** O MODELO de uma peça, para achar o mesmo modelo já anunciado sob outro
 *  código (334078 "… nº27 …" é o aro 27 do 334079, que a loja já tem como
 *  variante): a família e o resto do nome, sem o aro.
 *
 *  §64 — a família FICA na comparação. Até 09/10/2026 ela era descartada, e
 *  "Colar Ponto de Luz Rosa" virava o "mesmo modelo" de "Brinco Ponto de Luz
 *  Rosa": 9 das 24 peças paradas em "decidir" eram colar × brinco, anel ×
 *  brinco. Nome sem família (o "Aparador de Aliança" do cadastro) usa a
 *  categoria daqui; do lado da loja, nome sem família casa com qualquer
 *  uma — na dúvida, pergunta. */
export function chaveDoModelo(nome, cat = null) {
  let s = normalizar(nome).replace(/^aparador\s+(?:de\s+)?alianca\b/, 'anel aparador de alianca').replace(ARO, ' ').replace(/\s+/g, ' ').trim();
  const primeira = s.split(' ')[0];
  let familia = FAMILIAS[primeira] || '';
  if (familia) s = s.slice(primeira.length).trim();
  else familia = FAMILIAS[normalizar(cat)] || '';
  return { familia, resto: s };
}

const arosDe = (nome) => [...normalizar(nome).matchAll(ARO)].map((m) => String(Number(m[1]))).sort().join(',');
const precoDe = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(Number(v).toFixed(2)) : null);
const reais = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(',00', '')}`;
const palavras = (s) => normalizar(s).split(/[^a-z0-9]+/).filter(Boolean);
const json = (s, padrao) => { try { return s ? JSON.parse(s) : padrao; } catch { return padrao; } };

/** O lote de cadastro de um código: a observação da primeira entrada, sem o
 *  número do item ("Reconciliação (produto novo) sessão 8, item 2442" →
 *  "… sessão 8"), e quando. */
export function loteDoCadastro(entrada) {
  if (!entrada || !entrada.obs) return null;
  const chave = normalizar(entrada.obs).replace(/,?\s*item\s+\d+/g, '').replace(/\s+/g, ' ').trim();
  const t = Date.parse(String(entrada.em || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(entrada.em || '')) ? '' : 'Z'));
  return chave ? { chave, em: Number.isNaN(t) ? null : t, texto: String(entrada.obs) } : null;
}
const JANELA_DO_LOTE_MS = 10 * 60 * 1000;
function mesmoLote(a, b) {
  const la = loteDoCadastro(a), lb = loteDoCadastro(b);
  if (!la || !lb || la.chave !== lb.chave) return null;
  if (la.em == null || lb.em == null || Math.abs(la.em - lb.em) > JANELA_DO_LOTE_MS) return null;
  return la;
}

/** A identidade de cada código, montada do que a base já leu. */
export function identidadeDaBase(base) {
  if (base.identidade) return base.identidade;
  const loja = [];
  const pids = new Set();
  for (const linhas of (base.lojaPorSku || new Map()).values()) {
    for (const v of linhas) { loja.push(v); pids.add(String(v.produto_id)); }
  }
  for (const [pid, info] of (base.nomesDaLoja || new Map())) {
    if (pids.has(String(pid))) continue;
    const skus = [...(info.skus || [])];
    for (const s of skus.length ? skus : [null]) {
      loja.push({ sku_norm: s, produto_id: pid, produto_nome: info.nome, nome: null, valores_json: null, produto_visivel: null });
    }
  }
  const fotos = new Map();
  for (const [sku, linhas] of (base.fotos || new Map())) {
    const hs = linhas.map((f) => f.conteudo_hash).filter(Boolean);
    if (hs.length) fotos.set(String(sku), new Set(hs));
  }
  return { produtos: base.produtos || [], loja, entradas: base.entradas || new Map(), fotos };
}

/** Unidades (um anúncio da loja, ou um código sem anúncio) e os nomes pelos
 *  quais cada uma pode ser o "mesmo modelo" de outra. */
export function gruposDeModelo(ident) {
  const pidDe = new Map();
  const anuncios = new Map();     // pid -> { nome, visivel, skusLoja:Set }
  for (const v of ident.loja || []) {
    const pid = String(v.produto_id);
    if (!anuncios.has(pid)) anuncios.set(pid, { nome: v.produto_nome || '', visivel: false, skusLoja: new Set() });
    const a = anuncios.get(pid);
    if (Number(v.produto_visivel) === 1) a.visivel = true;
    if (v.sku_norm) {
      a.skusLoja.add(String(v.sku_norm));
      if (!pidDe.has(String(v.sku_norm))) pidDe.set(String(v.sku_norm), pid);
    }
  }
  const unidades = new Map();
  const unidadeDe = new Map();    // sku -> id da unidade
  const produtoDe = new Map();
  const unidade = (id, pid) => {
    if (!unidades.has(id)) unidades.set(id, { id, produtoId: pid, skus: [], visivel: false, nomes: [] });
    return unidades.get(id);
  };
  for (const p of ident.produtos || []) {
    const sku = String(p.sku);
    const pid = p.produto_id_loja ? String(p.produto_id_loja) : (pidDe.get(normSku(sku)) || null);
    if (!pid && !(Number(p.qtd) > 0)) continue;
    const u = unidade(pid ? `p:${pid}` : `s:${sku}`, pid);
    u.skus.push(sku);
    if (p.visibilidade_loja === 'visible' || (pid && anuncios.get(pid)?.visivel && !p.visibilidade_loja)) u.visivel = true;
    u.nomes.push({ nome: p.desc, cat: p.cat, skus: [sku] });
    unidadeDe.set(sku, u.id);
    produtoDe.set(sku, p);
  }
  for (const [pid, a] of anuncios) {
    const u = unidade(`p:${pid}`, pid);
    if (a.visivel && !u.skus.some((s) => produtoDe.get(s)?.visibilidade_loja && produtoDe.get(s).visibilidade_loja !== 'visible')) u.visivel = true;
    u.skusLoja = [...a.skusLoja];
    if (a.nome) u.nomes.push({ nome: a.nome, cat: null, skus: u.skus.length ? [...u.skus] : [], daLoja: true });
  }
  const porResto = new Map();
  for (const u of unidades.values()) {
    for (const n of u.nomes) {
      const m = chaveDoModelo(n.nome, n.cat);
      if (!m.resto) continue;
      if (!porResto.has(m.resto)) porResto.set(m.resto, []);
      porResto.get(m.resto).push({ unidade: u, familia: m.familia, nome: n.nome, skus: n.skus, daLoja: !!n.daLoja });
    }
  }
  return { unidades, unidadeDe, produtoDe, porResto, anuncios };
}

/** Os códigos que entram na comparação de `skus` (eles e os candidatos a
 *  "mesmo modelo" deles) — para a leitura parcial buscar só o necessário. */
export function skusRelacionados(ident, skus) {
  const g = gruposDeModelo(ident);
  const alvo = new Set((skus || []).map(String));
  const saida = new Set(alvo);
  for (const entradas of g.porResto.values()) {
    if (!entradas.some((e) => e.unidade.skus.some((s) => alvo.has(s)))) continue;
    for (const e of entradas) for (const s of e.unidade.skus) saida.add(s);
  }
  return [...saida];
}

/** O que a loja vende sob o código: os valores das variantes (quando ele é
 *  UMA variante), por tipo — cor, acabamento. */
function valoresNaLoja(ident, sku) {
  const linhas = (ident.loja || []).filter((v) => v.sku_norm && String(v.sku_norm) === normSku(sku));
  if (linhas.length !== 1) return new Map();
  let vals = json(linhas[0].valores_json, null);
  if (!Array.isArray(vals) || !vals.length) vals = String(linhas[0].nome || '').split('·').map((x) => ({ valor: x.trim() }));
  const m = new Map();
  for (const x of vals) {
    const t = tipoDoValor(x.valor);
    if ((t === 'cor' || t === 'acabamento') && !m.has(t)) m.set(t, String(x.valor).trim());
  }
  return m;
}
const contido = (a, b) => a.length > 0 && a.every((w) => b.includes(w));

/** Um código (`a`) contra um candidato (`b`). `b.sku` pode ser de outra loja
 *  (sem cadastro daqui): aí só o nome e a loja contam. */
export function compararPar(a, b, ident) {
  const fa = ident.fotos?.get(String(a.sku));
  const fb = b.local ? ident.fotos?.get(String(b.sku)) : null;
  if (fa && fb && [...fa].some((h) => fb.has(h))) {
    return { tipo: 'mesmo', prova: `a mesma foto (arquivo idêntico) está nos dois códigos` };
  }
  if (b.local) {
    const ca = normalizar(a.cat), cb = normalizar(b.cat);
    if (ca && cb && ca !== cb) return { tipo: 'diferente', prova: `categorias diferentes (${a.cat} × ${b.cat})` };
    const va = valoresNaLoja(ident, a.sku), vb = valoresNaLoja(ident, b.sku);
    for (const [t, x] of va) {
      const y = vb.get(t);
      if (!y || chaveDaVariacao(x) === chaveDaVariacao(y)) continue;
      const px = palavras(x), py = palavras(y);
      if (contido(px, py) || contido(py, px)) continue;
      return { tipo: 'diferente', prova: `${t === 'cor' ? 'cores' : 'acabamentos'} diferentes na loja ("${x}" × "${y}")` };
    }
  }
  if (arosDe(a.desc) !== arosDe(b.desc)) {
    return { tipo: 'tamanho', prova: `o mesmo modelo em outro tamanho (${a.desc} × ${b.desc})` };
  }
  const iguais = [];
  if (b.local) {
    const pa = precoDe(a.preco), pb = precoDe(b.preco);
    iguais.push(pa && pb ? (pa === pb ? `mesmo preço (${reais(pa)})` : `preços diferentes (${reais(pa)} × ${reais(pb)})`) : 'sem preço para comparar');
    const la = loteDoCadastro(ident.entradas?.get(String(a.sku))), lb = loteDoCadastro(ident.entradas?.get(String(b.sku)));
    if (la && lb) iguais.push(mesmoLote(ident.entradas.get(String(a.sku)), ident.entradas.get(String(b.sku))) ? 'cadastrados no mesmo lote' : 'cadastrados em momentos diferentes');
    if (!fa || !fb) iguais.push('sem foto própria nos dois para comparar');
  }
  return { tipo: 'inconclusivo', prova: `mesmo nome e mesma família; ${iguais.join('; ') || 'só a loja tem o outro'}` };
}

const ORDEM = { mesmo: 0, inconclusivo: 1, tamanho: 2, diferente: 3 };

/** Para cada código que pode ter um gêmeo: o veredito e as provas.
 *
 *  Devolve Map(sku → {
 *    tipo: 'mesmo' | 'inconclusivo' | 'tamanho' | 'diferente',
 *    decidir: boolean            — true = decisão de gente, segura a peça
 *    informativo: boolean        — publicado × publicado: só informação
 *    com: [{ sku, produtoId, visivel, nome, preco, tipo, prova }],
 *    motivo, proposta
 *  }). */
export function suspeitasDeDuplicidade(ident) {
  const g = gruposDeModelo(ident);
  const pares = new Map();   // sku -> Map(outroSku -> comparação)
  const ladoDe = (sku) => {
    const p = g.produtoDe.get(sku);
    return p ? { sku, desc: p.desc, cat: p.cat, preco: p.preco, local: true } : null;
  };
  for (const entradas of g.porResto.values()) {
    if (entradas.length < 2) continue;
    for (const e1 of entradas) {
      for (const e2 of entradas) {
        if (e1.unidade.id === e2.unidade.id) continue;
        if (e1.familia && e2.familia && e1.familia !== e2.familia) continue;
        for (const s of e1.skus) {
          const a = ladoDe(s);
          if (!a) continue;
          if (!pares.has(s)) pares.set(s, new Map());
          const daqui = e2.skus.length ? e2.skus : [];
          if (!daqui.length) {
            const outro = (e2.unidade.skusLoja || [])[0] || `anúncio ${e2.unidade.produtoId}`;
            if (pares.get(s).has(outro)) continue;
            const c = compararPar(a, { sku: outro, desc: e2.nome, local: false }, ident);
            pares.get(s).set(outro, { ...c, sku: outro, produtoId: e2.unidade.produtoId, visivel: e2.unidade.visivel, nome: e2.nome, preco: null });
            continue;
          }
          for (const o of daqui) {
            if (pares.get(s).has(o)) continue;
            const b = ladoDe(o);
            const c = compararPar(a, b, ident);
            pares.get(s).set(o, { ...c, sku: o, produtoId: e2.unidade.produtoId, visivel: e2.unidade.visivel, nome: b.desc, preco: precoDe(b.preco) });
          }
        }
      }
    }
  }
  const saida = new Map();
  for (const [sku, mapa] of pares) {
    const com = [...mapa.values()].sort((x, y) => ORDEM[x.tipo] - ORDEM[y.tipo]);
    if (!com.length) continue;
    const u = g.unidades.get(g.unidadeDe.get(sku));
    const tipo = com[0].tipo;
    const informativo = !!u?.visivel;
    const decidir = !informativo && tipo !== 'diferente';
    const lista = (xs) => xs.map((x) => x.sku).join(', ');
    const abertos = com.filter((x) => x.tipo !== 'diferente');
    let motivo;
    let proposta = null;
    if (tipo === 'diferente') {
      motivo = `Mesmo nome de ${lista(com)}, mas os dados provam que são produtos diferentes: ${com.map((x) => x.prova).join('; ')}.`;
    } else if (tipo === 'tamanho' && abertos.every((x) => x.tipo === 'tamanho')) {
      motivo = `Pode ser o mesmo modelo de ${lista(abertos)} em outro tamanho: vira variação do anúncio que já existe, ou anúncio próprio?`;
    } else {
      motivo = `Pode ser o mesmo modelo de ${lista(abertos)} (${abertos.map((x) => x.prova).join('; ')}). Confirme antes de criar ou publicar outro anúncio.`;
      const alvo = abertos.find((x) => x.visivel) || abertos[0];
      proposta = tipo === 'mesmo'
        ? `Mesma foto nos dois: não publicar o ${sku}; vincular as peças dele ao anúncio do ${alvo.sku}, mantendo os dois códigos e o histórico.`
        : `Se for o mesmo produto: o ${sku} não ganha anúncio próprio — as peças dele passam a ser vendidas pelo anúncio do ${alvo.sku}, mantendo os dois códigos e o histórico. Se for outro produto: diga o que o diferencia (tamanho, peso, modelo) para o nome não repetir.`;
    }
    saida.set(sku, { tipo, decidir, informativo, com, motivo, proposta });
  }
  return saida;
}
