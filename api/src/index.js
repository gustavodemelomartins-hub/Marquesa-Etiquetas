import { checarChave, respostaNaoAutorizada, json, comCors } from './auth.js';
import { criarRoteador } from './http/router.js';
import { rotas } from './http/routes/index.js';
import { movimentar, saldosDoSku, movimentarKit, ehKit } from './estoque.js';
import { sincronizar, analisarSincronizacao } from './sync.js';
import { lerFotoParaServir } from './fotos.js';
import { conferirAssinaturaFoto } from './assinatura.js';
import { variantesDoSku } from './variantes.js';
import { dependenciasDoProduto } from './produtos.js';
import { Nuvemshop } from './nuvemshop.js';
import { trocarCodigoPorToken } from './nuvemshop-oauth.js';
import { atualizarEstoqueDaVenda } from './vendas-estoque-nuvemshop.js';
/* A normalização de nome de cliente é UMA, e mora no importador histórico.
   Este arquivo tinha uma cópia dela (`normalizarTextoSimples`) com a mesma
   regra escrita de novo — e cópia de regra é divergência esperando data
   marcada. §21 do plano mestre já cobrou essa dívida uma vez. */
import { normalizarNomeCliente } from './vendas-historico-normalizar.js';
import { painel } from './analytics.js';
/* §30 · §31 · §32 — as três áreas novas de Vendas. Cada uma num arquivo
   próprio porque cada uma tem uma regra própria de o que NÃO fazer, e essa
   regra some quando o código mora dentro do roteador. */
/* §37 — a lista única de quem deve. Ver api/src/contas-receber.js. */
/* §41 — corrigir o código de uma peça já vendida, sem cancelar a venda. */
import { corrigirItemDeVenda } from './venda-correcao.js';
/* §43 — Monte seu Colar: base + componentes + configuração da venda. */
import {
  listarModelos, salvarModelo, prepararPersonalizacoes,
  gravarPersonalizacoes, personalizacoesDeVendas, personalizacaoAtiva,
} from './personalizacao.js';
/* §42 — a Central de Pendências e as duas formas de resolver uma variação. */
/* §34 — medição de leitura do D1. Desligada por padrão; ver d1-metrica.js. */
import {
  criarContador, medirD1, carimbarMetrica, metricasLigadas,
} from './d1-metrica.js';
import {
  abrirSessao,
  aprovarItem,
  rejeitarItem,
  cancelarSessao,
  aplicarSessao,
  analisarPlanilhaEstoqueTotal,
  analisarPlanilhaProdutosNovos,
} from './reconciliacao.js';

/* Rotas já extraídas do despachante. A corrente de `if` abaixo continua
   respondendo tudo o que ainda não migrou — inclusive o 404 final. */
const despacharRota = criarRoteador(rotas);

const hoje = () => new Date().toISOString().slice(0, 10);

export default {
  /** O CORS é aplicado uma única vez, na saída — assim nenhuma rota nova
   *  pode esquecer de devolvê-lo. */
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }), request, env);
    /* §34 — medir antes de otimizar. Desligado, `contador` é null e o
       binding do D1 segue direto, sem envelope nenhum: a medição não pode
       custar nada quando não está sendo usada. */
    const contador = metricasLigadas(request, env) ? criarContador() : null;
    const resposta = await rotear(request, env, contador);
    return comCors(carimbarMetrica(resposta, contador), request, env);
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

async function rotear(request, env, contador = null) {
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

    const db = medirD1(env.DB, contador);
    try {
      const daTabela = await despacharRota({ request, env, url, db, path, metodo: met });
      if (daTabela) return daTabela;



      /* ----------------------------------------- estoque total e peças novas
         Dois fluxos separados de propósito. O primeiro ajusta quantidade de
         quem já existe e NUNCA cria; o segundo cria quem não existe e NUNCA
         altera. Cada um analisa antes de aplicar, e a análise não escreve. */
      /* `origem: 'manual'` muda uma coisa só: liga a regra de formato do
         código digitado à mão (seis dígitos). Planilha e fila continuam
         aceitando o código que o fornecedor ou a loja escreveu. */

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
      /* A galeria de um código, na ordem da loja e com a principal na
         frente. Preserva as múltiplas imagens: a tela operacional mostra a
         principal, e quem precisar das outras não abre a Nuvemshop. */


      /* ------------------------------------------------- estrutura da loja
         Leitura pura do catálogo REAL da Nuvemshop: uma linha por variante,
         com product_id, variant_id, SKU, atributos e valores, estoque,
         preço e imagem. Não escreve estoque, preço nem cadastro em lugar
         nenhum — nem aqui, nem lá. Saber o que a loja tem e decidir o que
         fazer com isso são atos separados de propósito. */

      /* §42 — a CENTRAL DE PENDÊNCIAS.
         O sistema já dizia "REVISAR VARIAÇÃO" com precisão e parava ali.
         Aqui todos os casos em aberto de todas as fontes viram uma lista só,
         cada um com o caminho para resolver. É leitura derivada do estado —
         não há tabela de pendências, e resolver o caso o faz sumir sozinho.
         Resolver uma variação é dizer QUAL peça saiu: identidade, nunca uma
         segunda baixa de estoque. */

      /* A confirmação humana que tira um produto de `sem_reparticao`.
         A chave de cada quantidade é o `variant_id`, nunca o nome — ver
         api/REGRAS.md § 8b. A soma tem de fechar exatamente com o estoque
         do produto, e a rota recusa em vez de escolher sozinha quem está
         certo (§19: repartir e corrigir o total são atos diferentes). */
      /* A estrutura como a tela de edição precisa dela: a loja, a nossa
         decisão e o saldo de cada variação na MESMA linha. `variantesDoSku`
         continua existindo em /api/loja/variantes/:sku, e é outra pergunta —
         ela lê a loja e só a loja. */

      /* ------------------------------------------- ciclo de vida da peça
         §28: quem tem histórico é arquivado, nunca apagado. Quem não tem
         (a peça de teste que entulha a lista) some de vez. Quem decide não
         é preferência: é a pergunta que `dependenciasDoProduto` faz ao
         banco. Nenhuma destas rotas encosta na Nuvemshop. */

      /* ------------------------------------------------------------- SKU
         Checar e gerar são duas rotas e não uma: checar é de leitura e pode
         ser chamada a cada tecla; gerar RESERVA um código no banco e por
         isso é POST, mesmo "só devolvendo um texto". */
      /* O padrão REAL dos códigos, medido no catálogo inteiro — produtos,
         fila de peças novas e o que a loja carrega nas variantes. Leitura
         pura: não muda gerador, não renumera, não decide. Existe porque
         "qual código o sistema deve gerar?" é pergunta de dado, não de
         opinião, e a resposta errada só aparece meses depois numa etiqueta. */




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

      /* A busca de cliente do balcão. Ela é digitada com a peça na mão e o
         leitor de código de barras ainda quente, então precisa achar a
         pessoa por qualquer pedaço do nome — e sem depender de acento:
         quem digita "vitoria" tem de encontrar "Vitória". Por isso a
         comparação é contra `nome_norm`, gravado pelo MESMO normalizador
         que a importação histórica usa, com `nome` como rede de segurança
         para cadastro antigo que ainda não tem a coluna preenchida.

         Telefone entra na mesma caixa: quem tem o número na conversa do
         WhatsApp acha mais rápido por ele do que por um sobrenome que pode
         ter sido escrito de dois jeitos. */

      // -------------------------------------------- sincronização da loja
      if (path === '/api/sync' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(await sincronizar(db, env, { forcar: !!b.forcar, seco: !!b.seco }));
      }
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
      // nunca escreve direto (docs/domains/RECONCILIATION_ENGINE.md § Fonte da
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


      if (path === '/api/vendas' && met === 'POST') return await registrarVenda(db, env, await request.json());
      if (path === '/api/vendas' && met === 'GET') {
        return json(await listarVendas(db, url.searchParams.get('data') || hoje()));
      }
      /* §32 — tudo o que aconteceu comercialmente numa data, de todas as
         origens e sem duplicidade. É o que a lista por dia mostrava pela
         metade: venda de balcão, linha de planilha, acerto de revendedora,
         maleta que saiu, brinde e troca de garantia. */
      /* §35 — os três cartões de Lançamentos, calculados no servidor a
         partir de TODAS as origens comerciais da data escolhida. Antes eles
         eram somados no navegador sobre `GET /api/vendas`, que só conhece a
         tabela `vendas`: um dia histórico aparecia zerado com a lista cheia
         logo abaixo. O cartão de acerto passa a mostrar o LÍQUIDO da
         Marquesa (bruto − comissão), e não "peças que a revendedora não
         devolveu" — peça em maleta não é venda. */
      /* §29 — o dinheiro entrou. Registra a data DO PAGAMENTO e não toca na
         data da venda; não mexe em estoque, porque a peça já saiu quando a
         venda foi registrada. */
      if ((m = path.match(/^\/api\/vendas\/(\d+)\/pagamento$/)) && met === 'POST') {
        return await registrarPagamentoVenda(db, +m[1], await request.json().catch(() => ({})));
      }
      /* §41 — o código da peça estava errado e a venda continua valendo.
         Mantém venda, cliente, data e preço; troca só a identidade da peça,
         devolve uma unidade ao código errado e tira uma do certo (venda do
         sistema) ou não movimenta nada (linha da planilha, cujo estoque já
         estava refletido). Registra a auditoria em `venda_item_correcoes`. */
      /* §43 — Monte seu Colar. Os modelos são DADO, não interface: uma
         página de produto da Nuvemshop pode ler daqui e postar a composição
         em `POST /api/vendas` sem que nada mude, e as duas telas passam a
         ser duas vistas da mesma regra em vez de duas regras. */
      if (path === '/api/personalizacao/modelos' && (met === 'GET' || met === 'POST')) {
        /* Desligado no lançamento de 2026-09-06 — ver personalizacaoAtiva(). */
        if (!personalizacaoAtiva(env)) {
          return json({
            erro: 'Produtos Montáveis (Monte seu Colar) está temporariamente desativado.',
            codigo: 'PERSONALIZACAO_DESATIVADA',
          }, 503);
        }
        if (met === 'GET') {
          return json(await listarModelos(db, {
            incluirInativos: url.searchParams.get('inativos') === '1',
          }));
        }
        const r = await salvarModelo(db, await request.json().catch(() => ({})));
        return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
      }
      if (path === '/api/vendas/corrigir-item' && met === 'POST') {
        const r = await corrigirItemDeVenda(db, await request.json().catch(() => ({})));
        return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
      }
      if ((m = path.match(/^\/api\/vendas\/(\d+)\/cancelar$/)) && met === 'POST') {
        return await cancelarVenda(db, env, +m[1]);
      }
      if ((m = path.match(/^\/api\/vendas\/(\d+)\/nuvemshop$/)) && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(await atualizarEstoqueDaVenda(db, env, +m[1], { forcar: !!b.forcar }));
      }

      /* O retrato do que está no ar: quantas vendas, quanto faturamento, de
         qual arquivo. É o que a tela mostra ANTES de propor a troca — trocar
         sem saber o que está sendo trocado é o mesmo que não perguntar. */
      /* TROCAR a planilha: reverte o que está de pé e importa a corrigida,
         numa operação só. Importar por cima SEM reverter é o caminho que
         duplicaria o faturamento — a trava de idempotência é por hash do
         arquivo, e um arquivo corrigido tem hash novo. */


      // Cobrança é uma decisão financeira versionada. Nenhuma destas rotas
      // chama estoque ou rebaixa a venda quando o dinheiro entra.
      /* §37 — as três fontes de dívida de cliente numa lista só: compra
         histórica em aberto, venda do sistema não paga e diferença de troca
         de garantia. Cada linha traz uma `chave` (`historico:12`,
         `venda:45`, `troca:7`) que diz de onde veio e para onde a ação vai.
         As rotas antigas continuam válidas e tratam só o lado histórico. */




      /* §1 da revisão — o estado de pagamento das vendas, ANTES do backfill.
         Somente leitura, e roda em banco que ainda não tem as colunas novas:
         é o relatório que decide, não o efeito de já ter decidido. */


      return json({ erro: 'Rota não encontrada' }, 404);
    } catch (e) {
      const msg = String((e && e.message) || e);
      /* `wrangler tail` imprime o OUTCOME da invocação, e uma exceção que
         este catch trata sai como "Ok" — foi por isso que uma queda total do
         painel apareceu no tail como duas requisições saudáveis. O log
         abaixo é a única coisa que faz a causa chegar até quem está olhando.
         Rota e método não são segredo; a chave viaja no cabeçalho e não é
         impressa aqui. */
      console.error('[api] ' + met + ' ' + path + ' → ' + msg, (e && e.stack) || '');
      /* Banco que ainda não recebeu a migracao-catalogo.sql responde
         "no such column: p.foto_original", que não diz a ninguém o que
         fazer. Aqui esse erro vira a instrução — o mesmo tratamento que os
         erros da Nuvemshop já recebem. */
      /* Mesmo tratamento das fotos, para a coluna nova da ficha de cliente:
         "no such column: cpf" não diz a ninguém o que fazer. */
      if (/no such column/i.test(msg) && /\bcpf(_norm)?\b/i.test(msg)) {
        return json({
          erro: 'A ficha de cliente com CPF precisa de uma migração que este banco ainda não recebeu.',
          detalhe: 'Rode api/migracao-cliente-cpf.sql no D1 — o passo está no api/DEPLOY.md. '
                 + 'O resto do painel funciona normalmente sem ela.',
          migracao: 'cliente-cpf',
        }, 503);
      }
      /* Idem para o desconto por peça (§27). Sem a migração, VENDER quebra —
         é o caminho mais crítico do painel — então a mensagem tem de dizer o
         que rodar, e não devolver um erro de SQL para quem está no balcão. */
      if (/no such column/i.test(msg) && /\b(preco_tabela|desconto_valor|desconto_rotulo)\b/i.test(msg)) {
        return json({
          erro: 'O desconto por peça precisa de uma migração que este banco ainda não recebeu.',
          detalhe: 'Rode api/migracao-venda-desconto.sql no D1 — o passo está no api/DEPLOY.md. '
                 + 'Até lá, venda sem alterar preço continua funcionando.',
          migracao: 'venda-desconto',
        }, 503);
      }
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
      /* Limite de leitura do D1. Não é falha de código nem de dado, e
         chamá-lo de "Falha interna" mandou procurar no lugar errado — numa
         revendedora recém-cadastrada, num payload quebrado, no banco de
         produção. A cota é DIÁRIA e da CONTA Cloudflare, não do banco: por
         isso DEV e produção param no mesmo instante, embora tenham D1
         separados. E só as rotas que LEEM o banco caem: `/api/health` não
         toca no D1 e continua respondendo 200, o que faz o Worker parecer
         saudável enquanto o painel inteiro está fora do ar. */
      if (/exceeded/i.test(msg) && /(daily|limit)/i.test(msg) && /(D1|row read|rows read)/i.test(msg)) {
        return json({
          erro: 'O limite diário de leitura do banco (D1) foi atingido nesta conta Cloudflare.',
          detalhe: 'Não é erro de cadastro nem de venda: a cota é da CONTA, e por isso o DEV para junto. '
                 + 'Ela se renova à meia-noite UTC (21h de Brasília). Para deixar de depender disso, o '
                 + 'plano Workers Paid eleva o limite. Mensagem do banco: ' + msg,
          limite: 'd1-leitura-diaria',
        }, 503);
      }
      return json({ erro: 'Falha interna', detalhe: msg }, 500);
    }
  }
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

async function registrarVenda(db, env, {
  clienteId, clienteNome, itens, data: dataPedida,
  /* §43 — as composições do "Monte seu Colar", no MESMO carrinho dos itens
     normais. Elas entram aqui, e não numa rota própria, porque a venda é
     uma só: separar criaria duas vendas para uma compra, e o histórico da
     cliente mostraria a mesma tarde duas vezes.
     `estoqueJaRefletido` é o §7.4 — registrar uma venda personalizada que
     JÁ aconteceu, sem baixar peça que já saiu meses atrás. */
  personalizacoes: personalizacoesPedidas, estoqueJaRefletido: estoqueJaRefletidoPedido,
  /* §29 e §13 do pacote: a venda fecha dizendo se foi paga e por quê ela
     aconteceu. Os dois campos são OPCIONAIS e nascem com o valor que o
     sistema já assumia — venda paga hoje —, então quem não os manda
     continua com o comportamento de sempre. */
  pago: pagoPedido, dataPagamento: dataPagamentoPedida, observacao: observacaoPedida,
}) {
  const entradas = (itens || []).filter(i => i.qtd > 0);
  const composicoes = Array.isArray(personalizacoesPedidas) ? personalizacoesPedidas : [];
  /* Desligado no lançamento de 2026-09-06 — ver personalizacaoAtiva(). Falha
     antes de tocar catálogo ou D1: uma venda comum (sem composições) não
     passa por aqui e continua funcionando igual. */
  if (composicoes.length && !personalizacaoAtiva(env)) {
    return json({
      erro: 'Produtos Montáveis (Monte seu Colar) está temporariamente desativado.',
      codigo: 'PERSONALIZACAO_DESATIVADA',
    }, 503);
  }
  const estoqueJaRefletido = !!estoqueJaRefletidoPedido;
  if (!entradas.length && !composicoes.length) return json({ erro: 'Nenhum item na venda' }, 400);
  if (!clienteNome || !clienteNome.trim()) return json({ erro: 'Nome da cliente é obrigatório' }, 400);
  /* A flag do §7.4 vale para a venda inteira, e uma venda que mistura peça
     avulsa com composição não pode ter metade do estoque refletido e metade
     não — isso seria impossível de auditar depois. */
  if (estoqueJaRefletido && entradas.length) {
    return json({
      erro: 'Uma venda com "estoque já refletido" registra só a composição já realizada. '
        + 'Lance as peças avulsas em outra venda.',
    }, 409);
  }

  /* ─── §28: a venda pode ser de ontem
   *
   * `data` era `hoje()`, sem alternativa. Quem vendeu no sábado e só foi
   * lançar na segunda não tinha caminho nenhum: a venda entrava com a data
   * errada ou não entrava. O painel de vendas é filtrado por dia, então ela
   * também não reaparecia onde a pessoa foi procurar.
   *
   * Data FUTURA é recusada: venda que ainda não aconteceu é erro de
   * digitação, e aceitá-la contaminaria o faturamento do mês que vem.
   * Passado é livre — é justamente o caso de uso.
   *
   * `movimentos.criado_em` continua sendo AGORA, e isso é o correto: a
   * venda aconteceu no sábado, o sistema soube na segunda. As duas datas
   * são verdadeiras e dizem coisas diferentes. */
  const data = dataPedida ? String(dataPedida).trim() : hoje();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return json({ erro: 'Data da venda inválida. Use o formato AAAA-MM-DD.' }, 400);
  }
  if (data > hoje()) {
    return json({ erro: `${data} ainda não chegou. A venda não pode ser de uma data futura.` }, 400);
  }

  /* ─── §29: pago quando? não é a mesma pergunta que vendido quando?
   *
   * Uma venda "A Receber" marcada como paga depois tem que entrar no
   * faturamento do mês em que o DINHEIRO chegou, não no da venda. Vender em
   * julho e receber em setembro é uma frase que o sistema não sabia dizer:
   * `vendas` só tinha `data`, e toda venda operacional era contada como
   * paga naquele dia.
   *
   * O padrão continua sendo PAGA — é o que a venda de balcão é na imensa
   * maioria das vezes, e mudar o padrão para "não paga" abriria uma conta a
   * receber em toda venda de quem não mexeu em nada.
   *
   * `data_pagamento` de uma venda paga que não diz a data é a data da
   * venda: pagou na hora. Nula só quando NÃO foi paga — e aí o campo
   * significa exatamente "ainda não aconteceu". */
  const pago = pagoPedido === undefined || pagoPedido === null ? 1 : (pagoPedido ? 1 : 0);
  let dataPagamento = null;
  if (pago) {
    dataPagamento = dataPagamentoPedida ? String(dataPagamentoPedida).trim() : data;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
      return json({ erro: 'Data do pagamento inválida. Use o formato AAAA-MM-DD.' }, 400);
    }
    if (dataPagamento > hoje()) {
      return json({ erro: `${dataPagamento} ainda não chegou. O pagamento não pode ser de uma data futura.` }, 400);
    }
    /* Receber ANTES de vender é erro de digitação — e inverteria a ordem
       dos dois números no relatório de qualquer mês. */
    if (dataPagamento < data) {
      return json({
        erro: `O pagamento (${dataPagamento}) é anterior à venda (${data}). Confira as duas datas.`,
      }, 400);
    }
  } else if (dataPagamentoPedida) {
    return json({ erro: 'Uma venda marcada como NÃO PAGA não pode ter data de pagamento.' }, 400);
  }
  const observacao = String(observacaoPedida ?? '').trim() || null;

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
    /* ─── §27: o preço DESTA venda, que pode não ser o do catálogo
     *
     * `s.preco` é o cadastro e continua intocado: desconto é desta venda, não
     * reprecificação. Editar o catálogo a partir daqui mudaria, em silêncio,
     * o preço de toda venda futura da peça.
     *
     * A tela manda o preço FINAL ("vou fazer por 65"), não o abatimento — é
     * como ela fala no balcão. O desconto é derivado, não digitado, então não
     * existe o estado em que os dois números se contradizem. */
    const precoTabela = s.preco;
    let preco = precoTabela;
    let rotulo = null;
    if (entrada.preco !== undefined && entrada.preco !== null && entrada.preco !== '') {
      const bruto = Number(entrada.preco);
      if (!Number.isFinite(bruto) || bruto < 0) {
        return json({ erro: `${s.desc}: preço inválido.`, sku }, 400);
      }
      preco = Math.round(bruto * 100) / 100;
      rotulo = String(entrada.descontoRotulo ?? '').trim() || null;
      /* Preço diferente do catálogo SEM motivo é indistinguível de erro de
       * digitação. Exigir o motivo é o que separa "fiz por 65 para o Grupo
       * VIP" de "digitei 65 sem querer", e é o que transforma o desconto em
       * informação — sem ele, o dinheiro some do faturamento sem explicação
       * e ninguém consegue perguntar quanto foi dado, para quem, por quê. */
      if (preco !== precoTabela && !rotulo) {
        return json({
          erro: `${s.desc}: diga o motivo do preço diferente do de tabela.`, sku,
        }, 409);
      }
    }
    linhas.push({ sku, qtd, preco, precoTabela, rotulo,
      desc: s.desc, componentes: s.componentes || null,
      varianteId: v.varianteId, variacao: v.variacao });
  }

  /* §43 — as composições entram no MESMO carrinho, depois dos itens avulsos.
     Depois, e não antes, porque elas usam o mesmo `reservado`: uma peça
     avulsa e um componente de composição podem ser a mesma peça física, e
     validar cada um contra o disponível do BANCO aprovaria os dois — o banco
     só muda no batch, lá embaixo. */
  let personalizadas = [];
  if (composicoes.length) {
    const prep = await prepararPersonalizacoes(db, composicoes, {
      disponivelReal, reservar, estoqueJaRefletido,
    });
    if (prep.erro) return json(prep.erro, prep.erro.statusHttp ?? 409);
    personalizadas = prep.preparadas;
    for (const p of personalizadas) {
      linhas.push({ ...p.linha, componentes: null, personalizacao: p });
    }
  }

  /* O total sempre foi a soma de `preco * qtd`. Continua sendo — o que mudou
     é de onde `preco` vem. Nenhuma fórmula de analytics precisou mudar. */
  const total = linhas.reduce((s, l) => s + l.preco * l.qtd, 0);

  /* ─── a ficha de quem levou as peças
   *
   * A venda de balcão gravava o NOME e ia embora. O painel dizia, num
   * comentário, que "se o nome for novo, o servidor cria" — e o servidor
   * não criava. Efeito: vender para alguém pela primeira vez não abria
   * ficha nenhuma, então na segunda venda o autocompletar não a encontrava
   * (não havia o que encontrar), e não havia onde guardar o telefone dela.
   * O ciclo que a operação descreve — "vendo, seleciono a cliente, e vai
   * para a ficha dela" — não fechava.
   *
   * Duas regras, e a segunda é a que importa:
   *
   *   um cadastro com esse nome  → a venda se amarra a ele;
   *   nenhum                     → cria, com `origem='manual'`;
   *   mais de um                 → NÃO escolhe. §2: nome não é identidade,
   *                                e duas "Camila" podem ser duas pessoas.
   *                                A venda segue pelo nome normalizado, que
   *                                é como ela já seguia — nada se perde, e
   *                                ninguém é fundido por engano.
   *
   * `origem='manual'`, e não um valor novo: é o que garante que reverter um
   * lote de planilha nunca apague uma cliente que nasceu de uma venda de
   * verdade — a reversão só toca em `origem='historico'`. */
  const nomeLimpo = clienteNome.trim();
  const norm = normalizarNomeCliente(nomeLimpo);
  let idCliente = clienteId || null;
  /* A recusa de escolher precisa ficar ESCRITA (§2 da revisão). Enquanto ela
     era só a ausência de `cliente_id`, renomear uma das homônimas fazia o
     nome voltar a apontar para uma pessoa só — e a venda que ninguém nunca
     atribuiu entrava inteira na ficha da que sobrou. */
  let clienteAmbiguo = 0;
  if (!idCliente && norm) {
    const { results: iguais } = await db.prepare(
      'SELECT id FROM clientes WHERE nome_norm = ?',
    ).bind(norm).all();
    if ((iguais ?? []).length === 1) idCliente = iguais[0].id;
    else if ((iguais ?? []).length > 1) clienteAmbiguo = 1;
    else if (!(iguais ?? []).length) {
      const nova = await db.prepare(
        `INSERT INTO clientes (nome, nome_norm, origem, criada_em)
         VALUES (?, ?, 'manual', datetime('now')) RETURNING id`,
      ).bind(nomeLimpo, norm).first();
      idCliente = nova.id;
    }
  }
  /* `cliente_nome_norm` é gravado AQUI, na venda.
   *
   * Ele nascia só no `backfillNormalizacao` que roda depois de uma
   * importação de planilha. Efeito: a venda de balcão de hoje ficava com a
   * chave de agrupamento nula até a próxima importação — e até lá o painel
   * a contava em "sem-nome", separada do histórico da mesma cliente. Quem
   * vendeu para a Bruna de manhã não via a venda na ficha da Bruna à tarde.
   *
   * A regra é a MESMA do importador (`normalizarNomeCliente`), o que é
   * justamente o que faz as duas populações se encontrarem. */
  const venda = await db.prepare(
    `INSERT INTO vendas (cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                         nuvemshop_status, pago, data_pagamento, observacao, pagamento_origem,
                         cliente_ambiguo, cobravel)
     VALUES (?, ?, ?, 'balcao', ?, ?, 'pendente', ?, ?, ?, ?, ?, ?) RETURNING id`,
    /* §1 da revisão — de onde veio a data de pagamento. Aqui ela é FATO:
       um humano marcou PAGO e escolheu a data na tela. É o que distingue
       esta linha da venda antiga, cuja data de pagamento é a data da venda
       usada como aproximação porque nunca existiu outra. */
  ).bind(idCliente, nomeLimpo, norm, data, total, pago, dataPagamento, observacao,
    pago ? 'informado' : null, clienteAmbiguo,
    /* Venda de balcão não paga É conta a receber: a cliente levou a peça e
       ficou devendo. `cobravel = 0` existe só para o que a LOJA declara que
       ninguém deve (reembolso, anulação, abandono). */
    pago ? 0 : 1).first();

  const stmts = [];
  for (const l of linhas) {
    stmts.push(db.prepare(
      `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, variacao, variante_id,
                                preco_tabela, desconto_valor, desconto_rotulo)
       VALUES (?, ?, ?, ?, ?, 'venda', ?, ?, ?, ?, ?)`
    ).bind(venda.id, l.sku, l.desc, l.qtd, l.preco, l.variacao, l.varianteId,
      /* `preco_tabela` é gravado SEMPRE, com ou sem desconto: sem ele, um
         reajuste de catálogo no mês que vem faria o desconto de hoje parecer
         outro número. `desconto_valor` fica NULL quando não houve alteração —
         zero diria "houve desconto, de zero", que é outra coisa. */
      l.precoTabela,
      l.preco === l.precoTabela ? null : Math.round((l.precoTabela - l.preco) * 100) / 100,
      l.rotulo));
    // Kit: a baixa vai nos componentes, não no kit — ele não tem saldo
    // próprio. O recibo (venda_itens acima) continua mostrando o kit
    // inteiro, porque é assim que ela pensa na venda.
    /* Venda de outro dia diz isso no movimento. `criado_em` guarda quando o
       lançamento aconteceu; quem lê a movimentação da peça precisa saber que
       a saída é de sábado, e não do dia em que a linha foi digitada. */
    const obsMov = `Venda ${venda.id} · ${clienteNome.trim()}`
      + (data === hoje() ? '' : ` · venda de ${data}`);
    if (l.personalizacao) {
      /* §43 — a composição baixa a BASE e cada COMPONENTE, uma vez cada.
         Os movimentos saem de uma lista montada em `prepararPersonalizacoes`,
         e não de `kit_componentes`: a composição é escolhida por venda, e
         somar os dois caminhos baixaria o componente duas vezes.
         `estoqueJaRefletido` (§7.4) pula esta parte inteira: a venda já
         aconteceu, e a peça já saiu na época. */
      if (!estoqueJaRefletido) {
        for (const mv of l.personalizacao.movimentos) {
          stmts.push(...movimentar(db, {
            sku: mv.sku, tipo: 'venda', quantidade: mv.qtd, origem: 'personalizado',
            vendaId: venda.id,
            obs: `${obsMov} · ${l.personalizacao.modeloNome} (${mv.papel})`,
            variacao: mv.variacao || null, varianteId: mv.varianteId || null,
          }));
        }
      }
    } else if (l.componentes) {
      stmts.push(...await movimentarKit(db, {
        kitSku: l.sku, tipo: 'venda', quantidade: l.qtd, origem: 'venda',
        vendaId: venda.id, obs: obsMov,
      }));
    } else {
      stmts.push(...movimentar(db, {
        sku: l.sku, tipo: 'venda', quantidade: l.qtd, origem: 'venda',
        vendaId: venda.id, obs: obsMov,
        variacao: l.variacao, varianteId: l.varianteId,
      }));
    }
  }
  await db.batch(stmts);

  /* §43 — a configuração é gravada DEPOIS dos movimentos, e nunca antes: se
     a baixa falhar, não fica composição registrada de uma venda que não
     baixou peça nenhuma. */
  let composicoesGravadas = [];
  if (personalizadas.length) {
    composicoesGravadas = await gravarPersonalizacoes(db, venda.id, personalizadas,
      { estoqueJaRefletido });
  }

  /* Venda cujo estoque já estava refletido não empurra nada para a loja: a
     peça saiu meses atrás, e reescrever o estoque online agora inventaria
     uma movimentação que não houve. */
  const nuvemshop = estoqueJaRefletido
    ? { status: 'nao_aplicavel', motivo: 'estoque já refletido; nada foi movimentado aqui' }
    : await atualizarEstoqueDaVenda(db, env, venda.id);
  return json({
    ok: true, id: venda.id, data, total, itens: linhas, nuvemshop,
    /* §43 — o que foi montado, para a tela mostrar a composição sem
       precisar pedir de novo. */
    ...(composicoesGravadas.length ? {
      personalizacoes: composicoesGravadas.map((p) => ({
        id: p.id, modeloNome: p.modeloNome, baseSku: p.baseSku, preco: p.preco,
        componentes: p.slots.map((s2) => ({
          posicao: s2.posicao, sku: s2.componenteSku, rotulo: s2.rotulo,
        })),
      })),
      estoqueJaRefletido,
    } : {}),
    /* §2 anunciado, nunca engolido: o sistema não decidiu de quem é a venda,
       e diz isso em vez de deixar a tela supor que decidiu. */
    clienteId: idCliente,
    clienteAmbiguo: !!clienteAmbiguo,
    ...(clienteAmbiguo ? {
      aviso: `Existe mais de um cadastro com o nome "${nomeLimpo}". A venda foi `
        + 'registrada sem vínculo — abra a ficha certa e amarre, se for o caso.',
    } : {}),
    /* §29 na resposta: a tela não precisa deduzir para onde o dinheiro foi. */
    pago: !!pago,
    dataPagamento,
    observacao,
    faturamentoEm: pago ? dataPagamento : null,
    aReceber: pago ? 0 : total,
  }, 201);
}

/** §29 — o dinheiro de uma venda "A Receber" entrou.
 *
 *  O defeito: marcar a venda como paga não movia o valor para o mês do
 *  pagamento. Não movia porque não havia onde escrever a data — e sem ela,
 *  faturamento e data da venda eram forçosamente a mesma coisa.
 *
 *  O que esta rota faz, e só isto:
 *    · grava `pago = 1` e a data em que o dinheiro chegou;
 *    · deixa `data` — a da venda — exatamente como estava.
 *
 *  O que ela deliberadamente NÃO faz:
 *    · não toca em estoque. A peça saiu quando a venda foi registrada;
 *      baixar de novo aqui seria a segunda baixa da mesma peça (§15 do
 *      pacote: "MARCAR VENDA COMO PAGA não baixa estoque novamente");
 *    · não mexe na Nuvemshop, nos itens nem no total.
 */
async function registrarPagamentoVenda(db, id, corpo = {}) {
  const v = await db.prepare('SELECT * FROM vendas WHERE id = ?').bind(id).first();
  if (!v) return json({ erro: 'Venda não encontrada' }, 404);
  if (v.cancelada) return json({ erro: 'Venda cancelada não recebe pagamento.' }, 409);

  /* `pago: false` desfaz — é o caminho de volta de quem marcou por engano.
     Ele limpa a data junto, senão sobraria uma data de pagamento numa venda
     que não foi paga, e o faturamento continuaria a enxergá-la. */
  const querPagar = corpo.pago === undefined ? true : !!corpo.pago;

  if (!querPagar) {
    if (!v.pago) return json({ erro: 'Esta venda já está como NÃO PAGA.' }, 409);
    const r = await db.prepare(
      /* Desfazer devolve a venda para "o cliente ainda deve": é o caminho de
         volta de quem marcou pago por engano, e o padrão de toda venda não
         paga lançada por uma pessoa. */
      `UPDATE vendas SET pago = 0, data_pagamento = NULL, pagamento_origem = NULL,
              valor_recebido = NULL, cobravel = 1
        WHERE id = ? RETURNING *`,
    ).bind(id).first();
    return json({
      ok: true, id: r.id, pago: false, data: r.data, dataPagamento: null,
      aReceber: Number(r.total), estoqueAlterado: false,
    });
  }

  if (v.pago) {
    return json({
      erro: `Esta venda já está paga${v.data_pagamento ? ` em ${v.data_pagamento}` : ''}.`,
      dataPagamento: v.data_pagamento ?? null,
    }, 409);
  }

  const dataPagamento = corpo.dataPagamento ? String(corpo.dataPagamento).trim() : hoje();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    return json({ erro: 'Data do pagamento inválida. Use o formato AAAA-MM-DD.' }, 400);
  }
  if (dataPagamento > hoje()) {
    return json({ erro: `${dataPagamento} ainda não chegou.` }, 400);
  }
  if (dataPagamento < v.data) {
    return json({
      erro: `O pagamento (${dataPagamento}) é anterior à venda (${v.data}). Confira as duas datas.`,
    }, 400);
  }

  const r = await db.prepare(
    /* §36.4: pago por inteiro zera o que se tem a receber, e limpa qualquer
       parcial que existisse — o saldo virou zero, não sobra metade. */
    `UPDATE vendas SET pago = 1, data_pagamento = ?, pagamento_origem = 'informado',
            valor_recebido = NULL, cobravel = 0,
            observacao = COALESCE(?, observacao)
      WHERE id = ? RETURNING *`,
  ).bind(dataPagamento, String(corpo.observacao ?? '').trim() || null, id).first();

  return json({
    ok: true,
    id: r.id,
    pago: true,
    /* As duas datas, lado a lado, porque são duas coisas diferentes e é
       exatamente essa distinção que a rota existe para tornar possível. */
    data: r.data,
    dataPagamento: r.data_pagamento,
    faturamentoEm: r.data_pagamento,
    /* A data foi DITA por alguém, não deduzida. É a distinção que §1 da
       revisão exige que nunca se perca. */
    pagamentoOrigem: r.pagamento_origem,
    valor: Number(r.total),
    aReceber: 0,
    estoqueAlterado: false,
  });
}




/** §19 e §28: cancelar cria movimentação inversa, não apaga a venda. */
async function cancelarVenda(db, env, vendaId) {
  const v = await db.prepare(`SELECT * FROM vendas WHERE id = ?`).bind(vendaId).first();
  if (!v) return json({ erro: 'Venda não encontrada' }, 404);
  if (v.cancelada) return json({ erro: 'Venda já está cancelada' }, 409);

  const itens = (await db.prepare(`SELECT * FROM venda_itens WHERE venda_id = ?`).bind(vendaId).all()).results;
  const personalizacoes = (await personalizacoesDeVendas(db, [vendaId])).get(vendaId) || [];
  const stmts = [];
  /* A linha comercial da composição não é uma peça física. Para cada colar,
     estornamos a base e todos os componentes congelados, e pulamos exatamente
     uma linha correspondente do recibo. Venda retroativa com estoque já
     refletido não devolve nada — a mesma regra que impediu a baixa original. */
  const linhasComerciais = new Map();
  for (const p of personalizacoes) {
    const skuLinha = String(p.skuComercial || p.baseSku);
    linhasComerciais.set(skuLinha, (linhasComerciais.get(skuLinha) || 0) + 1);
    if (p.estoqueJaRefletido) continue;
    stmts.push(...movimentar(db, {
      sku: p.baseSku, tipo: 'cancelamento', quantidade: 1, origem: 'cancelamento',
      vendaId, obs: `Estorno da venda ${vendaId} · ${p.modeloNome} (base)`,
    }));
    for (const c of p.componentes || []) {
      stmts.push(...movimentar(db, {
        sku: c.sku, tipo: 'cancelamento', quantidade: Number(c.qtd || 1),
        origem: 'cancelamento', vendaId,
        obs: `Estorno da venda ${vendaId} · ${p.modeloNome} (componente)`,
        variacao: c.variacao || null, varianteId: c.varianteId || null,
      }));
    }
  }
  for (const i of itens) {
    const restantes = linhasComerciais.get(String(i.sku)) || 0;
    if (restantes > 0) {
      linhasComerciais.set(String(i.sku), restantes - 1);
      continue;
    }
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
  return json({ ok: true, nuvemshop, personalizacoesEstornadas: personalizacoes.length });
}

async function listarVendas(db, data) {
  const vendas = (await db.prepare(`SELECT * FROM vendas WHERE data = ? ORDER BY id`).bind(data).all()).results;
  const itens = (await db.prepare(
    `SELECT vi.* FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id WHERE v.data = ?`).bind(data).all()).results;
  /* §43 — a configuração das composições do dia, numa consulta só para
     todas as vendas: pedir uma por venda seria o N+1 que a auditoria do D1
     mandou evitar. */
  const composicoes = await personalizacoesDeVendas(db, vendas.map((v) => v.id));
  const porVenda = new Map();
  for (const it of itens) {
    if (!porVenda.has(it.venda_id)) porVenda.set(it.venda_id, []);
    porVenda.get(it.venda_id).push({
      sku: it.sku, desc: it.desc, qtd: it.qtd, preco: it.preco, motivo: it.motivo,
      variacao: it.variacao, varianteId: it.variante_id,
      /* §27: o desconto viaja com a venda. Sem isto, quem abre a venda de
         ontem vê R$ 65,00 e não tem como saber que a peça é de R$ 89,00 nem
         por que saiu mais barata. */
      precoTabela: it.preco_tabela ?? null,
      descontoValor: it.desconto_valor ?? null,
      descontoRotulo: it.desconto_rotulo ?? null,
    });
  }
  return vendas.map(v => ({
    id: v.id, origem: v.origem, clienteNome: v.cliente_nome, revendedoraId: v.revendedora_id,
    maletaId: v.maleta_id, data: v.data, total: v.total, cancelada: !!v.cancelada,
    criadaEm: v.criada_em, externoId: v.externo_id,
    nuvemshopStatus: v.nuvemshop_status, nuvemshopErro: v.nuvemshop_erro,
    /* §29: a lista do dia precisa dizer o que foi recebido e o que não foi.
       Sem isto, a venda "A Receber" fica indistinguível da paga, e o botão
       de marcar o pagamento não tem onde aparecer. */
    pago: !!v.pago,
    dataPagamento: v.data_pagamento ?? null,
    aReceber: v.pago ? 0 : Number(v.total),
    observacao: v.observacao ?? null,
    itens: porVenda.get(v.id) || [],
    /* §43 — o colar montado aparece como UMA venda personalizada, com a
       configuração por baixo, e não como base e pingentes soltos que
       ninguém reconhece como o colar que a cliente levou. */
    ...(composicoes.has(v.id) ? { personalizacoes: composicoes.get(v.id) } : {}),
  }));
}
