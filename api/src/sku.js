/** SKU: único de verdade, e gerado sem colisão.
 *
 *  `produtos.sku` sempre foi PRIMARY KEY, então o mesmo código duas vezes,
 *  idêntico, nunca passou. O que passava era o quase-igual: `br1234` ao
 *  lado de `BR1234`, ou ` BR1234 ` com espaço. O importador de planilha só
 *  fazia `.trim()`, enquanto `catalogo.js › normSku` e
 *  `nuvemshop.js › mapearSkus` comparam em maiúsculas e sem espaço. Duas
 *  linhas, dois estoques, e só uma delas casando com a loja — a outra vira
 *  peça fantasma que ninguém encontra.
 *
 *  Agora a unicidade é checada em três camadas, de propósito:
 *
 *    1. no frontend, para a pessoa saber antes de terminar de digitar;
 *    2. aqui no backend, porque frontend não é trava — é conveniência;
 *    3. no banco, pelo índice `idx_produtos_sku_norm`, que é o que
 *       realmente impede, inclusive contra dois requests simultâneos.
 *
 *  E a checagem olha mais lugares que `produtos`: um código pode já estar
 *  em uso numa variante da Nuvemshop, na fila de peças novas ou numa
 *  reserva de "gerar SKU" feita há dois minutos. Dizer "disponível" e
 *  falhar no INSERT seria pior que não ter checado.
 */

export const normSku = (v) => String(v == null ? '' : v)
  .trim().replace(/[\s\u00a0]+/g, '').toUpperCase();

/** A MESMA normalização, escrita em SQL. Tem de bater caractere por
 *  caractere com a expressão do índice `idx_produtos_sku_norm`: o SQLite só
 *  usa um índice de expressão quando a consulta repete a expressão igual.
 *  Escrever "quase igual" não daria erro — daria varredura da tabela
 *  inteira e um índice que nunca serve para nada.
 *
 *  O espaço sem quebra (CHAR(160)) está na lista porque é o que sai de um
 *  copiar-e-colar de planilha, e ele é invisível: o código parece igual na
 *  tela e não casa com nada. */
const SQL_NORM = (col) =>
  `UPPER(REPLACE(REPLACE(REPLACE(${col}, ' ', ''), CHAR(9), ''), CHAR(160), ''))`;

/** O mesmo formato que `catalogo.js` já cobrava da planilha. Repetido aqui
 *  como constante própria porque agora ele vale também para o que a pessoa
 *  digita na tela, e as duas coisas podem divergir um dia sem que uma
 *  quebre a outra. */
export const SKU_LIMPO = /^[A-Z0-9][A-Z0-9._\-/]*$/;

const TAMANHO_MAX = 40;

/** O FORMATO dos códigos da Marquesa — medido, não suposto.
 *
 *  A auditoria rodou contra o catálogo real (`GET /api/produtos/sku/auditoria`)
 *  e devolveu números que não deixam margem: 776 códigos, 776 deles com
 *  exatamente seis dígitos, 100% na forma `9×6`, nenhum prefixo, nenhum
 *  sufixo, zero colisões, zero fora do padrão, de 100633 a 997620.
 *
 *  Dois fatos saem daí, e eles puxam para lados diferentes:
 *
 *   - o formato é INEQUÍVOCO. Seis dígitos, sempre. Gerar `MQ00001` era
 *     inventar um segundo formato num catálogo que só tem um — e um código
 *     com letra é um código que a operação lê como "estranho";
 *   - a sequência NÃO EXISTE. Densidade 0,001: 776 códigos espalhados por
 *     897 mil lugares. Isso é catálogo de fornecedor, não contagem nossa.
 *     `max + 1` ali escolheria um número que o fornecedor ainda pode usar
 *     amanhã, e a colisão só apareceria meses depois, numa etiqueta.
 *
 *  Logo o gerado é SORTEADO dentro da faixa, e a unicidade é provada no
 *  banco antes de a tela ver o número. É o único jeito de respeitar o
 *  formato real sem fingir uma sequência que não existe.
 *
 *  Códigos ANTIGOS não são tocados por nada disto. A regra vale para o que
 *  nasce daqui para a frente. */
const SKU_MIN = 100000;
const SKU_MAX = 999999;

/** Seis dígitos, e o primeiro não é zero — `012345` tem seis caracteres e
 *  está fora da faixa, que é a mesma coisa dita de dois jeitos. */
export const SKU_SEIS = /^[1-9][0-9]{5}$/;

/** O veredito de formato para um código DIGITADO À MÃO. Separado de
 *  `checarSku` de propósito: aquilo responde "este código já é de alguém?",
 *  isto responde "este código tem a cara dos nossos?". Misturar as duas
 *  perguntas quebraria a importação de planilha, que convive com o que a
 *  loja tiver escrito e não pode recusar um catálogo inteiro por formato. */
export function formatoManual(bruto) {
  const sku = normSku(bruto);
  if (!sku) return { ok: false, motivo: 'vazio', recado: 'Escreva o código da peça.' };
  if (!SKU_SEIS.test(sku)) {
    return {
      ok: false, motivo: 'nao_sao_seis_numeros',
      recado: 'O código deve ter 6 números.',
      min: SKU_MIN, max: SKU_MAX,
    };
  }
  return { ok: true, motivo: null, recado: null };
}

/** Quanto tempo um código gerado fica preso sem ninguém usar. Duas horas é
 *  folgado para preencher um formulário e curto o bastante para não vazar
 *  a faixa se alguém abrir a tela e fechar. */
const RESERVA_HORAS = 2;

/* ==================================================================== */
/* 1. CHECAR                                                            */
/* ==================================================================== */

/** Onde este código já está sendo usado — e a resposta diz ONDE, não só
 *  "não pode". Bloquear sem explicar obriga a pessoa a caçar o duplicado à
 *  mão no meio de 773 peças. */
export async function checarSku(db, bruto) {
  const sku = normSku(bruto);

  /* O formato do cadastro manual viaja JUNTO, como um campo à parte, e não
     como recusa. São duas perguntas diferentes e quem pergunta é diferente:
     a tela de cadastro manual precisa das duas, a importação de planilha
     precisa só da unicidade — ela convive com o que a loja escreveu, e
     recusar por formato ali derrubaria o catálogo inteiro. */
  const formato = formatoManual(sku);

  if (!sku) return { sku: '', digitado: String(bruto ?? ''), valido: false, disponivel: false, motivo: 'vazio', formato };
  if (sku.length > TAMANHO_MAX) {
    return { sku, digitado: String(bruto ?? ''), valido: false, disponivel: false, motivo: 'longo_demais', limite: TAMANHO_MAX, formato };
  }
  if (!SKU_LIMPO.test(sku)) {
    return { sku, digitado: String(bruto ?? ''), valido: false, disponivel: false, motivo: 'formato_invalido', formato };
  }

  const usos = [];

  const p = await db.prepare(
    `SELECT sku, desc, status, qtd FROM produtos
      WHERE ${SQL_NORM('sku')} = ? LIMIT 1`).bind(sku).first();
  if (p) usos.push({ onde: 'produtos', sku: p.sku, desc: p.desc, status: p.status, qtd: p.qtd });

  const pend = await db.prepare(
    `SELECT sku, desc, origem FROM produtos_pendentes
      WHERE ${SQL_NORM('sku')} = ? LIMIT 1`).bind(sku).first();
  if (pend) usos.push({ onde: 'produtos_pendentes', sku: pend.sku, desc: pend.desc, origem: pend.origem });

  /* A loja também conta. Um código que já existe numa variante da
     Nuvemshop e ainda não foi cadastrado aqui não está "livre": cadastrar
     outra peça com ele faria a sincronização casar as duas coisas erradas,
     que é exatamente o tipo de estrago que não aparece na hora. */
  const naLoja = (await db.prepare(
    `SELECT variante_id, produto_id, nome, produto_nome FROM loja_variantes
      WHERE sku_norm = ? ORDER BY posicao LIMIT 5`).bind(sku).all()).results;
  for (const v of naLoja) {
    usos.push({
      onde: 'loja_variantes', varianteId: String(v.variante_id),
      produtoId: String(v.produto_id), variacao: v.nome, produto: v.produto_nome,
    });
  }

  const res = await db.prepare(
    `SELECT sku, expira_em, origem FROM sku_reservas
      WHERE sku = ? AND expira_em > datetime('now') LIMIT 1`).bind(sku).first();
  if (res) usos.push({ onde: 'reserva', expiraEm: res.expira_em, origem: res.origem });

  /* Nem todo uso impede o cadastro, e confundir as duas coisas quebraria os
     fluxos que existem hoje:

     - `produtos` IMPEDE. É o duplicado de verdade.
     - `loja_variantes` NÃO impede — é o contrário: o caminho normal de
       "adicionar peças novas" é justamente cadastrar aqui o código que a
       loja já tem, para os dois lados se casarem. Bloquear isso travaria a
       importação inteira do catálogo. Vira AVISO: "esse código já existe na
       loja como tal produto", que é informação útil, não recusa.
     - `produtos_pendentes` NÃO impede — a fila existe para virar produto.
     - `reserva` NÃO impede — quem reservou foi quem está cadastrando.

     Quem gera código novo é mais exigente que isso e olha `usos` inteiro:
     lá qualquer uso descarta o candidato. */
  const bloqueiam = usos.filter(u => u.onde === 'produtos');

  return {
    sku, digitado: String(bruto ?? ''),
    valido: true,
    formato,
    disponivel: bloqueiam.length === 0,
    motivo: bloqueiam.length ? 'em_uso' : null,
    usos,
    bloqueiam,
    avisos: usos.filter(u => u.onde !== 'produtos'),
  };
}

/* ==================================================================== */
/* 2. GERAR                                                             */
/* ==================================================================== */

/** Um número da faixa, sorteado com a fonte aleatória do runtime.
 *
 *  `crypto.getRandomValues` existe no Worker e é o que se usa. `Math.random`
 *  fica como rede de segurança para um ambiente estranho — deixar o
 *  cadastro parado porque o runtime não tem `crypto` seria pior que gerar
 *  um número menos aleatório num sorteio de 900 mil.
 *
 *  A rejeição no lugar de `% faixa` não é preciosismo gratuito: o resto
 *  puro faz os primeiros `2^32 % 900000` números saírem um tico mais que os
 *  outros. Não viraria colisão visível aqui — mas um viés que ninguém
 *  documenta é um viés que ninguém revisa depois. A chance de rejeitar é
 *  0,02% por tentativa, então o laço acaba na primeira volta quase sempre. */
function sortear() {
  const faixa = SKU_MAX - SKU_MIN + 1;              // 900.000 códigos possíveis
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const teto = Math.floor(0x100000000 / faixa) * faixa;
    const buf = new Uint32Array(1);
    for (let i = 0; i < 20; i++) {
      c.getRandomValues(buf);
      if (buf[0] < teto) return SKU_MIN + (buf[0] % faixa);
    }
  }
  return SKU_MIN + Math.floor(Math.random() * faixa);
}

/** Quantas vezes tentar antes de desistir e DIZER que desistiu.
 *
 *  Com ~800 códigos ocupados em 900 mil, a chance de um sorteio bater em
 *  algo já usado é de 0,09%. Vinte sorteios seguidos falharem tem chance
 *  perto de zero — se acontecer, o certo é a resposta dizer isso em vez de
 *  girar para sempre ou devolver um código que não foi conferido. */
const TENTATIVAS = 20;

/** Devolve um código GARANTIDAMENTE disponível — e o prova reservando-o no
 *  banco antes de responder.
 *
 *  Sem a reserva isto seria impossível de acertar: duas pessoas clicando ao
 *  mesmo tempo poderiam sortear o mesmo número, cada uma acreditando que
 *  era só dela. Uma cadastraria, a outra levaria um erro no fim do
 *  formulário.
 *
 *  Quem decide o empate é a chave primária de `sku_reservas`: o
 *  `INSERT OR IGNORE` que não mudou nada perdeu a corrida, e o perdedor
 *  sorteia outro em vez de devolver conflito para a tela. */
export async function gerarSku(db, { origem = 'cadastro' } = {}) {
  // Reserva vencida não segura número de ninguém.
  await db.prepare(`DELETE FROM sku_reservas WHERE expira_em <= datetime('now')`).run();

  for (let i = 1; i <= TENTATIVAS; i++) {
    const sku = String(sortear());
    const r = await db.prepare(
      `INSERT OR IGNORE INTO sku_reservas (sku, expira_em, origem)
       VALUES (?, datetime('now', '+${RESERVA_HORAS} hours'), ?)`
    ).bind(sku, origem).run();
    const gravou = r.meta && r.meta.changes;
    if (!gravou) continue;                       // outra chamada levou este

    /* A reserva entrou, mas ela só protege contra outra GERAÇÃO. Falta
       conferir que o código não existe já como produto, pendência ou
       variante da loja — o sorteio pode cair em cima de um código do
       fornecedor que ainda nem foi cadastrado aqui. */
    const check = await checarSku(db, sku);
    /* Aqui o critério é o mais duro possível — `usos` inteiro, não só o que
       impede cadastro. Um código gerado tem de estar livre em TODOS os
       lugares, inclusive na loja: devolver um que já existe lá seria criar
       de fábrica a colisão que este arquivo existe para evitar. */
    const soAReserva = check.usos.length === 1 && check.usos[0].onde === 'reserva';
    if (check.valido && soAReserva) {
      return { ok: true, sku, expiraEm: horasAdiante(RESERVA_HORAS), origem, tentativas: i };
    }
    await db.prepare(`DELETE FROM sku_reservas WHERE sku = ?`).bind(sku).run();
  }

  return {
    ok: false,
    erro: `Não foi possível sortear um código livre em ${TENTATIVAS} tentativas. `
      + 'Isso não deveria acontecer com o catálogo deste tamanho — vale conferir '
      + 'se a tabela de reservas não ficou entupida.',
  };
}

function horasAdiante(h) {
  return new Date(Date.now() + h * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
}

/** Chamada quando o produto é criado de verdade: o código saiu da fila de
 *  espera e virou peça. Devolve o statement em vez de executar, para caber
 *  no mesmo `db.batch()` do INSERT — assim reserva e produto nunca ficam
 *  em estados diferentes. */
export function liberarReserva(db, sku) {
  return db.prepare(`DELETE FROM sku_reservas WHERE sku = ?`).bind(normSku(sku));
}

/* ==================================================================== */
/* 3. AUDITAR O PADRÃO REAL                                             */
/* ==================================================================== */

/** Qual é, de fato, o padrão dos códigos da Marquesa — medido no catálogo
 *  inteiro, não suposto a partir de uma amostra que alguém olhou.
 *
 *  Existe porque a pergunta "qual código o sistema deve gerar?" não tem
 *  resposta de escritório. Ela depende de fatos que só o catálogo real
 *  responde: quantos formatos convivem, se existe sequência de verdade (e
 *  não só números crescentes), se há prefixo, e o tamanho de cada coisa.
 *  Chutar aqui não dá erro na hora — dá colisão meses depois, numa
 *  etiqueta impressa.
 *
 *  Olha os TRÊS lugares onde um código existe, porque um catálogo lido só
 *  de `produtos` mente: a loja carrega códigos na variante que ainda não
 *  foram cadastrados aqui, e a fila de peças novas carrega os que estão a
 *  caminho.
 *
 *  Somente leitura. Não decide, não muda o gerador, não renumera nada —
 *  devolve o retrato e deixa a decisão para quem manda no negócio.
 */

/** A "forma" de um código: dígito vira 9, letra vira A, separador fica.
 *  `122809` → `999999`;  `AB00001` → `AA99999`;  `BR-12/3` → `AA-99/9`.
 *  É o que permite contar quantos formatos DIFERENTES convivem sem listar
 *  os 773 códigos um a um. */
export function formaDoSku(sku) {
  return String(sku || '').replace(/[0-9]/g, '9').replace(/[A-Za-z]/g, 'A');
}

/** A mesma forma, dita curto: `999999` → `9×6`, `AA99999` → `A×2 9×5`. */
function formaCurta(forma) {
  const partes = [];
  let atual = '', n = 0;
  for (const c of forma) {
    if (c === atual) { n++; continue; }
    if (atual) partes.push(n > 1 ? `${atual}×${n}` : atual);
    atual = c; n = 1;
  }
  if (atual) partes.push(n > 1 ? `${atual}×${n}` : atual);
  return partes.join(' ');
}

const contar = (lista) => {
  const m = new Map();
  for (const v of lista) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([valor, n]) => ({ valor, n }));
};

export async function auditarSkus(db, { amostra = 25 } = {}) {
  const lerColuna = async (sql) =>
    (await db.prepare(sql).all()).results.map(r => Object.values(r)[0]).filter(v => v != null && String(v).trim() !== '');

  const fontes = {
    produtos: await lerColuna(`SELECT sku FROM produtos`),
    produtos_pendentes: await lerColuna(`SELECT sku FROM produtos_pendentes`),
    loja_variantes: await lerColuna(`SELECT DISTINCT sku FROM loja_variantes WHERE sku IS NOT NULL`),
  };

  /* Um código pode estar nos três lugares. O universo é o conjunto das
     formas NORMALIZADAS distintas — contar três vezes o mesmo código
     inflaria o total e distorceria a proporção de cada formato. */
  const brutoPorNorm = new Map();          // norm → Set(forma crua)
  const ondePorNorm = new Map();           // norm → Set(fonte)
  for (const [fonte, lista] of Object.entries(fontes)) {
    for (const bruto of lista) {
      const n = normSku(bruto);
      if (!n) continue;
      if (!brutoPorNorm.has(n)) { brutoPorNorm.set(n, new Set()); ondePorNorm.set(n, new Set()); }
      brutoPorNorm.get(n).add(String(bruto));
      ondePorNorm.get(n).add(fonte);
    }
  }
  const codigos = [...brutoPorNorm.keys()].sort();

  /* Colisão normalizada: o MESMO código escrito de dois jeitos. É o que o
     índice `idx_produtos_sku_norm` passou a impedir dentro de `produtos`,
     mas que continua possível ENTRE fontes — e é exatamente o caso em que
     uma peça daqui deixa de casar com a variante da loja. */
  const colisoes = codigos
    .filter(n => brutoPorNorm.get(n).size > 1)
    .map(n => ({ sku: n, escritoComo: [...brutoPorNorm.get(n)], onde: [...ondePorNorm.get(n)] }));

  const formas = contar(codigos.map(formaDoSku))
    .map(f => ({
      forma: f.valor, curta: formaCurta(f.valor), n: f.n,
      pct: codigos.length ? Math.round((f.n / codigos.length) * 1000) / 10 : 0,
      exemplos: codigos.filter(c => formaDoSku(c) === f.valor).slice(0, 3),
    }));
  const predominante = formas[0] || null;

  const tamanhos = contar(codigos.map(c => c.length))
    .map(t => ({ caracteres: t.valor, n: t.n }))
    .sort((a, b) => a.caracteres - b.caracteres);

  /* Prefixo = a corrida de letras no começo. Sem letra nenhuma o prefixo é
     vazio, e "vazio" é uma resposta — a mais comum num catálogo de códigos
     de fornecedor. */
  const prefixos = contar(codigos.map(c => (c.match(/^[A-Z]+/) || [''])[0]))
    .map(p => ({ prefixo: p.valor || '(nenhum)', n: p.n }));
  const sufixos = contar(codigos.map(c => (c.match(/-\d+$/) || [''])[0]))
    .map(p => ({ sufixo: p.valor || '(nenhum)', n: p.n }));

  /* SEQUÊNCIA — a pergunta que decide tudo, e a que é fácil errar.
     
     Números crescentes NÃO são sequência. Sequência é ocupar a faixa: se
     existem 773 códigos entre 100000 e 997620, a faixa tem 897.621 lugares
     e 772 mil e poucos estão VAZIOS. `max + 1` ali não é "o próximo": é um
     número que o fornecedor ainda pode usar amanhã.
     
     A densidade mede isso. Perto de 1 = sequência de verdade (os códigos
     nasceram aqui, um depois do outro). Perto de 0 = catálogo de terceiro. */
  const analisarFaixa = (lista) => {
    const nums = lista.map(Number).filter(n => Number.isFinite(n));
    if (!nums.length) return null;
    const min = Math.min(...nums), max = Math.max(...nums);
    const amplitude = max - min + 1;
    const densidade = Math.round((nums.length / amplitude) * 1000) / 1000;
    return {
      quantidade: nums.length, menor: min, maior: max, amplitude,
      lacunas: amplitude - nums.length, densidade,
      veredito: densidade >= 0.9 ? 'sequencial'
        : densidade >= 0.2 ? 'parcialmente sequencial' : 'esparso',
    };
  };

  const soNumeros = codigos.filter(c => /^\d+$/.test(c));
  const sequencia = {
    numericos: soNumeros.length,
    naoNumericos: codigos.length - soNumeros.length,
    geral: analisarFaixa(soNumeros),
    porPrefixo: prefixos
      .filter(p => p.prefixo !== '(nenhum)')
      .map(p => {
        const corpo = codigos
          .filter(c => c.startsWith(p.prefixo) && /^\d+$/.test(c.slice(p.prefixo.length)))
          .map(c => c.slice(p.prefixo.length));
        return { prefixo: p.prefixo, n: p.n, faixa: analisarFaixa(corpo) };
      }),
  };

  const foraDoPadrao = predominante
    ? codigos.filter(c => formaDoSku(c) !== predominante.forma)
    : [];

  /* O veredito, e ele tem PERMISSÃO de dizer "não sei".
     
     Um gerador só pode continuar uma numeração quando existe numeração
     para continuar. Sem isso, "o próximo código" é uma invenção com cara
     de regra — e inventar aqui é o que este arquivo existe para não
     fazer. */
  const dominaFolgado = !!predominante && predominante.pct >= 95;
  const temSequencia = !!(sequencia.geral && sequencia.geral.densidade >= 0.9)
    || sequencia.porPrefixo.some(p => p.faixa && p.faixa.densidade >= 0.9 && p.n >= 5);

  const conclusao = {
    regraInequivoca: dominaFolgado && temSequencia,
    motivo: !codigos.length
      ? 'Não há código nenhum para auditar neste banco.'
      : !dominaFolgado
        ? `Convivem ${formas.length} formatos diferentes, e o mais comum cobre só ${predominante.pct}% do catálogo. `
          + 'Não existe um padrão único do qual derivar "o próximo código".'
        : !temSequencia
          ? `O formato ${predominante.curta} domina (${predominante.pct}%), mas os códigos NÃO formam sequência `
            + `(densidade ${sequencia.geral ? sequencia.geral.densidade : '—'} na faixa). `
            + 'Continuar a numeração seria escolher um código que a fonte original ainda pode usar.'
          : null,
    /* O exemplo que a TELA deve mostrar. Vem do catálogo real, nunca de um
       código inventado no comentário de um arquivo. */
    exemploReal: predominante ? predominante.exemplos[0] || null : null,
    /* `regraInequivoca` responde "existe sequência a continuar?", e a
       resposta segue sendo NÃO. A decisão de negócio não contradiz isso —
       ela nasce disso: como não há sequência, o gerador sorteia dentro do
       formato em vez de continuar uma contagem que não existe. Os dois
       campos convivem porque um é medida e o outro é escolha. */
    regraEmVigor: `Código novo é sorteado entre ${SKU_MIN} e ${SKU_MAX}, `
      + 'seis dígitos, e conferido contra catálogo, fila, loja e reservas antes de sair.',
  };

  return {
    total: codigos.length,
    porFonte: Object.fromEntries(Object.entries(fontes).map(([k, v]) => [k, v.length])),
    formas,
    predominante,
    tamanhos,
    menor: codigos.length ? codigos.reduce((a, b) => (a.length !== b.length ? (a.length < b.length ? a : b) : (a < b ? a : b))) : null,
    maior: codigos.length ? codigos.reduce((a, b) => (a.length !== b.length ? (a.length > b.length ? a : b) : (a > b ? a : b))) : null,
    prefixos,
    sufixos,
    sequencia,
    colisoes: { total: colisoes.length, itens: colisoes.slice(0, amostra) },
    foraDoPadrao: { total: foraDoPadrao.length, itens: foraDoPadrao.slice(0, amostra) },
    /* O que o gerador está fazendo HOJE, para a auditoria e a decisão
       aparecerem lado a lado em vez de em duas telas diferentes. */
    geradorAtual: {
      modo: 'sorteio', digitos: 6, forma: '9×6',
      min: SKU_MIN, max: SKU_MAX, prefixo: '(nenhum)',
      exemplo: '123456',
    },
    conclusao,
  };
}
