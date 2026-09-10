/** Política de erros e logs — Fase 3.
 *
 *  Uma exceção que sobe até aqui já perdeu o contexto de quem a lançou.
 *  O que sobra é a mensagem, e a mensagem crua do SQLite não diz a ninguém
 *  o que fazer: "no such column: p.foto_original" manda a pessoa procurar
 *  bug onde só falta rodar uma migração.
 *
 *  Este módulo é a tabela dessas traduções. Estava embutida no `catch` do
 *  entrypoint, onde era invisível e não tinha teste próprio; aqui ela é uma
 *  lista ordenada, e a ordem faz parte da regra — ver `fotos`.
 *
 *  O módulo não conhece rota, banco nem regra de negócio. Recebe uma
 *  mensagem de erro, devolve uma resposta. */

import { json } from '../auth.js';

const semColuna = (msg) => /no such column/i.test(msg);

/** Ordem = precedência. O primeiro que reconhece responde, como na corrente
 *  de `if` que existia antes. Nenhum tradutor pode depender de outro ter
 *  rodado. */
export const tradutores = [
  {
    /* A ficha de cliente com CPF. "no such column: cpf" não diz a ninguém
       o que fazer. */
    id: 'cliente-cpf',
    reconhece: (msg) => semColuna(msg) && /\bcpf(_norm)?\b/i.test(msg),
    resposta: () => json({
      erro: 'A ficha de cliente com CPF precisa de uma migração que este banco ainda não recebeu.',
      detalhe: 'Rode api/migracao-cliente-cpf.sql no D1 — o passo está no api/DEPLOY.md. '
             + 'O resto do painel funciona normalmente sem ela.',
      migracao: 'cliente-cpf',
    }, 503),
  },
  {
    /* Desconto por peça (§27). Sem a migração, VENDER quebra — é o caminho
       mais crítico do painel — então a mensagem tem de dizer o que rodar, e
       não devolver um erro de SQL para quem está no balcão. */
    id: 'venda-desconto',
    reconhece: (msg) => semColuna(msg)
      && /\b(preco_tabela|desconto_valor|desconto_rotulo)\b/i.test(msg),
    resposta: () => json({
      erro: 'O desconto por peça precisa de uma migração que este banco ainda não recebeu.',
      detalhe: 'Rode api/migracao-venda-desconto.sql no D1 — o passo está no api/DEPLOY.md. '
             + 'Até lá, venda sem alterar preço continua funcionando.',
      migracao: 'venda-desconto',
    }, 503),
  },
  {
    /* TRÊS migrações mexem em foto, e mandar rodar a errada faz a pessoa
       perder a tarde. O que falta é quem decide, e a ordem do teste importa:
       `loja_fotos` contém "foto_" e casaria com a regra de `foto_url` se
       viesse depois.

         loja_fotos  → a galeria do catálogo da loja
         foto_url    → o endereço da imagem na peça (vincular)
         o resto     → as colunas de foto do catálogo */
    id: 'fotos',
    reconhece: (msg) => /no such (table|column)/i.test(msg)
      && /foto|produtos_pendentes|fotos_orfas/i.test(msg),
    resposta: (msg) => {
      const galeria = /loja_fotos/i.test(msg);
      const porUrl = !galeria && /foto_url/i.test(msg);
      const qual = galeria ? 'fotos-loja' : (porUrl ? 'foto-url' : 'catalogo');
      return json({
        erro: galeria
          ? 'As fotos do catálogo da loja precisam de uma migração que este banco ainda não recebeu.'
          : porUrl
            ? 'Vincular fotos da loja precisa de uma migração que este banco ainda não recebeu.'
            : 'Esta parte precisa da migração do catálogo, que este banco ainda não recebeu.',
        detalhe: `Rode api/migracao-${qual}.sql no D1 — `
               + 'o passo está no api/DEPLOY.md. O resto do painel funciona normalmente sem ela.',
        migracao: qual,
      }, 503);
    },
  },
  {
    /* Limite de leitura do D1. Não é falha de código nem de dado, e chamá-lo
       de "Falha interna" mandou procurar no lugar errado — numa revendedora
       recém-cadastrada, num payload quebrado, no banco de produção. A cota é
       DIÁRIA e da CONTA Cloudflare, não do banco: por isso DEV e produção
       param no mesmo instante, embora tenham D1 separados. E só as rotas que
       LEEM o banco caem: `/api/health` não toca no D1 e continua respondendo
       200, o que faz o Worker parecer saudável enquanto o painel inteiro
       está fora do ar. */
    id: 'd1-leitura-diaria',
    reconhece: (msg) => /exceeded/i.test(msg)
      && /(daily|limit)/i.test(msg)
      && /(D1|row read|rows read)/i.test(msg),
    resposta: (msg) => json({
      erro: 'O limite diário de leitura do banco (D1) foi atingido nesta conta Cloudflare.',
      detalhe: 'Não é erro de cadastro nem de venda: a cota é da CONTA, e por isso o DEV para junto. '
             + 'Ela se renova à meia-noite UTC (21h de Brasília). Para deixar de depender disso, o '
             + 'plano Workers Paid eleva o limite. Mensagem do banco: ' + msg,
      limite: 'd1-leitura-diaria',
    }, 503),
  },
];

/** A mensagem de uma exceção, sem deixar `undefined` virar texto. */
export function mensagemDe(e) {
  return String((e && e.message) || e);
}

/** `wrangler tail` imprime o OUTCOME da invocação, e uma exceção tratada sai
 *  como "Ok" — foi por isso que uma queda total do painel apareceu no tail
 *  como duas requisições saudáveis. Este log é a única coisa que faz a causa
 *  chegar até quem está olhando.
 *
 *  Rota e método não são segredo. A chave viaja no cabeçalho e não é
 *  impressa; nada além de método, caminho e mensagem entra aqui. */
export function registrarFalha(e, { metodo, path, console: saida = console } = {}) {
  saida.error('[api] ' + metodo + ' ' + path + ' → ' + mensagemDe(e), (e && e.stack) || '');
}

/** Traduz sem registrar — é o que o teste exercita. */
export function traduzirErro(e) {
  const msg = mensagemDe(e);
  for (const t of tradutores) {
    if (t.reconhece(msg)) return t.resposta(msg);
  }
  /* Sem tradução conhecida, o erro vai cru no `detalhe`. Esconder isso já
     custou tardes: a tela de conexão precisa mostrar a CAUSA. */
  return json({ erro: 'Falha interna', detalhe: msg }, 500);
}

/** O que o entrypoint chama: registra e responde, nessa ordem. */
export function respostaDeErro(e, contexto) {
  registrarFalha(e, contexto);
  return traduzirErro(e);
}
