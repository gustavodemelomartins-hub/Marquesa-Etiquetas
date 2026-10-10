/** Enriquecimento editorial: nenhum preço, saldo, variante ou publicação.
 * Toda escrita guarda o estado anterior antes do PUT e confere a releitura.
 * Não há compare-and-swap na API: duas leituras reduzem a janela concorrente,
 * e a comparação posterior denuncia qualquer mudança comercial nessa janela.
 */
import { Nuvemshop, visibilidadeDe } from '../nuvemshop.js';
import { lerConfig } from '../plataforma/config.js';
import { enriquecerProduto, REGRA_ENRIQUECIMENTO, MARCA_CANONICA, CUIDADOS_HTML } from './enriquecimento.js';

export const CAMPOS_ENRIQUECIMENTO = Object.freeze(['brand', 'tags', 'description', 'seo_title', 'seo_description', 'categories']);
const CAMPOS = new Set(CAMPOS_ENRIQUECIMENTO);
const IDIOMAS = new Set(['description', 'seo_title', 'seo_description']);
const LOCALIZADOS = ['name', 'handle', 'description', 'seo_title', 'seo_description'];
const agora = () => new Date().toISOString();
const limparErro = (e) => String(e?.message || e).replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 500);
const texto = (v) => typeof v === 'object' && v ? String(v.pt || v.pt_BR || '') : String(v || '');
const tagsSemanticas = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map((s) => String(s).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' '))
  .filter(Boolean).sort();

function estavel(v) {
  if (Array.isArray(v)) return v.map(estavel);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort()
    .filter((k) => k !== 'updated_at' && k !== 'has_stock' && !(k === 'invalid_at' && v[k] == null))
    .map((k) => [k, estavel(v[k])]));
  return v;
}
export async function hashProduto(produto) {
  const bytes = new TextEncoder().encode(JSON.stringify(estavel(produto)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** Identidade editorial da fonte local. Ignora IDs operacionais, ordem das
 * linhas, preço e saldo; considera nomes, atributos e suas opções reais. */
export async function hashFonteEditorial(cadastro) {
  let variantes = [];
  try { variantes = JSON.parse(cadastro.variantes_editoriais || '[]'); } catch { variantes = [{ registro_invalido: cadastro.variantes_editoriais }]; }
  variantes = variantes.map((v) => {
    let valores = v.valores;
    try { valores = typeof valores === 'string' ? JSON.parse(valores) : valores; } catch { /* literal ainda identifica mudança */ }
    return { nome: v.nome ?? '', atributo: v.atributo ?? '', valores: valores ?? null };
  }).sort((a, b) => {
    const aa = JSON.stringify(estavel(a)), bb = JSON.stringify(estavel(b));
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  });
  return hashProduto({ desc: cadastro.desc, cat: cadastro.cat, variantes, regra: REGRA_ENRIQUECIMENTO });
}
export function projecaoComercial(produto) {
  return estavel(Object.fromEntries(Object.entries(produto || {}).filter(([k]) => !CAMPOS.has(k))));
}
/** A loja devolve automaticamente ancestrais da categoria escolhida. Só
 * aceita extras comprovados pela cadeia parent da própria resposta. */
export function categoriasEquivalentes(esperadas = [], lidas = []) {
  const id = (c) => String(c?.id ?? c);
  const pedidos = new Set(esperadas.map(id));
  const mapa = new Map(lidas.map((c) => [id(c), c]));
  if (mapa.size !== lidas.length || [...pedidos].some((k) => !mapa.has(k))) return false;
  const permitidos = new Set(pedidos);
  for (const pedido of pedidos) {
    const visitados = new Set([pedido]);
    let atual = mapa.get(pedido);
    for (let passos = 0; atual?.parent != null && Number(atual.parent?.id ?? atual.parent) !== 0; passos++) {
      const pai = id(atual.parent);
      if (visitados.has(pai) || passos >= 64) return false;
      visitados.add(pai); permitidos.add(pai); atual = mapa.get(pai);
    }
  }
  return [...mapa.keys()].every((k) => permitidos.has(k));
}
/** Busca estreita, somente campos editoriais. Nunca carrega o catálogo
 * inteiro no Worker. Um lote cheio é inconclusivo e falha fechado. */
export async function lerSeoOcupado(loja, nome, ignorarId = null) {
  if (typeof loja.chamar !== 'function') throw new Error('A consulta de colisões SEO não está disponível.');
  const encontrados = await loja.chamar(`/products?q=${encodeURIComponent(texto(nome).trim())}&per_page=30&fields=id,name,seo_title,seo_description`);
  if (!Array.isArray(encontrados) || encontrados.length >= 30) throw new Error('Busca SEO não conclusiva; refine a identidade antes de gerar outro título.');
  const outros = encontrados.filter((p) => String(p.id) !== String(ignorarId));
  return { seoTitulosOcupados: outros.map((p) => texto(p.seo_title)).filter(Boolean),
    seoDescricoesOcupadas: outros.map((p) => texto(p.seo_description)).filter(Boolean) };
}

function validarPatch(patch, antes) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Patch editorial inválido.');
  for (const campo of Object.keys(patch)) if (!CAMPOS.has(campo)) throw new Error(`Campo não permitido no enriquecimento: ${campo}.`);
  const saida = {};
  for (const [campo, valor] of Object.entries(patch)) {
    if (IDIOMAS.has(campo)) {
      if (typeof valor === 'string') {
        saida[campo] = typeof antes[campo] === 'object' && antes[campo] ? { ...antes[campo], pt: valor } : valor;
        continue;
      }
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)
          || Object.values(valor).some((v) => typeof v !== 'string')) throw new Error(`Idiomas inválidos em ${campo}.`);
      saida[campo] = { ...(typeof antes[campo] === 'object' ? antes[campo] : {}), ...valor };
    } else saida[campo] = valor;
  }
  if (saida.seo_title && (typeof saida.seo_title === 'string' ? [saida.seo_title] : Object.values(saida.seo_title))
      .some((v) => new TextEncoder().encode(v).length > 70)) {
    throw new Error('Título SEO ultrapassa 70 bytes.');
  }
  if (saida.categories && (!Array.isArray(saida.categories) || saida.categories.some((v) => !Number.isSafeInteger(Number(v)) || Number(v) <= 0))) {
    throw new Error('Categoria sem identidade comprovada.');
  }
  return saida;
}

/** journal(evento) precisa persistir/resolver antes de retornar. A sua falha
 * ANTES do PUT bloqueia a escrita; depois do PUT impede declarar validado. */
export async function aplicarEnriquecimento(loja, produtoId, patch, {
  journal, expectedHash = null, regra = REGRA_ENRIQUECIMENTO, sku = null,
} = {}) {
  const antes = await loja.produto(produtoId);
  if (String(antes?.id) !== String(produtoId)) throw new Error('Identidade do produto não confirmada.');
  const beforeHash = await hashProduto(antes);
  if (expectedHash && expectedHash !== beforeHash) throw new Error('Produto mudou depois do planejamento; gere uma proposta nova.');
  const corpo = validarPatch(patch, antes);
  if (!Object.keys(corpo).length) return { ok: true, alterado: false, produto: antes, beforeHash, afterHash: beforeHash };
  if (typeof journal !== 'function') throw new Error('Escrita editorial exige journal persistente.');
  // A API pode limpar campos traduzíveis omitidos em um PUT. Pass-through
  // mantém o registro integral de todos os idiomas, sem liberar sua edição.
  const wire = { ...Object.fromEntries(LOCALIZADOS.filter((k) => Object.hasOwn(antes, k)).map((k) => [k, antes[k]])), ...corpo };
  const id = crypto.randomUUID();
  const evento = { id, sku, product_id: String(produtoId), regra, before_json: JSON.stringify(antes),
    patch_json: JSON.stringify(wire), before_hash: beforeHash, em: agora() };
  await journal({ ...evento, estado: 'preparado' });
  let houvePut = false;
  try {
    const fresco = await loja.produto(produtoId);
    if (await hashProduto(fresco) !== beforeHash) throw new Error('Alteração concorrente antes da escrita; nenhum PUT enviado.');
    houvePut = true;
    await loja.atualizarProduto(produtoId, wire);
    const depois = await loja.produto(produtoId);
    const afterHash = await hashProduto(depois);
    if (JSON.stringify(projecaoComercial(antes)) !== JSON.stringify(projecaoComercial(depois))) {
      throw new Error('Releitura encontrou mudança comercial concorrente ou indevida; resultado exige revisão.');
    }
    for (const campo of CAMPOS_ENRIQUECIMENTO) {
      if (Object.hasOwn(corpo, campo)) continue;
      const comparar = (v) => campo === 'tags' ? tagsSemanticas(v) : estavel(v);
      if (campo === 'categories' && categoriasEquivalentes(antes.categories || [], depois.categories || [])) continue;
      if (JSON.stringify(comparar(antes[campo])) !== JSON.stringify(comparar(depois[campo]))) {
        throw new Error(`Releitura alterou campo editorial preservado: ${campo}.`);
      }
    }
    for (const [campo, valor] of Object.entries(corpo)) {
      if (campo === 'categories' && categoriasEquivalentes(valor, depois.categories || [])) continue;
      const compara = (v) => campo === 'categories' ? (v || []).map((c) => String(c?.id ?? c)).sort()
        : campo === 'tags' ? tagsSemanticas(v)
        : IDIOMAS.has(campo) && (typeof valor === 'string' || typeof depois[campo] === 'string') ? texto(v) : estavel(v);
      if (JSON.stringify(compara(depois[campo])) !== JSON.stringify(compara(valor))) {
        throw new Error(`Releitura não confirmou ${campo}.`);
      }
    }
    await journal({ ...evento, estado: 'validado', after_json: JSON.stringify(depois), after_hash: afterHash, em: agora() });
    return { ok: true, alterado: true, produto: depois, beforeHash, afterHash, journalId: id };
  } catch (e) {
    let depois = null;
    if (houvePut) { try { depois = await loja.produto(produtoId); } catch { /* continua erro, nunca validado */ } }
    await journal({ ...evento, estado: 'erro', after_json: depois ? JSON.stringify(depois) : null,
      after_hash: depois ? await hashProduto(depois) : null, erro: limparErro(e), em: agora() });
    if (houvePut) e.resultadoNaoValidado = true;
    throw e;
  }
}

export function journalD1(db, fonteHash = null) {
  return async (e) => {
    await db.prepare(`INSERT INTO nuvemshop_enriquecimento
      (id, sku, product_id, regra, estado, before_json, patch_json, after_json, before_hash, after_hash, fonte_hash, erro, em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET estado=excluded.estado, after_json=excluded.after_json,
        after_hash=excluded.after_hash, erro=excluded.erro, em=excluded.em`)
      .bind(e.id, e.sku, e.product_id, e.regra, e.estado, e.before_json, e.patch_json,
        e.after_json || null, e.before_hash, e.after_hash || null, fonteHash, e.erro || null, e.em).run();
  };
}

/** Lote de no máximo duas peças criadas aqui e ainda ocultas. Cursor evita
 * revisitar eternamente os primeiros SKUs. O hash da fonte libera nova
 * avaliação quando o cadastro local muda, sem reescrever texto humano. */
export async function enriquecerOcultos(db, env, { seco = true, limite = 2, skus = null, loja: lojaDada = null } = {}) {
  const cfg = lerConfig(env).nuvemshop;
  const ligado = await db.prepare("SELECT valor FROM config WHERE chave='nuvemshopCatalogoAtivo'").first();
  const autorizado = cfg.escritaHabilitada && ligado?.valor === 'true';
  const relato = { ok: true, seco: seco || !autorizado, alterados: 0, iguais: 0, erros: 0, itens: [] };
  if (!cfg.loja || !cfg.token) return { ...relato, ok: false, erro: 'A loja não está conectada.' };
  const loja = lojaDada || new Nuvemshop(env);
  const filtro = Array.isArray(skus) && skus.length ? skus.map(String).slice(0, 24) : null;
  const cursor = !filtro ? await db.prepare("SELECT valor FROM config WHERE chave='nuvemshopEnriquecimentoCursor'").first() : null;
  let ultimo = '';
  try { ultimo = JSON.parse(cursor?.valor || '""'); } catch { /* cursor inválido recomeça */ }
  const sql = `SELECT p.sku, p.desc, p.cat, c.produto_id, c.conteudo_json,
      (SELECT json_group_array(json_object('nome', v.nome, 'atributo', v.atributo, 'valores', v.valores_json))
        FROM produto_variacoes v WHERE v.sku=p.sku) AS variantes_editoriais,
      (SELECT e.fonte_hash FROM nuvemshop_enriquecimento e WHERE e.product_id=c.produto_id
        AND e.regra=? AND e.estado='validado' ORDER BY e.em DESC, e.rowid DESC LIMIT 1) AS ultima_fonte
    FROM nuvemshop_catalogo c JOIN produtos p ON p.sku=c.sku
    WHERE c.origem='criado' AND c.estado='oculto' AND c.visibilidade='hidden'
      AND p.status='ativo' AND c.produto_id IS NOT NULL
      AND ${filtro ? `p.sku IN (${filtro.map(() => '?').join(',')})` : 'p.sku > ?'}
    ORDER BY p.sku LIMIT 16`;
  let linhas;
  try { linhas = (await db.prepare(sql).bind(REGRA_ENRIQUECIMENTO, ...(filtro || [ultimo])).all()).results || []; }
  catch (e) { return { ...relato, ok: false, erro: limparErro(e) }; } // migration ausente: fail closed
  const categorias = linhas.length ? await loja.categorias() : [];
  let avaliados = 0;
  let proximo = linhas.length ? ultimo : '';
  for (const cadastro of linhas) {
    proximo = String(cadastro.sku);
    const fonteHash = await hashFonteEditorial(cadastro);
    if (cadastro.ultima_fonte === fonteHash) { relato.iguais++; continue; }
    if (avaliados++ >= Math.max(1, Math.min(2, Number(limite) || 2))) { proximo = ultimo; break; }
    ultimo = String(cadastro.sku);
    try {
      const produto = await loja.produto(cadastro.produto_id);
      if (visibilidadeDe(produto) !== 'hidden') { relato.itens.push({ sku: cadastro.sku, ignorado: 'visibilidade mudou' }); continue; }
      let gerado = false;
      try { gerado = JSON.parse(cadastro.conteudo_json || '{}').regra === 'seo-2026-10-08/v1'; } catch { /* preservar */ }
      // Trocar texto v1 apenas se ainda coincide com o que este sistema enviou.
      let enviado = {};
      try { enviado = JSON.parse(cadastro.conteudo_json || '{}'); } catch { /* preservar */ }
      gerado = gerado && texto(produto.description) === String(enviado.descricao || '');
      const ocupados = !texto(produto.seo_title).trim() || !texto(produto.seo_description).trim()
        ? await lerSeoOcupado(loja, produto.name, produto.id) : {};
      const proposta = enriquecerProduto(produto, { cadastro, marcaCanonica: MARCA_CANONICA,
        cuidadosHtml: CUIDADOS_HTML, categorias, novo: true, substituirTextoGerado: gerado, ...ocupados });
      const hash = await hashProduto(produto);
      if (relato.seco) { relato.itens.push({ sku: cadastro.sku, produtoId: cadastro.produto_id, patch: proposta.patch, pendencias: proposta.pendencias }); continue; }
      const journal = journalD1(db, fonteHash);
      const r = await aplicarEnriquecimento(loja, cadastro.produto_id, proposta.patch,
        { journal, expectedHash: hash, sku: cadastro.sku });
      if (!r.alterado) await journal({ id: crypto.randomUUID(), sku: cadastro.sku, product_id: String(cadastro.produto_id),
        regra: REGRA_ENRIQUECIMENTO, estado: 'validado', before_json: JSON.stringify(produto), patch_json: '{}',
        after_json: JSON.stringify(produto), before_hash: hash, after_hash: hash, em: agora() });
      if (r.alterado) relato.alterados++; else relato.iguais++;
      relato.itens.push({ sku: cadastro.sku, produtoId: cadastro.produto_id, alterado: r.alterado, pendencias: proposta.pendencias });
      await db.prepare(`UPDATE nuvemshop_catalogo SET conteudo_json=?, conteudo_enviado_em=?, atualizado_em=? WHERE sku=?`)
        .bind(JSON.stringify({ descricao: texto(r.produto.description), seoTitulo: texto(r.produto.seo_title),
          seoDescricao: texto(r.produto.seo_description), categorias: (r.produto.categories || []).length,
          regra: REGRA_ENRIQUECIMENTO }), agora(), agora(), cadastro.sku).run();
      // Atualiza somente fatos editoriais comprovados nesta releitura. Não
      // altera status/saldos/motivos nem data da conferência de estoque.
      await db.prepare(`UPDATE nuvemshop_conferencia SET ns_tem_descricao=?, ns_tem_seo_titulo=?,
        ns_tem_seo_descricao=?, ns_categorias=? WHERE ns_produto_id=?`)
        .bind(texto(r.produto.description).trim() ? 1 : 0, texto(r.produto.seo_title).trim() ? 1 : 0,
          texto(r.produto.seo_description).trim() ? 1 : 0, (r.produto.categories || []).length, String(cadastro.produto_id)).run();
    } catch (e) {
      relato.erros++; relato.ok = false; relato.itens.push({ sku: cadastro.sku, erro: limparErro(e) });
      if (e.resultadoNaoValidado) {
        // O estoque (§61) continua independente; o catálogo para até que
        // alguém confira o resultado da escrita não validada.
        await db.prepare("UPDATE config SET valor='false' WHERE chave='nuvemshopCatalogoAtivo'").run();
        relato.interrompido = 'Escrita editorial não validada; cadastro automático desligado.';
      }
      break;
    }
  }
  if (!relato.seco && !filtro) await db.prepare(`INSERT INTO config(chave,valor) VALUES('nuvemshopEnriquecimentoCursor',?)
    ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`).bind(JSON.stringify(proximo)).run();
  return relato;
}
