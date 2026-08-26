import { checarChave, respostaNaoAutorizada, json, comCors } from './auth.js';
import { montarState, FAIXAS_PADRAO } from './state.js';
import { calcComissao } from './comissao.js';
import { movimentar, consignadoDoSku, saldosDoSku, conferirEstoque, movimentarKit, componentesDoKit, ehKit } from './estoque.js';
import {
  abrirInventario, salvarContagem, concluirInventario, ajustarInventario,
  cancelarInventario, detalheInventario, listarInventarios,
} from './inventario.js';
import { sincronizar, sincronizarSomenteEstoque, historicoSync, analisarSincronizacao } from './sync.js';
import {
  analisarEstoqueTotal, aplicarEstoqueTotal, analisarNovos, cadastrarNovos,
  enfileirarPendentes, listarPendentes, limparPendentes,
} from './catalogo.js';
import {
  importarFotosDaLoja, vincularFotosDaLoja, listarFotosOrfas, adotarFotoOrfa, salvarFotoUpload,
  lerFotoParaServir, removerFotos, gerarFundoBranco, pendenciasDePublicacao,
  sincronizarFotosDaLoja, fotosDoSku,
} from './fotos.js';
import { conferirAssinaturaFoto } from './assinatura.js';
import {
  importarVariantesDaLoja, variacoesParaRevisao, variantesDoSku, distribuirVariantes,
} from './variantes.js';
import {
  dependenciasDoProduto, excluirProduto, arquivarProduto, desarquivarProduto, definirVariacoes,
  estruturaDoProduto,
} from './produtos.js';
import { checarSku, gerarSku, auditarSkus } from './sku.js';
import { Nuvemshop } from './nuvemshop.js';
import { trocarCodigoPorToken } from './nuvemshop-oauth.js';
import { atualizarEstoqueDaVenda } from './vendas-estoque-nuvemshop.js';
import {
  abrirSessao, detalheSessao, aprovarItem, rejeitarItem, cancelarSessao, aplicarSessao,
  analisarPlanilhaEstoqueTotal, analisarPlanilhaProdutosNovos,
} from './reconciliacao.js';

const hoje = () => new Date().toISOString().slice(0, 10);
const int = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

export default {
  /** O CORS é aplicado uma única vez, na saída — assim nenhuma rota nova
   *  pode esquecer de devolvê-lo. */
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }), request, env);
    return comCors(await rotear(request, env), request, env);
  },

  /** Cron da Cloudflare. Roda mesmo sem ninguém com o app aberto — é o que
   *  faz a loja ficar em dia sozinha.
   *
   *  Nunca força: se a rodada bater no freio de segurança, ela para e fica
   *  registrada como pausada, esperando alguém olhar. Um robô que roda de
   *  madrugada é o pior lugar possível para atropelar uma dúvida. */
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(sincronizar(env.DB, env).then(r => {
      if (!r.ok) console.error('sync falhou:', r.erro);
      else if (r.pausado) console.warn('sync pausada:', r.pausado.motivo);
    }));
  },
};

async function rotear(request, env) {
  {
    const url = new URL(request.url);
    const path = url.pathname;
    const met = request.method;
    // Declarado aqui em cima porque as rotas de foto (mais abaixo, fora do
    // checarChave) já precisam dele — um `let` mais para baixo deixaria
    // essas duas em zona morta temporal e o Worker responderia 500 a
    // qualquer chamada de imagem, mesmo assinada certinho.
    let m;

    if (path === '/api/health') return json({ ok: true, hoje: hoje() });

    // Chamado pelo navegador dela vindo da Nuvemshop, não pelo dashboard —
    // não carrega (e não pode exigir) o Bearer da API_KEY. Quem prova que
    // foi ela mesma que autorizou é o `code` de uso único, não a chave.
    if (path === '/api/nuvemshop/callback' && met === 'GET') {
      return trocarCodigoPorToken(env, url.searchParams.get('code'));
    }

    // Leitura da foto: chamada por um <img src>, que não manda o Bearer.
    // Em vez da chave, o link carrega uma assinatura HMAC com prazo curto
    // (assinatura.js) — o mesmo raciocínio do callback acima: outra forma
    // de provar autorização, não a ausência dela.
    if ((m = path.match(/^\/api\/produtos\/([^/]+)\/foto\/(original|tratada)$/)) && met === 'GET') {
      const [, skuBruto, versao] = m;
      const ok = await conferirAssinaturaFoto(
        env, decodeURIComponent(skuBruto), versao,
        url.searchParams.get('exp'), url.searchParams.get('sig'));
      if (!ok) return respostaNaoAutorizada();
      const foto = await lerFotoParaServir(env.DB, decodeURIComponent(skuBruto), versao, env);
      if (!foto) return new Response('Foto não encontrada', { status: 404 });
      return new Response(foto.corpo, {
        headers: { 'Content-Type': foto.tipo, 'Cache-Control': 'private, max-age=21600' },
      });
    }

    if (!checarChave(request, env)) return respostaNaoAutorizada();

    const db = env.DB;
    try {
      if (path === '/api/state' && met === 'GET') return json(await montarState(db, env));

      // §19 — prova de que o saldo bate com a razão
      if (path === '/api/estoque/conferir' && met === 'GET') {
        const divergentes = await conferirEstoque(db);
        return json({ ok: divergentes.length === 0, divergentes });
      }

      // §18 — "por que o estoque deste SKU mudou?"
      if ((m = path.match(/^\/api\/estoque\/([^/]+)\/movimentos$/)) && met === 'GET') {
        const sku = decodeURIComponent(m[1]);
        const r = await db.prepare(
          `SELECT * FROM movimentos WHERE sku = ? ORDER BY id`).bind(sku).all();
        const saldos = await saldosDoSku(db, sku);
        return json({ sku, saldos, movimentos: r.results });
      }

      if (path === '/api/categorias' && met === 'GET') {
        const r = await db.prepare(`SELECT * FROM categorias ORDER BY ordem, nome`).all();
        return json(r.results);
      }
      if (path === '/api/categorias' && met === 'POST') {
        const { nome, ordem, cor } = await request.json();
        if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
        await db.prepare(
          `INSERT INTO categorias (nome, ordem, cor) VALUES (?, ?, ?)
           ON CONFLICT(nome) DO UPDATE SET ordem = excluded.ordem, cor = excluded.cor`
        ).bind(nome.trim(), ordem ?? 99, cor || null).run();
        return json({ ok: true }, 201);
      }

      if (path === '/api/produtos/importar' && met === 'POST') return await importarProdutos(db, await request.json());
      if (path === '/api/loja/importar' && met === 'POST') return await importarLoja(db, await request.json());

      /* ----------------------------------------- estoque total e peças novas
         Dois fluxos separados de propósito. O primeiro ajusta quantidade de
         quem já existe e NUNCA cria; o segundo cria quem não existe e NUNCA
         altera. Cada um analisa antes de aplicar, e a análise não escreve. */
      if (path === '/api/estoque-total/analisar' && met === 'POST') {
        return json(await analisarEstoqueTotal(db, await request.json()));
      }
      if (path === '/api/estoque-total/aplicar' && met === 'POST') {
        return json(await aplicarEstoqueTotal(db, await request.json()));
      }
      /* `origem: 'manual'` muda uma coisa só: liga a regra de formato do
         código digitado à mão (seis dígitos). Planilha e fila continuam
         aceitando o código que o fornecedor ou a loja escreveu. */
      if (path === '/api/produtos/novos/analisar' && met === 'POST') {
        return json(await analisarNovos(db, await request.json()));
      }
      if (path === '/api/produtos/novos/cadastrar' && met === 'POST') {
        return json(await cadastrarNovos(db, await request.json()));
      }
      // fila que liga um fluxo ao outro, para não reimportar o mesmo arquivo
      if (path === '/api/produtos/pendentes' && met === 'GET') return json(await listarPendentes(db));
      if (path === '/api/produtos/pendentes' && met === 'POST') {
        return json(await enfileirarPendentes(db, await request.json()));
      }
      if (path === '/api/produtos/pendentes' && met === 'DELETE') {
        const b = await request.json().catch(() => ({}));
        return json(await limparPendentes(db, b.skus));
      }

      // ------------------------------------------------------------- fotos
      // A leitura (GET original/tratada) fica lá em cima, fora do Bearer —
      // ver o comentário perto do callback da Nuvemshop.
      // Vincular: anota o endereço da imagem na loja, sem baixar os bytes.
      // Uma leitura resolve o catálogo inteiro; importar-da-loja é o passo
      // seguinte, que traz os bytes para o R2 peça por peça.
      /* Ingestão do catálogo INTEIRO de imagens da loja. A rodada de
         sincronização já faz isto sozinha, com o catálogo que ela leu —
         esta rota existe para contingência e para conferir antes
         (`{"seco": true}` lê tudo e não grava nada). */
      if (path === '/api/fotos/sincronizar' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(await sincronizarFotosDaLoja(db, env, { seco: !!b.seco }));
      }
      if (path === '/api/fotos/vincular-da-loja' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(await vincularFotosDaLoja(db, env, { seco: !!b.seco, refazer: !!b.refazer }));
      }
      if (path === '/api/fotos/importar-da-loja' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(await importarFotosDaLoja(db, env, { seco: !!b.seco, refazer: !!b.refazer }));
      }
      /* A galeria de um código, na ordem da loja e com a principal na
         frente. Preserva as múltiplas imagens: a tela operacional mostra a
         principal, e quem precisar das outras não abre a Nuvemshop. */
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/fotos$/)) && met === 'GET') {
        return json(await fotosDoSku(db, decodeURIComponent(m[1])));
      }
      if (path === '/api/fotos/orfas' && met === 'GET') return json(await listarFotosOrfas(db));
      if (path === '/api/fotos/orfas/adotar' && met === 'POST') {
        return json(await adotarFotoOrfa(db, env, await request.json()));
      }
      // Upload dos bytes: o corpo da requisição É a imagem — sem envelope
      // JSON, porque não há razão para base64 inflar 33% um arquivo que já
      // vai carimbado com o Content-Type certo pelo próprio navegador.
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/foto\/(original|tratada)$/)) && met === 'PUT') {
        const [, skuBruto, versao] = m;
        const tipo = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        const bytes = await request.arrayBuffer();
        return json(await salvarFotoUpload(db, env, decodeURIComponent(skuBruto), versao, bytes, tipo));
      }
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/foto$/)) && met === 'DELETE') {
        return json(await removerFotos(db, env, decodeURIComponent(m[1])));
      }
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/foto\/fundo-branco$/)) && met === 'POST') {
        return json(await gerarFundoBranco(db, env, decodeURIComponent(m[1])));
      }
      // o que o agente de catálogo enxerga: pronto para publicar × o que falta
      if (path === '/api/catalogo/publicacao' && met === 'GET') {
        return json(await pendenciasDePublicacao(db));
      }

      if ((m = path.match(/^\/api\/produtos\/([^/]+)$/)) && met === 'PATCH') {
        return await editarProduto(db, decodeURIComponent(m[1]), await request.json());
      }
      // §19: entrada de mercadoria e ajuste são MOVIMENTOS, não digitação de saldo
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/movimento$/)) && met === 'POST') {
        return await lancarMovimento(db, decodeURIComponent(m[1]), await request.json());
      }
      // repartir o estoque de um código entre as opções em que ele é vendido
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/repartir$/)) && met === 'POST') {
        return await repartirVariacoes(db, decodeURIComponent(m[1]), await request.json());
      }
      // desfazer a repartição que a sincronização fez sozinha
      if (path === '/api/variacoes/desfazer-semeadura' && met === 'POST') {
        return await desfazerSemeadura(db);
      }

      /* ------------------------------------------------- estrutura da loja
         Leitura pura do catálogo REAL da Nuvemshop: uma linha por variante,
         com product_id, variant_id, SKU, atributos e valores, estoque,
         preço e imagem. Não escreve estoque, preço nem cadastro em lugar
         nenhum — nem aqui, nem lá. Saber o que a loja tem e decidir o que
         fazer com isso são atos separados de propósito. */
      if (path === '/api/loja/variantes/importar' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(await importarVariantesDaLoja(db, new Nuvemshop(env), { seco: !!b.seco }));
      }
      if ((m = path.match(/^\/api\/loja\/variantes\/([^/]+)$/)) && met === 'GET') {
        return json(await variantesDoSku(db, decodeURIComponent(m[1])));
      }
      // "Precisa de revisão — variações não mapeadas": o que a sincronização
      // decidiu NÃO escrever, com os dois números lado a lado.
      if (path === '/api/variacoes/revisao' && met === 'GET') {
        return json(await variacoesParaRevisao(db));
      }

      /* A confirmação humana que tira um produto de `sem_reparticao`.
         A chave de cada quantidade é o `variant_id`, nunca o nome — ver
         api/REGRAS.md § 8b. A soma tem de fechar exatamente com o estoque
         do produto, e a rota recusa em vez de escolher sozinha quem está
         certo (§19: repartir e corrigir o total são atos diferentes). */
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/variacoes\/distribuir$/)) && met === 'POST') {
        const r = await distribuirVariantes(db, decodeURIComponent(m[1]), await request.json());
        return json(r, r.status || (r.erro ? 400 : 200));
      }
      // Estrutura (atributos e valores). NÃO mexe em estoque: quantidade é
      // o outro ato, e passa pela rota acima.
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/variacoes$/)) && met === 'PUT') {
        const r = await definirVariacoes(db, decodeURIComponent(m[1]), await request.json());
        return json(r, r.status || (r.erro ? 400 : 200));
      }
      /* A estrutura como a tela de edição precisa dela: a loja, a nossa
         decisão e o saldo de cada variação na MESMA linha. `variantesDoSku`
         continua existindo em /api/loja/variantes/:sku, e é outra pergunta —
         ela lê a loja e só a loja. */
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/variacoes$/)) && met === 'GET') {
        const r = await estruturaDoProduto(db, decodeURIComponent(m[1]));
        return json(r, r.erro ? (r.status || 400) : 200);
      }

      /* ------------------------------------------- ciclo de vida da peça
         §28: quem tem histórico é arquivado, nunca apagado. Quem não tem
         (a peça de teste que entulha a lista) some de vez. Quem decide não
         é preferência: é a pergunta que `dependenciasDoProduto` faz ao
         banco. Nenhuma destas rotas encosta na Nuvemshop. */
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/dependencias$/)) && met === 'GET') {
        const r = await dependenciasDoProduto(db, decodeURIComponent(m[1]));
        return json(r, r.erro ? (r.status || 400) : 200);
      }
      if ((m = path.match(/^\/api\/produtos\/([^/]+)$/)) && met === 'DELETE') {
        const r = await excluirProduto(db, decodeURIComponent(m[1]));
        return json(r, r.status || (r.erro ? 400 : 200));
      }
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/arquivar$/)) && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        const r = await arquivarProduto(db, decodeURIComponent(m[1]), b);
        return json(r, r.status || (r.erro ? 400 : 200));
      }
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/desarquivar$/)) && met === 'POST') {
        const r = await desarquivarProduto(db, decodeURIComponent(m[1]));
        return json(r, r.status || (r.erro ? 400 : 200));
      }

      /* ------------------------------------------------------------- SKU
         Checar e gerar são duas rotas e não uma: checar é de leitura e pode
         ser chamada a cada tecla; gerar RESERVA um código no banco e por
         isso é POST, mesmo "só devolvendo um texto". */
      if (path === '/api/produtos/sku/checar' && met === 'GET') {
        return json(await checarSku(db, url.searchParams.get('sku')));
      }
      if (path === '/api/produtos/sku/gerar' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        /* O código que sai daqui é DEFINITIVO e já está reservado. Ele foi
           provisório enquanto a auditoria não tinha rodado contra o catálogo
           real; rodou, o formato ficou decidido — seis dígitos sorteados —
           e a tela não tem mais nada para relativizar. Ver api/REGRAS.md §17
           e GET /api/produtos/sku/auditoria. */
        return json(await gerarSku(db, { origem: b.origem || 'cadastro' }));
      }
      /* O padrão REAL dos códigos, medido no catálogo inteiro — produtos,
         fila de peças novas e o que a loja carrega nas variantes. Leitura
         pura: não muda gerador, não renumera, não decide. Existe porque
         "qual código o sistema deve gerar?" é pergunta de dado, não de
         opinião, e a resposta errada só aparece meses depois numa etiqueta. */
      if (path === '/api/produtos/sku/auditoria' && met === 'GET') {
        return json(await auditarSkus(db, {
          amostra: Math.min(200, Math.max(1, Number(url.searchParams.get('amostra')) || 25)),
        }));
      }

      // ---------------------------------------------------------------- kits
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/componentes$/)) && met === 'GET') {
        return json(await componentesDoKit(db, decodeURIComponent(m[1])));
      }
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/componentes$/)) && met === 'PUT') {
        return await definirKit(db, decodeURIComponent(m[1]), await request.json());
      }

      if (path === '/api/revendedoras' && met === 'POST') {
        const { nome, tel, cidade, cpf, endereco, obs } = await request.json();
        if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
        const r = await db.prepare(
          `INSERT INTO revendedoras (nome, tel, cidade, cpf, endereco, obs) VALUES (?,?,?,?,?,?) RETURNING *`
        ).bind(nome.trim(), tel || '', cidade || '', cpf || '', endereco || '', obs || '').first();
        return json(rev(r), 201);
      }
      if ((m = path.match(/^\/api\/revendedoras\/(\d+)$/)) && met === 'PATCH') {
        const id = +m[1];
        const b = await request.json();
        const campos = [], vals = [];
        for (const k of ['nome', 'tel', 'cidade', 'cpf', 'endereco', 'obs', 'status']) {
          if (b[k] !== undefined) { campos.push(`${k} = ?`); vals.push(b[k]); }
        }
        if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
        await db.prepare(`UPDATE revendedoras SET ${campos.join(', ')} WHERE id = ?`).bind(...vals, id).run();
        return json({ ok: true });
      }
      // §28: arquivar, nunca excluir — o histórico de maletas fica de pé
      if ((m = path.match(/^\/api\/revendedoras\/(\d+)\/arquivar$/)) && met === 'POST') {
        const id = +m[1];
        const abertas = await db.prepare(
          `SELECT COUNT(*) AS n FROM maletas WHERE rev_id = ? AND status IN ('aberta','em_acerto')`).bind(id).first();
        if (abertas.n > 0) {
          return json({ erro: `Esta revendedora tem ${abertas.n} maleta(s) em aberto. Encerre ou cancele antes de arquivar.` }, 409);
        }
        await db.prepare(`UPDATE revendedoras SET status = 'inativa' WHERE id = ?`).bind(id).run();
        return json({ ok: true });
      }

      if (path === '/api/maletas' && met === 'POST') {
        const { revId, abertaEm, acertoEm, obs } = await request.json();
        const r = await db.prepare(
          `INSERT INTO maletas (rev_id, status, aberta_em, acerto_em, obs) VALUES (?, 'aberta', ?, ?, ?) RETURNING *`
        ).bind(revId, abertaEm || null, acertoEm || null, obs || null).first();
        return json({ id: r.id, revId: r.rev_id, status: r.status, abertaEm: r.aberta_em, acertoEm: r.acerto_em, itens: {} }, 201);
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)$/)) && met === 'PATCH') {
        const id = +m[1];
        const { abertaEm, acertoEm, status } = await request.json();
        const campos = [], vals = [];
        if (abertaEm !== undefined) { campos.push('aberta_em = ?'); vals.push(abertaEm); }
        if (acertoEm !== undefined) { campos.push('acerto_em = ?'); vals.push(acertoEm); }
        if (status !== undefined) {
          if (!['aberta', 'em_acerto'].includes(status)) {
            return json({ erro: 'Use /acerto para encerrar e /cancelar para cancelar' }, 400);
          }
          campos.push('status = ?'); vals.push(status);
        }
        if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
        await db.prepare(`UPDATE maletas SET ${campos.join(', ')} WHERE id = ?`).bind(...vals, id).run();
        return json({ ok: true });
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)\/itens$/)) && met === 'POST') {
        return await adicionarItens(db, env, +m[1], await request.json());
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)\/acerto$/)) && met === 'POST') {
        return await encerrarAcerto(db, env, +m[1], await request.json());
      }
      // §6.1 + §28: maleta criada por engano é cancelada, não apagada
      if ((m = path.match(/^\/api\/maletas\/(\d+)\/cancelar$/)) && met === 'POST') {
        return await cancelarMaleta(db, env, +m[1], await request.json().catch(() => ({})));
      }

      if (path === '/api/config' && met === 'PUT') {
        const b = await request.json();
        /* `syncCorteEm` decide o que é história e o que é operação. Uma data
           ilegível gravada aqui derruba a sincronização inteira depois
           (sync.js › corteDePedidos recusa a rodada em vez de fingir que não
           há corte), então ela é recusada na entrada, onde alguém ainda está
           olhando. `null` é a forma de tirar o corte. */
        if (b.syncCorteEm !== undefined && b.syncCorteEm !== null
            && Number.isNaN(Date.parse(String(b.syncCorteEm)))) {
          return json({ erro: 'syncCorteEm precisa ser uma data ISO (ex.: "2026-08-23T12:00:00Z") ou null.' }, 400);
        }
        const stmts = [];
        /* Lista fechada de propósito: o `config` também guarda estado interno
           da sincronização (`syncUltimoPedido`), e deixar a tela escrever
           nele por engano faria o robô reler ou pular pedidos. Só os dois
           limites do freio são ajustáveis daqui. */
        for (const chave of ['prazoDias', 'prataPct', 'inventarioDias', 'faixas',
                             'syncLimiteMudancas', 'syncLimiteZerar',
                             /* Planejamento de maletas: quantas peças uma maleta
                                costuma levar e quanto tem de sobrar em casa. São
                                parâmetros do NEGÓCIO, não do robô — uma maleta de
                                60 peças e outra de 150 são operações diferentes, e
                                o número certo é o que a Sthefany usa. */
                             'maletaAlvoPecas', 'reservaMinima',
                             /* Corte do go-live: pedido da loja anterior a
                                esta data é história e não vira venda aqui.
                                Não é estado interno do robô — é uma decisão
                                de quem opera, tomada uma vez, e por isso
                                entra por uma rota autenticada e auditável em
                                vez de SQL solto na produção. Ver
                                sync.js › corteDePedidos. */
                             'syncCorteEm']) {
          if (b[chave] !== undefined) {
            stmts.push(db.prepare(
              `INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`
            ).bind(chave, JSON.stringify(b[chave])));
          }
        }
        if (stmts.length) await db.batch(stmts);
        return json({ ok: true });
      }

      if (path === '/api/clientes' && met === 'GET') {
        const busca = (url.searchParams.get('busca') || '').trim();
        const r = busca
          ? await db.prepare(`SELECT * FROM clientes WHERE nome LIKE ? ORDER BY nome LIMIT 20`).bind(`%${busca}%`).all()
          : await db.prepare(`SELECT * FROM clientes ORDER BY nome LIMIT 50`).all();
        return json(r.results.map(c => ({ id: c.id, nome: c.nome, tel: c.tel || '' })));
      }
      if (path === '/api/clientes' && met === 'POST') {
        const { nome, tel } = await request.json();
        if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
        const r = await db.prepare(`INSERT INTO clientes (nome, tel) VALUES (?, ?) RETURNING *`)
          .bind(nome.trim(), tel || '').first();
        return json({ id: r.id, nome: r.nome, tel: r.tel || '' }, 201);
      }

      // -------------------------------------------- sincronização da loja
      if (path === '/api/sync' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(await sincronizar(db, env, { forcar: !!b.forcar, seco: !!b.seco }));
      }
      if (path === '/api/sync' && met === 'GET') return json(await historicoSync(db));
      /* Dry-run de leitura pura: não abre execução, não puxa pedido, não
         grava retrato e não escreve na loja. É o que a tela mostra antes de
         pedir a confirmação. */
      if (path === '/api/sync/analisar' && met === 'POST') {
        return json(await analisarSincronizacao(db, env));
      }

      // ------------------------------------------------------ reconciliação
      if (path === '/api/reconciliacao' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return await abrirSessao(db, env, b.origem || 'nuvemshop');
      }
      // Planilha da Stéfane — Estoque Total: compara com produtos.qtd,
      // nunca escreve direto (docs/RECONCILIATION_ENGINE.md § Fonte da
      // verdade). `produtos` chega no mesmo formato que
      // POST /api/produtos/importar sempre aceitou.
      if (path === '/api/reconciliacao/planilha/estoque-total/analisar' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return await analisarPlanilhaEstoqueTotal(db, b.produtos);
      }
      // Planilha da Stéfane — Produtos Novos: só cria SKU inexistente,
      // nunca toca em SKU que já existe.
      if (path === '/api/reconciliacao/planilha/produtos-novos/analisar' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return await analisarPlanilhaProdutosNovos(db, b.produtos);
      }
      if ((m = path.match(/^\/api\/reconciliacao\/(\d+)$/)) && met === 'GET') {
        return await detalheSessao(db, +m[1]);
      }
      if ((m = path.match(/^\/api\/reconciliacao\/(\d+)\/itens\/(\d+)\/aprovar$/)) && met === 'POST') {
        return await aprovarItem(db, +m[1], +m[2]);
      }
      if ((m = path.match(/^\/api\/reconciliacao\/(\d+)\/itens\/(\d+)\/rejeitar$/)) && met === 'POST') {
        return await rejeitarItem(db, +m[1], +m[2]);
      }
      if ((m = path.match(/^\/api\/reconciliacao\/(\d+)\/cancelar$/)) && met === 'POST') {
        return await cancelarSessao(db, +m[1]);
      }
      if ((m = path.match(/^\/api\/reconciliacao\/(\d+)\/aplicar$/)) && met === 'POST') {
        return await aplicarSessao(db, env, +m[1]);
      }

      // ------------------------------------------------------- inventário
      if (path === '/api/inventarios' && met === 'GET') return await listarInventarios(db);
      if (path === '/api/inventarios' && met === 'POST') return await abrirInventario(db);
      if ((m = path.match(/^\/api\/inventarios\/(\d+)$/)) && met === 'GET') {
        return await detalheInventario(db, +m[1]);
      }
      if ((m = path.match(/^\/api\/inventarios\/(\d+)\/contagem$/)) && met === 'PUT') {
        return await salvarContagem(db, +m[1], await request.json());
      }
      if ((m = path.match(/^\/api\/inventarios\/(\d+)\/concluir$/)) && met === 'POST') {
        return await concluirInventario(db, +m[1]);
      }
      if ((m = path.match(/^\/api\/inventarios\/(\d+)\/ajustar$/)) && met === 'POST') {
        return await ajustarInventario(db, +m[1], await request.json());
      }
      if ((m = path.match(/^\/api\/inventarios\/(\d+)\/cancelar$/)) && met === 'POST') {
        return await cancelarInventario(db, +m[1]);
      }

      if (path === '/api/vendas' && met === 'POST') return await registrarVenda(db, env, await request.json());
      if (path === '/api/vendas' && met === 'GET') {
        return json(await listarVendas(db, url.searchParams.get('data') || hoje()));
      }
      if ((m = path.match(/^\/api\/vendas\/(\d+)\/cancelar$/)) && met === 'POST') {
        return await cancelarVenda(db, env, +m[1]);
      }
      if ((m = path.match(/^\/api\/vendas\/(\d+)\/nuvemshop$/)) && met === 'POST') {
        return json(await atualizarEstoqueDaVenda(db, env, +m[1]));
      }

      return json({ erro: 'Rota não encontrada' }, 404);
    } catch (e) {
      const msg = String((e && e.message) || e);
      /* Banco que ainda não recebeu a migracao-catalogo.sql responde
         "no such column: p.foto_original", que não diz a ninguém o que
         fazer. Aqui esse erro vira a instrução — o mesmo tratamento que os
         erros da Nuvemshop já recebem. */
      if (/no such (table|column)/i.test(msg) && /foto|produtos_pendentes|fotos_orfas/i.test(msg)) {
        /* TRÊS migrações mexem em foto, e mandar rodar a errada faz a pessoa
           perder a tarde. O que faltou é quem decide, e a ordem do teste
           importa: `loja_fotos` contém "foto_" e casaria com a regra de
           `foto_url` se viesse depois.

             loja_fotos  → a galeria do catálogo da loja
             foto_url    → o endereço da imagem na peça (vincular)
             o resto     → as colunas de foto do catálogo */
        const galeria = /loja_fotos/i.test(msg);
        const url = !galeria && /foto_url/i.test(msg);
        const qual = galeria ? 'fotos-loja' : (url ? 'foto-url' : 'catalogo');
        return json({
          erro: galeria
            ? 'As fotos do catálogo da loja precisam de uma migração que este banco ainda não recebeu.'
            : url
              ? 'Vincular fotos da loja precisa de uma migração que este banco ainda não recebeu.'
              : 'Esta parte precisa da migração do catálogo, que este banco ainda não recebeu.',
          detalhe: `Rode api/migracao-${qual}.sql no D1 — `
                 + 'o passo está no api/DEPLOY.md. O resto do painel funciona normalmente sem ela.',
          migracao: qual,
        }, 503);
      }
      return json({ erro: 'Falha interna', detalhe: msg }, 500);
    }
  }
}

const rev = r => ({
  id: r.id, nome: r.nome, tel: r.tel || '', cidade: r.cidade || '', cpf: r.cpf || '',
  endereco: r.endereco || '', obs: r.obs || '', status: r.status, criadaEm: r.criada_em,
});

async function configAtual(db) {
  const r = await db.prepare(`SELECT * FROM config`).all();
  const c = Object.fromEntries(r.results.map(x => [x.chave, JSON.parse(x.valor)]));
  return { prazoDias: c.prazoDias ?? 45, prataPct: c.prataPct ?? 10, faixas: c.faixas ?? FAIXAS_PADRAO };
}

/** §22: a importação não corrige em silêncio — devolve o que estranhou.
 *  §24: preço ausente entra como NULL, nunca como zero. */
async function importarProdutos(db, { produtos }) {
  if (!Array.isArray(produtos) || !produtos.length) return json({ erro: 'Lista vazia' }, 400);

  const existentes = new Map(
    (await db.prepare(`SELECT sku, qtd FROM produtos`).all()).results.map(p => [p.sku, p.qtd])
  );
  const cats = new Set((await db.prepare(`SELECT nome FROM categorias`).all()).results.map(c => c.nome));

  const stmts = [], avisos = [];
  let novos = 0, ajustados = 0;

  for (const p of produtos) {
    const sku = String(p.sku || '').trim();
    if (!sku) { avisos.push({ tipo: 'sku_vazio', detalhe: p.desc || '(sem descrição)' }); continue; }

    const preco = (p.preco === null || p.preco === undefined || p.preco === '' || +p.preco === 0) ? null : +p.preco;
    if (preco === null) avisos.push({ tipo: 'sem_preco', sku, detalhe: p.desc });

    let cat = p.cat || 'Outros';
    if (!cats.has(cat)) { avisos.push({ tipo: 'categoria_desconhecida', sku, detalhe: cat }); cat = 'Outros'; }

    const qtdAlvo = int(p.qtd);

    if (!existentes.has(sku)) {
      stmts.push(db.prepare(
        `INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES (?, ?, ?, ?, 0)`
      ).bind(sku, p.desc || sku, cat, preco));
      if (qtdAlvo !== 0) {
        stmts.push(...movimentar(db, {
          sku, tipo: 'entrada', quantidade: qtdAlvo, origem: 'importacao',
          obs: 'Saldo inicial da importação',
        }));
      }
      novos++;
    } else {
      stmts.push(db.prepare(
        `UPDATE produtos SET desc = ?, cat = ?, preco = ?, atualizado_em = datetime('now') WHERE sku = ?`
      ).bind(p.desc || sku, cat, preco, sku));
      // §19: a planilha traz um saldo-alvo; a diferença vira um AJUSTE rastreável
      const delta = qtdAlvo - existentes.get(sku);
      if (delta !== 0) {
        stmts.push(...movimentar(db, {
          sku, tipo: 'ajuste', quantidade: delta, origem: 'importacao',
          obs: `Importação: planilha diz ${qtdAlvo}, sistema tinha ${existentes.get(sku)}`,
        }));
        ajustados++;
      }
    }
  }

  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, novos, ajustados, avisos });
}

async function editarProduto(db, sku, b) {
  const campos = [], vals = [];
  if (b.desc !== undefined) { campos.push('desc = ?'); vals.push(String(b.desc)); }
  if (b.cat !== undefined) { campos.push('cat = ?'); vals.push(String(b.cat)); }
  if (b.preco !== undefined) { campos.push('preco = ?'); vals.push(b.preco === null ? null : +b.preco); }
  if (b.status !== undefined) { campos.push('status = ?'); vals.push(String(b.status)); }
  if (b.qtd !== undefined) {
    return json({ erro: 'Saldo não se edita direto (§19). Use POST /api/produtos/:sku/movimento' }, 400);
  }
  if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
  campos.push("atualizado_em = datetime('now')");
  await db.prepare(`UPDATE produtos SET ${campos.join(', ')} WHERE sku = ?`).bind(...vals, sku).run();
  return json({ ok: true });
}

/** Define (ou remove) os componentes de um kit — ver kit_componentes no
 *  schema. `componentes: []` remove o kit e o produto volta a ser normal.
 *
 *  Recusa transformar em kit um produto que ainda tem saldo próprio: virar
 *  kit muda o SIGNIFICADO do saldo (de "quanto existe" para "sempre 0,
 *  calculado pelos componentes"), e zerar isso sozinho seria inventar um
 *  ajuste que ninguém pediu (§19, §22). Ela lança um ajuste explícito
 *  primeiro — o histórico mostra o motivo — e só depois monta o kit. */
async function definirKit(db, kitSku, { componentes }) {
  const kit = await db.prepare(`SELECT sku, qtd, desc FROM produtos WHERE sku = ?`).bind(kitSku).first();
  if (!kit) return json({ erro: `Código ${kitSku} não está no catálogo` }, 404);

  const lista = Array.isArray(componentes) ? componentes.filter(c => c && c.sku && c.qtd > 0) : [];

  if (!lista.length) {
    await db.prepare(`DELETE FROM kit_componentes WHERE kit_sku = ?`).bind(kitSku).run();
    return json({ ok: true, kit: kitSku, componentes: [] });
  }

  if (kit.qtd !== 0) {
    return json({
      erro: `${kit.desc} tem ${kit.qtd} no saldo próprio. Zere com um ajuste antes de virar kit — `
          + 'transformar em kit sem isso apagaria esse número em silêncio.',
    }, 409);
  }
  const consignado = await consignadoDoSku(db, kitSku);
  if (consignado > 0) {
    return json({ erro: `${kit.desc} tem ${consignado} peça(s) em maleta. Kit não pode estar consignado.` }, 409);
  }

  for (const c of lista) {
    if (c.sku === kitSku) return json({ erro: 'Um kit não pode ser componente de si mesmo' }, 400);
    const comp = await db.prepare(`SELECT sku FROM produtos WHERE sku = ?`).bind(c.sku).first();
    if (!comp) return json({ erro: `Componente ${c.sku} não está no catálogo` }, 400);
    if (await ehKit(db, c.sku)) {
      return json({ erro: `${c.sku} também é um kit — kit dentro de kit não é suportado` }, 400);
    }
  }

  const stmts = [db.prepare(`DELETE FROM kit_componentes WHERE kit_sku = ?`).bind(kitSku)];
  for (const c of lista) {
    stmts.push(db.prepare(
      `INSERT INTO kit_componentes (kit_sku, componente_sku, qtd) VALUES (?, ?, ?)`
    ).bind(kitSku, c.sku, int(c.qtd)));
  }
  await db.batch(stmts);
  return json({ ok: true, kit: kitSku, componentes: lista });
}

async function lancarMovimento(db, sku, { tipo, quantidade, obs, variacao }) {
  const p = await db.prepare(`SELECT sku FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo` }, 404);
  if (!tipo) return json({ erro: 'Informe o tipo do movimento' }, 400);
  const q = int(quantidade);
  if (q === 0) return json({ erro: 'Quantidade não pode ser zero' }, 400);

  /* Código vendido em mais de uma opção precisa dizer QUAL — senão a peça
     entra no total sem entrar em aro nenhum, e a repartição fica devendo
     sem ninguém perceber. */
  const temVar = await db.prepare(
    `SELECT COUNT(*) AS n FROM produto_variacoes WHERE sku = ?`).bind(sku).first();
  if (temVar.n > 0 && !variacao) {
    return json({ erro: `${sku} é vendido em mais de uma opção. Diga qual (variacao).` }, 400);
  }
  if (variacao) {
    const existe = await db.prepare(
      `SELECT 1 FROM produto_variacoes WHERE sku = ? AND nome = ?`).bind(sku, variacao).first();
    if (!existe) return json({ erro: `${sku} não tem a opção "${variacao}"` }, 400);
  }

  try {
    await db.batch(movimentar(db, { sku, tipo, quantidade: q, origem: 'manual', obs, variacao: variacao || null }));
  } catch (e) {
    return json({ erro: String(e.message || e) }, 400);
  }
  return json({ ok: true, saldos: await saldosDoSku(db, sku) });
}

/** Desfaz uma repartição automática que não devia ter acontecido.
 *
 *  A primeira versão de `semearVariacoes` servia as variações na ordem até o
 *  total acabar. Com a loja carregando a herança do bug antigo — o total do
 *  código inteiro dentro da primeira variação — isso entupia a primeira e
 *  zerava as demais. O freio da rodada barrou o empurrão, mas a repartição
 *  já tinha sido gravada aqui.
 *
 *  Não apaga movimento (§28): lança a contrapartida. O histórico continua
 *  mostrando que a repartição aconteceu e que foi desfeita, com o motivo.
 *
 *  Só mexe em código cuja repartição veio TODA da semeadura automática. Se
 *  alguém corrigiu qualquer coisa à mão, aquele código fica como está —
 *  desfazer trabalho de gente é justamente o que não pode acontecer. */
async function desfazerSemeadura(db) {
  const auto = new Set((await db.prepare(
    `SELECT DISTINCT sku FROM movimentos
      WHERE origem = 'variacao' AND obs LIKE 'Repartido pela Nuvemshop%'`).all())
    .results.map(r => r.sku));
  if (!auto.size) return json({ ok: true, desfeitos: 0, motivo: 'nada foi semeado automaticamente' });

  const tocadoAMao = new Set((await db.prepare(
    `SELECT DISTINCT sku FROM movimentos
      WHERE variacao IS NOT NULL
        AND NOT (origem = 'variacao' AND obs LIKE 'Repartido pela Nuvemshop%')`).all())
    .results.map(r => r.sku));

  /* Agrupa pela MESMA chave que a razão usa hoje — nome E variante_id — e
     reverte com ela inteira. Reverter só pelo nome deixaria a soma do
     variante_id positiva e a do nome negativa: o total voltaria a zero, mas
     o casamento com a loja veria dois baldes que não fecham e travaria o
     código para sempre. */
  const saldos = (await db.prepare(
    `SELECT sku, variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
      WHERE variacao IS NOT NULL GROUP BY sku, variacao, variante_id`).all()).results;

  const stmts = [], desfeitos = new Set(), preservados = [...tocadoAMao].filter(s => auto.has(s));
  for (const r of saldos) {
    if (!auto.has(r.sku) || tocadoAMao.has(r.sku) || !r.saldo) continue;
    desfeitos.add(r.sku);
    stmts.push(...movimentar(db, {
      sku: r.sku, variacao: r.variacao, varianteId: r.variante_id,
      tipo: 'ajuste', quantidade: -r.saldo, origem: 'variacao',
      obs: `Repartição automática desfeita: a loja não sabia dizer quanto tem de "${r.variacao}"`,
    }));
    stmts.push(...movimentar(db, {
      sku: r.sku, tipo: 'ajuste', quantidade: r.saldo, origem: 'variacao',
      obs: `Repartição automática desfeita: "${r.variacao}" volta a ficar sem variação`,
    }));
  }

  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, desfeitos: desfeitos.size, preservados });
}

/** Reparte entre as variações um estoque que hoje é um número só.
 *
 *  É o passo que falta para os códigos com aro: o sistema sabe que existem 6
 *  anéis, mas não quantos são de cada aro. Repartir NÃO é corrigir o total —
 *  são dois atos diferentes, como no inventário (§19). Por isso a soma
 *  precisa bater com o que já existe, e a rota recusa quando não bate, em
 *  vez de escolher sozinha quem está certo.
 *
 *  Cada remanejo vira DOIS movimentos que se anulam no total: sai de "sem
 *  aro", entra no aro. Assim `produtos.qtd == SUM(movimentos.qtd)` continua
 *  valendo, e o histórico mostra a repartição em vez de um número que mudou
 *  sozinho. */
async function repartirVariacoes(db, sku, { distribuicao, obs }) {
  const p = await db.prepare(`SELECT sku, qtd FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo` }, 404);

  const vars = (await db.prepare(
    `SELECT nome, variante_id FROM produto_variacoes WHERE sku = ? ORDER BY ordem, nome`).bind(sku).all()).results;
  if (!vars.length) return json({ erro: `${sku} não tem variações para repartir` }, 400);

  const nomes = new Set(vars.map(v => v.nome));
  /* O id da variante viaja junto com o remanejo. Sem ele o movimento
     saberia "16" e nada mais, e "16" é nome que a loja pode renomear — o
     casamento na sincronização deixaria de encontrar a caixinha e o código
     travaria. Com o id, renomear lá não quebra nada aqui. */
  const idDe = new Map(vars.map(v => [v.nome, v.variante_id || null]));
  const idsValidos = new Set(vars.filter(v => v.variante_id).map(v => String(v.variante_id)));
  const nomeDoId = new Map(vars.filter(v => v.variante_id).map(v => [String(v.variante_id), v.nome]));

  const alvo = {};
  for (const [nome, q] of Object.entries(distribuicao || {})) {
    if (!nomes.has(nome)) return json({ erro: `${sku} não tem a opção "${nome}"` }, 400);
    const n = int(q);
    if (n < 0) return json({ erro: `Quantidade negativa em "${nome}"` }, 400);
    alvo[nome] = n;
  }

  const soma = Object.values(alvo).reduce((s, n) => s + n, 0);
  if (soma !== p.qtd) {
    return json({
      erro: `A soma das opções dá ${soma}, e o estoque de ${sku} é ${p.qtd}. ` +
            `Repartir não muda o total — se o total é que está errado, ajuste primeiro e reparta depois.`,
    }, 409);
  }

  /* Os saldos saem agrupados pelas DUAS chaves — nome e variante_id —
     porque é assim que a razão os guarda e é assim que a sincronização os
     lê. Agrupar só por nome faria a devolução de um saldo órfão sair por
     uma chave e o saldo original ficar na outra: os dois se anulariam no
     total e nenhum deles se anularia no casamento, deixando o código
     travado para sempre. */
  const baldes = (await db.prepare(
    `SELECT variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
      WHERE sku = ? AND variacao IS NOT NULL GROUP BY variacao, variante_id`).bind(sku).all()).results;

  /* Órfão é o balde que a sincronização também não conseguiria casar: id
     que não existe mais na loja, ou — quando o movimento nem id tem — nome
     que sumiu de lá. A regra é a mesma dos dois lados de propósito; se
     divergirem, esta rota "resolveria" algo que a sincronização continuaria
     recusando. */
  const ehOrfao = (b) => (b.variante_id
    ? !idsValidos.has(String(b.variante_id))
    : !nomes.has(b.variacao));

  const atual = new Map();
  const orfaos = [];
  for (const b of baldes) {
    if (ehOrfao(b)) { if (b.saldo) orfaos.push(b); continue; }
    // Quem tem id vale pelo nome ATUAL daquele id, não pelo nome que o
    // movimento gravou: renomear na loja não pode desalinhar a conta.
    const chave = b.variante_id ? nomeDoId.get(String(b.variante_id)) : b.variacao;
    atual.set(chave, (atual.get(chave) || 0) + b.saldo);
  }

  const stmts = [];
  const razao = obs || `Repartição do estoque de ${sku}`;
  let movidas = 0;
  for (const nome of nomes) {
    const delta = (alvo[nome] ?? 0) - (atual.get(nome) || 0);
    if (!delta) continue;
    movidas += Math.abs(delta);
    // entra (ou sai) do aro...
    stmts.push(...movimentar(db, {
      sku, variacao: nome, varianteId: idDe.get(nome),
      tipo: 'ajuste', quantidade: delta,
      origem: 'variacao', obs: `${razao}: "${nome}" passa a ter ${alvo[nome] ?? 0}`,
    }));
    // ...e sai (ou entra) de "sem aro", para o total não se mexer
    stmts.push(...movimentar(db, {
      sku, tipo: 'ajuste', quantidade: -delta,
      origem: 'variacao', obs: `${razao}: contrapartida de "${nome}"`,
    }));
  }

  /* Saldo preso numa variação que a loja NÃO tem mais volta para "sem
     variação" na mesma operação, e volta pela MESMA chave em que estava.

     Sem isto o produto viraria um beco sem saída: o aro sai do ar na loja,
     a peça continua contada nele, o casamento por variante_id não acha
     caixinha nenhuma para ela, a sincronização bloqueia o código — e não
     haveria como desbloquear, porque repartir só enxergava as variações que
     ainda existem. A pessoa veria "precisa de revisão" para sempre, sem
     botão que resolvesse. */
  for (const b of orfaos) {
    stmts.push(...movimentar(db, {
      sku, variacao: b.variacao, varianteId: b.variante_id,
      tipo: 'ajuste', quantidade: -b.saldo, origem: 'variacao',
      obs: `${razao}: "${b.variacao}" não existe mais na loja e volta a ficar sem variação`,
    }));
    stmts.push(...movimentar(db, {
      sku, tipo: 'ajuste', quantidade: b.saldo, origem: 'variacao',
      obs: `${razao}: contrapartida de "${b.variacao}", que saiu da loja`,
    }));
  }

  if (!stmts.length) return json({ ok: true, movidas: 0, jaEstava: true });
  await db.batch(stmts);
  return json({
    ok: true, movidas,
    orfaosDevolvidos: orfaos.map(b => ({ nome: b.variacao, varianteId: b.variante_id, saldo: b.saldo })),
    saldos: await saldosDoSku(db, sku),
  });
}

async function importarLoja(db, { snapshot, produtos }) {
  const stmts = [];
  if (snapshot) {
    stmts.push(db.prepare(
      `INSERT INTO loja_snapshot (id, lido_em, produtos_na_loja, produtos_casados, so_na_loja, codigos_casados, duplicados_json)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET lido_em=excluded.lido_em, produtos_na_loja=excluded.produtos_na_loja,
         produtos_casados=excluded.produtos_casados, so_na_loja=excluded.so_na_loja,
         codigos_casados=excluded.codigos_casados, duplicados_json=excluded.duplicados_json`
    ).bind(snapshot.lidoEm, snapshot.produtosNaLoja, snapshot.produtosCasados, snapshot.soNaLoja,
      snapshot.codigosCasados, JSON.stringify(snapshot.duplicados || [])));
  }
  stmts.push(db.prepare(`UPDATE produtos SET url_loja=NULL, estoque_loja=NULL, visivel=NULL`));
  for (const p of (produtos || [])) {
    stmts.push(db.prepare(`UPDATE produtos SET url_loja=?, estoque_loja=?, visivel=?, nome_loja=? WHERE sku=?`)
      .bind(p.urlLoja, p.estoqueLoja, p.visivel === null ? null : (p.visivel ? 1 : 0), p.nomeLoja || null, p.sku));
  }
  await db.batch(stmts);
  return json({ ok: true, n: (produtos || []).length });
}

async function publicarEstoqueDaOperacao(db, env) {
  const r = await sincronizarSomenteEstoque(db, env);
  if (!r.ok) return { status: 'erro', erro: r.erro };
  if (r.pausado) return { status: 'erro', erro: r.pausado.motivo, pausado: r.pausado };
  if ((r.semEmpurrar || []).length) {
    return { status: 'revisao', bloqueios: r.semEmpurrar, produtosAtualizados: r.produtosEnviados || 0 };
  }
  return {
    status: 'sincronizada', modo: 'somente_estoque',
    produtosAtualizados: r.produtosEnviados || 0, alteracoes: (r.mudancas || []).length,
  };
}

/** §6.2 impede enviar mais do que o disponível.
 *  §6.1 congela o preço no envio. */
async function adicionarItens(db, env, maletaId, { itens }) {
  const entradas = Object.entries(itens || {}).filter(([, q]) => q > 0);
  if (!entradas.length) return json({ erro: 'Nenhum item para adicionar' }, 400);

  const maleta = await db.prepare(`SELECT * FROM maletas WHERE id = ?`).bind(maletaId).first();
  if (!maleta) return json({ erro: 'Maleta não encontrada' }, 404);
  if (maleta.status !== 'aberta') return json({ erro: `Maleta está "${maleta.status}" — só dá para montar enquanto está aberta` }, 409);

  const stmts = [], recusados = [];
  let adicionados = 0;

  for (const [sku, qtd] of entradas) {
    const s = await saldosDoSku(db, sku);
    if (!s) { recusados.push({ sku, motivo: 'não está no catálogo' }); continue; }
    // Kit não reserva os componentes ao entrar na maleta (a consignação tem
    // efeito 0 no saldo, e o disponível do kit vem só dos componentes) —
    // deixar entrar deixaria o mesmo componente "disponível" duas vezes.
    // Melhor recusar com uma explicação do que consignar errado em silêncio.
    if (s.componentes) {
      recusados.push({ sku, desc: s.desc, motivo: 'é uma peça montada (kit) — venda direto, ainda não vai para maleta' });
      continue;
    }
    if (qtd > s.disponivel) {
      recusados.push({ sku, desc: s.desc, motivo: `só tem ${s.disponivel} disponível` });
      continue;
    }
    stmts.push(db.prepare(
      `INSERT INTO maleta_itens (maleta_id, sku, qtd, preco_envio) VALUES (?, ?, ?, ?)
       ON CONFLICT(maleta_id, sku) DO UPDATE SET qtd = qtd + excluded.qtd`
    ).bind(maletaId, sku, qtd, s.preco));
    // consignação: não muda o total, mas fica na razão (§18)
    stmts.push(...movimentar(db, {
      sku, tipo: 'consignacao', quantidade: qtd, origem: 'maleta',
      maletaId, revendedoraId: maleta.rev_id, obs: `${qtd} un. para a maleta ${maletaId}`,
    }));
    adicionados++;
  }

  if (stmts.length) await db.batch(stmts);
  const nuvemshop = adicionados ? await publicarEstoqueDaOperacao(db, env) : { status: 'nao_aplicavel' };
  return json({ ok: true, adicionados, recusados, nuvemshop });
}

/** §7, §8, §9, §13 — conferência, motivo, venda gerada e resumo financeiro. */
async function encerrarAcerto(db, env, maletaId, { devolvidas, faltas }) {
  const maleta = await db.prepare(`SELECT * FROM maletas WHERE id = ?`).bind(maletaId).first();
  if (!maleta) return json({ erro: 'Maleta não encontrada' }, 404);
  if (!['aberta', 'em_acerto'].includes(maleta.status)) {
    return json({ erro: `Maleta já está "${maleta.status}"` }, 409);
  }

  const itens = (await db.prepare(
    `SELECT mi.sku, mi.qtd, mi.preco_envio, p.desc
       FROM maleta_itens mi JOIN produtos p ON p.sku = mi.sku
      WHERE mi.maleta_id = ?`).bind(maletaId).all()).results;
  const porSku = new Map(itens.map(i => [i.sku, i]));
  const enviadas = itens.reduce((s, i) => s + i.qtd, 0);

  // §24: sem preço não dá para vender nem calcular comissão — para antes de gravar
  const semPreco = [];
  for (const f of (faltas || [])) {
    const item = porSku.get(f.sku);
    if (!item) return json({ erro: `Código ${f.sku} não está nesta maleta` }, 400);
    const vendeAlgo = (f.linhas || []).some(l => l.qtd > 0 && l.destino !== 'ficou');
    if (vendeAlgo && (item.preco_envio === null || item.preco_envio === undefined)) {
      semPreco.push({ sku: f.sku, desc: item.desc });
    }
  }
  if (semPreco.length) {
    return json({
      erro: 'Há peças sem preço entre as não devolvidas. Defina o preço antes de encerrar o acerto.',
      semPreco,
    }, 409);
  }

  const cfg = await configAtual(db);
  const stmts = [];
  const vendidos = [], ficam = {};
  let perdas = 0, baixas = 0;

  const totDev = Object.entries(devolvidas || {}).reduce((s, [, q]) => s + q, 0);
  for (const [sku, q] of Object.entries(devolvidas || {})) {
    if (!(q > 0)) continue;
    stmts.push(db.prepare(`UPDATE maleta_itens SET devolvida = ? WHERE maleta_id = ? AND sku = ?`)
      .bind(q, maletaId, sku));
    stmts.push(...movimentar(db, {
      sku, tipo: 'devolucao', quantidade: q, origem: 'acerto',
      maletaId, revendedoraId: maleta.rev_id, obs: `${q} un. devolvidas no acerto`,
    }));
  }

  const itensVenda = [];
  for (const f of (faltas || [])) {
    const item = porSku.get(f.sku);
    for (const l of (f.linhas || [])) {
      if (!(l.qtd > 0)) continue;
      if (l.destino === 'ficou') { ficam[f.sku] = (ficam[f.sku] || 0) + l.qtd; continue; }
      baixas += l.qtd;
      if (l.destino === 'perdida' || l.destino === 'quebra' || l.destino === 'dano') perdas += l.qtd;
      const tipo = { vendida: 'venda', perdida: 'perda', danificada: 'dano', brinde: 'brinde', troca: 'troca' }[l.destino] || 'venda';
      itensVenda.push({ sku: f.sku, desc: item.desc, qtd: l.qtd, preco: item.preco_envio, motivo: l.destino, tipo });
      if (l.destino === 'vendida') {
        vendidos.push({ qtd: l.qtd, preco: item.preco_envio, desc: item.desc });
      }
    }
  }

  const c = calcComissao(vendidos, cfg);
  const dataAcerto = hoje();

  // §9: as peças identificadas no acerto viram uma VENDA de verdade,
  // na mesma tabela da venda de balcão, marcada com origem='acerto'.
  let vendaId = null;
  if (itensVenda.length) {
    const v = await db.prepare(
      `INSERT INTO vendas (cliente_nome, revendedora_id, maleta_id, origem, data, total, nuvemshop_status)
       VALUES (NULL, ?, ?, 'acerto', ?, ?, 'pendente') RETURNING id`
    ).bind(maleta.rev_id, maletaId, dataAcerto, c.totalVendido).first();
    vendaId = v.id;
    for (const it of itensVenda) {
      stmts.push(db.prepare(
        `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(vendaId, it.sku, it.desc, it.qtd, it.preco || 0, it.motivo));
      stmts.push(...movimentar(db, {
        sku: it.sku, tipo: it.tipo, quantidade: it.qtd, origem: 'acerto',
        maletaId, revendedoraId: maleta.rev_id, vendaId,
        obs: `Acerto da maleta ${maletaId}: ${it.motivo}`,
      }));
    }
  }

  const acerto = {
    enviadas, devolvidas: totDev,
    vendidas: vendidos.reduce((s, v) => s + v.qtd, 0),
    perdas, baixas, vendaId,
    totalVendido: c.totalVendido,
    baseBanhada: c.baseBanhada, pct: c.pct, comissaoBanhada: c.comissaoBanhada,
    basePrata: c.basePrata, pctPrata: c.pctPrata, comissaoPrata: c.comissaoPrata,
    comissao: c.comissao, liquido: c.liquido,
    dias: maleta.aberta_em ? Math.round((Date.now() - new Date(maleta.aberta_em + 'T12:00:00')) / 86400000) : null,
  };

  stmts.push(db.prepare(`UPDATE maletas SET status='encerrada', encerrada_em=?, acerto_json=? WHERE id=?`)
    .bind(dataAcerto, JSON.stringify(acerto), maletaId));

  let novaMaletaId = null;
  if (Object.keys(ficam).length) {
    const nova = await db.prepare(
      `INSERT INTO maletas (rev_id, status, aberta_em, obs) VALUES (?, 'aberta', ?, ?) RETURNING id`
    ).bind(maleta.rev_id, dataAcerto, `Continuação da maleta ${maletaId}`).first();
    novaMaletaId = nova.id;
    for (const [sku, qtd] of Object.entries(ficam)) {
      const item = porSku.get(sku);
      stmts.push(db.prepare(
        `INSERT INTO maleta_itens (maleta_id, sku, qtd, preco_envio) VALUES (?, ?, ?, ?)`
      ).bind(novaMaletaId, sku, qtd, item.preco_envio));
      stmts.push(...movimentar(db, {
        sku, tipo: 'consignacao', quantidade: qtd, origem: 'acerto',
        maletaId: novaMaletaId, revendedoraId: maleta.rev_id,
        obs: `Ficou com a revendedora, seguiu para a maleta ${novaMaletaId}`,
      }));
    }
  }

  await db.batch(stmts);
  // Mesmo um acerto sem venda pode devolver todas as peças para casa e,
  // portanto, precisa aumentar o estoque online imediatamente.
  const nuvemshop = vendaId
    ? await atualizarEstoqueDaVenda(db, env, vendaId)
    : await publicarEstoqueDaOperacao(db, env);
  return json({ ok: true, acerto, novaMaletaId, vendaId, nuvemshop });
}

/** §28: maleta errada é cancelada. As peças voltam a ficar disponíveis
 *  porque a maleta deixa de contar como consignação — e fica o registro. */
async function cancelarMaleta(db, env, maletaId, { motivo }) {
  const maleta = await db.prepare(`SELECT * FROM maletas WHERE id = ?`).bind(maletaId).first();
  if (!maleta) return json({ erro: 'Maleta não encontrada' }, 404);
  if (maleta.status === 'encerrada') return json({ erro: 'Maleta encerrada não pode ser cancelada' }, 409);
  if (maleta.status === 'cancelada') return json({ erro: 'Maleta já está cancelada' }, 409);

  const itens = (await db.prepare(`SELECT sku, qtd FROM maleta_itens WHERE maleta_id = ?`).bind(maletaId).all()).results;
  const stmts = itens.flatMap(i => movimentar(db, {
    sku: i.sku, tipo: 'devolucao', quantidade: i.qtd, origem: 'cancelamento',
    maletaId, revendedoraId: maleta.rev_id, obs: `Maleta ${maletaId} cancelada${motivo ? ': ' + motivo : ''}`,
  }));
  stmts.push(db.prepare(`UPDATE maletas SET status='cancelada', encerrada_em=?, obs=? WHERE id=?`)
    .bind(hoje(), motivo || 'Cancelada', maletaId));
  await db.batch(stmts);
  const nuvemshop = itens.length ? await publicarEstoqueDaOperacao(db, env) : { status: 'nao_aplicavel' };
  return json({ ok: true, nuvemshop });
}

/** §24: peça sem preço bloqueia a venda, em vez de vender por R$ 0. */
async function varianteDaVenda(db, sku, varianteId) {
  const loja = (await db.prepare(
    `SELECT variante_id, nome FROM loja_variantes WHERE sku_norm = ? ORDER BY posicao`
  ).bind(sku).all()).results;
  if (varianteId != null && varianteId !== '') {
    const v = loja.find(x => String(x.variante_id) === String(varianteId));
    if (!v) return { erro: `${sku}: o variant_id escolhido não pertence mais a este código na Nuvemshop.` };
    return { varianteId: String(v.variante_id), variacao: v.nome || null, exigeSaldo: loja.length > 1 };
  }
  if (loja.length === 1) return { varianteId: String(loja[0].variante_id), variacao: loja[0].nome || null, exigeSaldo: false };
  if (loja.length > 1) return { erro: `${sku} tem mais de uma variação. Diga qual foi vendida.` };
  return { varianteId: null, variacao: null };
}

async function registrarVenda(db, env, { clienteId, clienteNome, itens }) {
  const entradas = (itens || []).filter(i => i.qtd > 0);
  if (!entradas.length) return json({ erro: 'Nenhum item na venda' }, 400);
  if (!clienteNome || !clienteNome.trim()) return json({ erro: 'Nome da cliente é obrigatório' }, 400);

  const linhas = [];
  // Quanto de cada SKU-base este carrinho já reservou até aqui. Existe por
  // causa dos kits: dois anúncios que usam o mesmo componente (o pingente
  // que é comum a "Colar Casal" e "Colar Filho(a)") não podem ser validados
  // cada um contra o disponível do BANCO — o banco só muda depois, no
  // db.batch() lá embaixo. Sem isto, vender os dois no mesmo carrinho
  // aprovaria os dois contra a mesma peça física.
  const reservado = new Map();
  const disponivelReal = (sku, disponivelNoBanco) => disponivelNoBanco - (reservado.get(sku) || 0);
  const reservar = (sku, qtd) => reservado.set(sku, (reservado.get(sku) || 0) + qtd);

  for (const entrada of entradas) {
    const sku = String(entrada.sku || '').trim().toUpperCase();
    const qtd = +entrada.qtd || 0;
    const s = await saldosDoSku(db, sku);
    if (!s) return json({ erro: `Código ${sku} não está no catálogo`, sku }, 400);
    if (s.preco === null || s.preco === undefined) {
      return json({ erro: `${s.desc} está sem preço cadastrado. Defina o preço antes de vender.`, sku }, 409);
    }

    let disp;
    if (s.componentes) {
      // disponível do kit descontando o que OUTRAS linhas deste mesmo
      // carrinho já reservaram dos componentes em comum — não o disponível
      // "puro" do banco, que ainda não sabe de nada até o batch lá embaixo
      disp = Math.min(...await Promise.all(s.componentes.map(async c => {
        const sc = await saldosDoSku(db, c.sku);
        return Math.floor(disponivelReal(c.sku, sc.disponivel) / c.qtd);
      })));
    } else {
      disp = disponivelReal(sku, s.disponivel);
    }
    if (qtd > disp) {
      return json({ erro: `${s.desc}: só tem ${disp} disponível`, sku }, 409);
    }
    if (s.componentes) { for (const c of s.componentes) reservar(c.sku, qtd * c.qtd); }
    else { reservar(sku, qtd); }
    const v = await varianteDaVenda(db, sku, entrada.varianteId);
    if (v.erro) return json({ erro: v.erro, sku }, 409);
    if (v.varianteId && v.exigeSaldo) {
      const saldo = await db.prepare(`
        SELECT COALESCE(SUM(qtd),0) saldo FROM movimentos
         WHERE sku=? AND (variante_id=? OR (variante_id IS NULL AND variacao=?))
      `).bind(sku, v.varianteId, v.variacao).first();
      if (+saldo.saldo < qtd) {
        return json({ erro: `${s.desc} · ${v.variacao || v.varianteId}: saldo da variação é ${saldo.saldo}. Reparta em Pendências antes de vender.`, sku }, 409);
      }
    }
    linhas.push({ sku, qtd, preco: s.preco, desc: s.desc, componentes: s.componentes || null,
      varianteId: v.varianteId, variacao: v.variacao });
  }

  const total = linhas.reduce((s, l) => s + l.preco * l.qtd, 0);
  const data = hoje();
  const venda = await db.prepare(
    `INSERT INTO vendas (cliente_id, cliente_nome, origem, data, total, nuvemshop_status)
     VALUES (?, ?, 'balcao', ?, ?, 'pendente') RETURNING id`
  ).bind(clienteId || null, clienteNome.trim(), data, total).first();

  const stmts = [];
  for (const l of linhas) {
    stmts.push(db.prepare(
      `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, variacao, variante_id)
       VALUES (?, ?, ?, ?, ?, 'venda', ?, ?)`
    ).bind(venda.id, l.sku, l.desc, l.qtd, l.preco, l.variacao, l.varianteId));
    // Kit: a baixa vai nos componentes, não no kit — ele não tem saldo
    // próprio. O recibo (venda_itens acima) continua mostrando o kit
    // inteiro, porque é assim que ela pensa na venda.
    if (l.componentes) {
      stmts.push(...await movimentarKit(db, {
        kitSku: l.sku, tipo: 'venda', quantidade: l.qtd, origem: 'venda',
        vendaId: venda.id, obs: `Venda ${venda.id} · ${clienteNome.trim()}`,
      }));
    } else {
      stmts.push(...movimentar(db, {
        sku: l.sku, tipo: 'venda', quantidade: l.qtd, origem: 'venda',
        vendaId: venda.id, obs: `Venda ${venda.id} · ${clienteNome.trim()}`,
        variacao: l.variacao, varianteId: l.varianteId,
      }));
    }
  }
  await db.batch(stmts);
  const nuvemshop = await atualizarEstoqueDaVenda(db, env, venda.id);
  return json({ ok: true, id: venda.id, data, total, itens: linhas, nuvemshop }, 201);
}

/** §19 e §28: cancelar cria movimentação inversa, não apaga a venda. */
async function cancelarVenda(db, env, vendaId) {
  const v = await db.prepare(`SELECT * FROM vendas WHERE id = ?`).bind(vendaId).first();
  if (!v) return json({ erro: 'Venda não encontrada' }, 404);
  if (v.cancelada) return json({ erro: 'Venda já está cancelada' }, 409);

  const itens = (await db.prepare(`SELECT * FROM venda_itens WHERE venda_id = ?`).bind(vendaId).all()).results;
  const stmts = [];
  for (const i of itens) {
    // se o sku vendido era um kit, o estorno também precisa ir para os
    // componentes — é lá que a baixa original aconteceu
    if (await ehKit(db, i.sku)) {
      stmts.push(...await movimentarKit(db, {
        kitSku: i.sku, tipo: 'cancelamento', quantidade: +i.qtd, origem: 'cancelamento',
        vendaId, obs: `Estorno da venda ${vendaId}`,
      }));
    } else {
      stmts.push(...movimentar(db, {
        sku: i.sku, tipo: 'cancelamento', quantidade: +i.qtd, origem: 'cancelamento',
        vendaId, obs: `Estorno da venda ${vendaId}`,
        variacao: i.variacao, varianteId: i.variante_id,
      }));
    }
  }
  stmts.push(db.prepare(`UPDATE vendas SET cancelada = 1 WHERE id = ?`).bind(vendaId));
  await db.batch(stmts);
  const nuvemshop = await atualizarEstoqueDaVenda(db, env, vendaId);
  return json({ ok: true, nuvemshop });
}

async function listarVendas(db, data) {
  const vendas = (await db.prepare(`SELECT * FROM vendas WHERE data = ? ORDER BY id`).bind(data).all()).results;
  const itens = (await db.prepare(
    `SELECT vi.* FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id WHERE v.data = ?`).bind(data).all()).results;
  const porVenda = new Map();
  for (const it of itens) {
    if (!porVenda.has(it.venda_id)) porVenda.set(it.venda_id, []);
    porVenda.get(it.venda_id).push({
      sku: it.sku, desc: it.desc, qtd: it.qtd, preco: it.preco, motivo: it.motivo,
      variacao: it.variacao, varianteId: it.variante_id,
    });
  }
  return vendas.map(v => ({
    id: v.id, origem: v.origem, clienteNome: v.cliente_nome, revendedoraId: v.revendedora_id,
    maletaId: v.maleta_id, data: v.data, total: v.total, cancelada: !!v.cancelada,
    criadaEm: v.criada_em, externoId: v.externo_id,
    nuvemshopStatus: v.nuvemshop_status, nuvemshopErro: v.nuvemshop_erro,
    itens: porVenda.get(v.id) || [],
  }));
}
