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

/** Prefixo dos códigos criados AQUI.
 *
 *  Os 773 códigos reais da operação são todos numéricos, quase todos de 6
 *  dígitos, e espalhados por toda a faixa de 100000 a 997620 sem nenhuma
 *  sequência — são códigos do fornecedor, não nossos. Gerar "o próximo
 *  número" nessa faixa seria escolher um código que o fornecedor ainda pode
 *  usar amanhã, e a colisão apareceria meses depois, numa etiqueta.
 *
 *  Por isso o gerado é reconhecível: `MQ` + 5 dígitos. Curto (7 caracteres,
 *  cabe na etiqueta), sequencial (nada de código aleatório enorme), nunca
 *  colide com um código numérico do fornecedor, e quem olha sabe na hora
 *  que aquela peça foi cadastrada aqui. CODE128 — o formato das etiquetas —
 *  imprime letra e número sem diferença. */
const PREFIXO = 'MQ';
const DIGITOS = 5;

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

  if (!sku) return { sku: '', digitado: String(bruto ?? ''), valido: false, disponivel: false, motivo: 'vazio' };
  if (sku.length > TAMANHO_MAX) {
    return { sku, digitado: String(bruto ?? ''), valido: false, disponivel: false, motivo: 'longo_demais', limite: TAMANHO_MAX };
  }
  if (!SKU_LIMPO.test(sku)) {
    return { sku, digitado: String(bruto ?? ''), valido: false, disponivel: false, motivo: 'formato_invalido' };
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

/** Devolve um código GARANTIDAMENTE disponível — e o prova reservando-o no
 *  banco antes de responder.
 *
 *  Sem a reserva isto seria impossível de acertar: duas pessoas clicando
 *  ao mesmo tempo leriam o mesmo "maior código atual" e receberiam o mesmo
 *  número, cada uma acreditando que era só dela. Uma cadastraria, a outra
 *  levaria um erro no fim do formulário.
 *
 *  Quem decide o empate é a chave primária de `sku_reservas`: o
 *  `INSERT OR IGNORE` que não mudou nada perdeu a corrida, e o perdedor
 *  tenta o próximo número em vez de devolver conflito para a tela. */
export async function gerarSku(db, { origem = 'cadastro', prefixo = PREFIXO } = {}) {
  const pre = normSku(prefixo) || PREFIXO;

  // Reserva vencida não segura número de ninguém.
  await db.prepare(`DELETE FROM sku_reservas WHERE expira_em <= datetime('now')`).run();

  const maior = await maiorNumero(db, pre);

  /* 50 tentativas cobrem qualquer concorrência real desta operação (uma
     loja, duas pessoas) com folga enorme. Passar disso é sinal de que algo
     está errado de outro jeito, e aí a resposta certa é dizer isso em vez
     de girar para sempre. */
  for (let i = 1; i <= 50; i++) {
    const sku = pre + String(maior + i).padStart(DIGITOS, '0');
    const r = await db.prepare(
      `INSERT OR IGNORE INTO sku_reservas (sku, expira_em, origem)
       VALUES (?, datetime('now', '+${RESERVA_HORAS} hours'), ?)`
    ).bind(sku, origem).run();
    const gravou = r.meta && r.meta.changes;
    if (!gravou) continue;                       // outra chamada levou este

    /* A reserva entrou, mas ela só protege contra outra GERAÇÃO. Falta
       conferir que o código não existe já como produto, pendência ou
       variante da loja — alguém pode ter cadastrado "MQ00007" na mão. */
    const check = await checarSku(db, sku);
    /* Aqui o critério é o mais duro possível — `usos` inteiro, não só o que
       impede cadastro. Um código gerado tem de estar livre em TODOS os
       lugares, inclusive na loja: devolver um que já existe lá seria criar
       de fábrica a colisão que este arquivo existe para evitar. */
    const soAReserva = check.usos.length === 1 && check.usos[0].onde === 'reserva';
    if (check.valido && soAReserva) {
      return { ok: true, sku, expiraEm: horasAdiante(RESERVA_HORAS), origem };
    }
    await db.prepare(`DELETE FROM sku_reservas WHERE sku = ?`).bind(sku).run();
  }

  return { ok: false, erro: 'Não foi possível gerar um código livre depois de 50 tentativas.' };
}

/** O maior número já usado com este prefixo, olhando os TRÊS lugares onde
 *  um código pode estar: cadastrado, na fila e reservado. Olhar só
 *  `produtos` reemitiria um código que está no meio de um cadastro. */
async function maiorNumero(db, pre) {
  const padrao = pre + '%';
  const r = await db.prepare(`
    SELECT MAX(n) AS maior FROM (
      SELECT CAST(SUBSTR(sku, ?) AS INTEGER) AS n FROM produtos           WHERE sku LIKE ?
      UNION ALL
      SELECT CAST(SUBSTR(sku, ?) AS INTEGER)      FROM produtos_pendentes WHERE sku LIKE ?
      UNION ALL
      SELECT CAST(SUBSTR(sku, ?) AS INTEGER)      FROM sku_reservas       WHERE sku LIKE ?
      UNION ALL
      SELECT CAST(SUBSTR(sku_norm, ?) AS INTEGER) FROM loja_variantes     WHERE sku_norm LIKE ?
    )`).bind(
    pre.length + 1, padrao, pre.length + 1, padrao,
    pre.length + 1, padrao, pre.length + 1, padrao,
  ).first();
  return r && r.maior ? r.maior : 0;
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
