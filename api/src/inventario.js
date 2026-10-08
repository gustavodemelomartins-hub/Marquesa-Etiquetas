/** Inventário — a conferência física do que está em casa.  §19 · Fase 4.4
 *
 *  Princípio que manda aqui: **o inventário não corrige nada sozinho.**
 *  Ele conta, compara e mostra a diferença. Transformar a diferença em
 *  saldo é um segundo ato, explícito, um código de cada vez — e mesmo
 *  esse ato vira movimentação (§19), nunca digitação de saldo.
 *
 *  O motivo é prático, não burocrático: uma peça "faltando" quase nunca
 *  sumiu. Ela está na bolsa, foi para a maleta sem lançar, ou a etiqueta
 *  não leu. Se o sistema zerasse o saldo por conta própria, o erro de
 *  contagem viraria a nova verdade e ninguém saberia disso depois.
 *
 *  ── O que a Fase 4.4 acrescentou, e por quê ────────────────────────────
 *  Desenho canônico: docs/domains/INVENTARIO-4-4.md (decisões D1–D13).
 *
 *   D1  a contagem é PAUSÁVEL e pode durar dias — `inventario_contagem`
 *       guarda linha a linha, desde o primeiro bipe;
 *   D2  **não contado nunca é zero.** A ausência de linha é o estado "não
 *       contado"; zero exige gesto explícito e vira `contado = 0`;
 *   D3  item não conferido não entra em lote e não aparece como faltante —
 *       um inventário parado pela metade não pode zerar meio catálogo;
 *   D4  SKU com variação cadastrada exige identidade de variação. Sem ela,
 *       não há movimento — era por aqui que o inventário FABRICAVA
 *       movimento incompleto novo, o defeito que a 4.4 existe para fechar;
 *   D5  "não sei" é resposta válida: bloqueia o SKU e não vira nada;
 *   D6/D7 a diferença dos dois lados é um AJUSTE de inventário
 *       (`inventario_ajustes` + movimento `ajuste`); só o motivo que ELA
 *       escolhe como perda (§55) vai por `saidas_sem_faturamento`,
 *       `tipo='perda'`. Até 05/10/2026 toda diferença virava perda;
 *   D9  a ORIGEM do movimento continua `inventario`: o motivo diz que é
 *       diferença, a origem diz que o fato nasceu de uma contagem física;
 *   D10 comparação RETROAGIDA por `contado_em` — contar na segunda, vender
 *       na quarta e fechar na sexta não é divergência nenhuma;
 *   D11 sem identidade suficiente para provar a retroação, a linha vira
 *       `nao_comparavel` com o motivo escrito. Não se infere;
 *   D12 correção de erro é ESTORNO, nunca ajuste compensatório solto;
 *   D13 nenhum `UPDATE produtos SET qtd`. Tudo pela razão.
 *
 *  `inventario_itens` continua existindo e continua sendo lida, para os
 *  inventários fechados antes desta fase. Ela não recebe escrita nova.
 */
import { json } from './auth.js';
import { registrarSaida } from './saidas.js';
import { movimentar } from './estoque.js';
import { normSku } from './sku.js';
import { adicionarVariacao } from './produtos.js';
import { distribuirVariantes } from './variantes.js';
import { chaveDaVariacao } from './variacao-nome.js';
import { diaOperacional, hojeOperacional } from './fuso.js';

/** O que se espera encontrar em casa: total menos o que está com as
 *  revendedoras. É o mesmo "disponível" do §5.2 — peça consignada não
 *  está em casa e não pode ser cobrada da contagem. */
/** Kit fica de fora: ele nunca tem produtos.qtd próprio (é sempre 0, sem
 *  movimento nenhum), então "contar" um kit não diz nada sobre estoque —
 *  quem tem saldo de verdade para bipar são os componentes dele, que já
 *  aparecem aqui normalmente como qualquer outro produto.
 *
 *  Configuração montável (§42) fica de fora pelo mesmo motivo, e por um a
 *  mais: contá-la levaria a Sthefany a bipar um "Colar Casal" e a somá-lo
 *  às venezianas e pingentes que ela já contou — a dupla contagem que o
 *  modelo existe para impedir.
 *
 *  `qtd` e `consignado` voltam SEPARADOS além do `esperado` já somado: a
 *  comparação por variação precisa dos dois lados em separado para saber
 *  quanto da razão e quanto da consignação ficou sem identidade. */
const SQL_CONTAVEL = `
         p.sku NOT IN (SELECT kit_sku FROM kit_componentes)
     AND p.sku NOT IN (SELECT sku_comercial FROM personalizacao_modelos
                        WHERE sku_comercial IS NOT NULL)`;

/*  A consignação é somada UMA vez, pelas maletas abertas (08/10/2026). A
 *  versão anterior repetia a mesma subconsulta correlacionada duas vezes
 *  por produto (`consignado` e `esperado`) e lia ~6.900 linhas do D1 a cada
 *  abertura, balanço e fechamento; esta lê ~6.100 (medido sobre a cópia de
 *  PROD: o grosso é a varredura de `produtos` com as sondas de kit e
 *  montagem, não a maleta). Mesmo resultado, linha a linha — provado em
 *  `src/inventario-d1-leitura-test.mjs` e no balanço real do inventário #1. */
const SQL_ESPERADO = `
  SELECT p.sku, p.desc, p.cat, p.preco, p.qtd,
         COALESCE(f.consignado, 0) AS consignado,
         p.qtd - COALESCE(f.consignado, 0) AS esperado
    FROM produtos p
    LEFT JOIN (
      SELECT mi.sku AS sku, SUM(mi.qtd - mi.devolvida) AS consignado
        FROM maletas m
        JOIN maleta_itens mi ON mi.maleta_id = m.id
       WHERE m.status IN ('aberta', 'em_acerto')
       GROUP BY mi.sku
    ) f ON f.sku = p.sku
   WHERE ${SQL_CONTAVEL}`;

/** Um inventário "em andamento" é `aberto`, pausado ou não.
 *
 *  Pausar NÃO muda `status` (D1): mexe só em `pausado_em`. É essa escolha
 *  que faz o dashboard legado continuar retomando a contagem sem nenhuma
 *  alteração, e que impede abrir um segundo inventário por cima do que
 *  está parado. O estado "pausado" que a tela mostra é derivado. */
const EM_ANDAMENTO = `status = 'aberto'`;
/** Quanto de UMA variação está consignado. A identificação da maleta vem
 *  pelo `variante_id` quando alguém o disse, e pelo NOME quando não. O que
 *  não estiver identificado NÃO é distribuído por aqui: sobra como
 *  "consignado cego", e é ele que manda o código para `nao_comparavel`. */
const consignadaDe = (consignadas, v) => (
  (v.varianteId != null ? consignadas.get(v.varianteId) : undefined)
  ?? consignadas.get(v.nome) ?? 0);

const statusVisivel = (inv) => (inv.status === 'aberto' && inv.pausado_em ? 'pausado' : inv.status);

/** Chave de uma linha do retrato. O separador é um caractere que não pode
 *  aparecer em SKU nem em nome de variação: sem ele, "748801" + "Aro 16"
 *  colidiria com "748801 Aro" + "16". */
const CHAVE = (sku, variacao) => `${sku}\u0000${variacao || ''}`;

/* ═══════════════════════════════════ a declaração de contagem completa */

/** O texto que uma linha ganha quando ela virou diferença por DECLARAÇÃO,
 *  e não por bipe.
 *
 *  "Não conferido" é permanente enquanto o inventário está aberto: a peça
 *  não bipada é uma incógnita, e a incógnita não vira falta (D3). Essa
 *  trava é o que impede uma contagem interrompida de zerar meio catálogo, e
 *  ela continua exatamente onde estava.
 *
 *  O que faltava era o outro lado. Quando a pessoa afirma, no fechamento,
 *  ter olhado TODO o estoque abrangido por este inventário, uma peça que o
 *  sistema diz ter e que ela não achou deixa de ser incógnita: é uma
 *  divergência, e uma divergência que ninguém pode resolver é a mesma coisa
 *  que um estoque que ninguém confere. Deixar 659 códigos sem resolução e
 *  sem ação não é proteção — é abandono com uma frase bonita em cima.
 *
 *  Três coisas que a declaração NÃO faz, e é por elas que ela é segura:
 *
 *   · não aplica movimento nenhum. Ela muda a SITUAÇÃO no retrato; o ajuste
 *     continua sendo um segundo ato, item a item, com motivo obrigatório;
 *   · não alcança código cuja falta não dá para atribuir a uma variação
 *     (ver `conferivel`). A regra 2 do projeto não tem exceção por
 *     declaração: quem não sabe de qual aro a peça é continua não sabendo;
 *   · não é o caminho padrão. `contagemCompleta` só chega aqui quando o
 *     corpo da requisição o diz, e a tela só o manda depois de repetir
 *     quantos códigos ficaram de fora. */
const DECLARADA_FALTA = 'Não foi bipada, e a contagem foi declarada completa: '
  + 'a peça deveria estar em casa e não estava quando a conferência terminou.';

/** E o contrário: o código que a declaração NÃO consegue resolver, com o
 *  motivo dito em voz alta em vez de sumir da lista (regra 9). */
const DECLARADA_SEM_IDENTIDADE = 'A razão deste código tem peça sem identidade de variação. '
  + 'Dizer que a contagem terminou não diz de qual variação é a falta, e o inventário não chuta.';

/** OS MOTIVOS de uma diferença de inventário.
 *
 *  Não é tabela nova e não é enum de banco: `saidas_sem_faturamento.motivo`
 *  já existe e já é descrito no schema como "rótulo curto e agrupável", e é
 *  ele que chega à razão dentro de `movimentos.obs` (ver
 *  `saidas.js › obsMov`). O que faltava não era estrutura — era a lista.
 *
 *  A lista curta existe pelo mesmo motivo do desconto na venda (§27): texto
 *  livre puro faz cada grafia virar um motivo diferente e nada agrupa, e
 *  "quantas peças eu perdi por saída sem lançamento este ano" vira uma
 *  pergunta sem resposta. "Outro" continua aberto porque a vida não cabe
 *  numa lista de seis — e, como lá, o texto que ela escreve VIRA o rótulo.
 *
 *  `sentido` diz em qual das duas listas o motivo aparece. Um motivo de
 *  sobra oferecido numa falta seria um caminho que não explica nada. */
export const MOTIVOS_DE_DIFERENCA = [
  /* §55 — `classe` decide o que a diferença VIRA. `ajuste` (o padrão) é um
     movimento de ajuste de inventário: o sistema estava errado, e a
     contagem corrige. `perda` é a única classe que vira saída sem
     faturamento (`tipo='perda'`), e só existe porque ela ESCOLHEU dizer que
     a peça se perdeu. Inventário reconcilia o sistema com o físico — a
     diferença não é, por si, uma perda. */
  /* 06/10/2026 — o motivo de quem simplesmente contou: o número certo é o
     que está na mão dela. É o padrão do balanço final. */
  { id: 'contagem_fisica', rotulo: 'Contagem física', sentido: 'ambos', classe: 'ajuste',
    explica: 'contei e o número certo é este' },
  { id: 'erro_de_contagem', rotulo: 'Erro do sistema / contagem anterior', sentido: 'ambos', classe: 'ajuste',
    explica: 'o número do sistema é que estava errado' },
  { id: 'entrada_duplicada', rotulo: 'Entrada duplicada ou cadastro errado', sentido: 'ambos', classe: 'ajuste',
    explica: 'a peça foi contada ou cadastrada duas vezes, ou com a quantidade errada' },
  { id: 'nao_encontrada', rotulo: 'Não encontrada na casa', sentido: 'saida', classe: 'ajuste',
    explica: 'procurei e não achei — ajusta o estoque sem afirmar que se perdeu' },
  { id: 'saiu_sem_lancar', rotulo: 'Saiu sem lançamento', sentido: 'saida', classe: 'ajuste',
    explica: 'foi para maleta, brinde ou venda e ninguém lançou' },
  { id: 'entrou_sem_lancar', rotulo: 'Entrou sem lançamento', sentido: 'entrada', classe: 'ajuste',
    explica: 'chegou do fornecedor e ninguém deu entrada' },
  { id: 'devolucao_nao_lancada', rotulo: 'Devolução não lançada', sentido: 'entrada', classe: 'ajuste',
    explica: 'voltou de maleta, troca ou garantia sem baixa' },
  { id: 'perda', rotulo: 'Perda confirmada', sentido: 'saida', classe: 'perda',
    explica: 'a peça se perdeu de verdade — entra em "Saiu sem faturar" como perda' },
  { id: 'quebrada', rotulo: 'Quebrada ou danificada', sentido: 'saida', classe: 'perda',
    explica: 'existe, mas não vende mais — entra em "Saiu sem faturar" como perda' },
  { id: 'outro', rotulo: 'Outro', sentido: 'ambos', livre: true, classe: 'ajuste',
    explica: 'escreva o que aconteceu — vira ajuste de inventário com esse texto' },
];

/** A classe de um motivo, pelo id (a V2 manda) ou pelo rótulo (texto que
 *  chegou sem id). Texto que não é rótulo de lista nenhuma é o "Outro"
 *  escrito por ela — ajuste. Sem motivo nenhum (o `/ajustar` do painel
 *  clássico) também é ajuste: perda NUNCA é conclusão automática. */
export function classeDoMotivo(motivoId, rotulo) {
  const porId = motivoId ? MOTIVOS_DE_DIFERENCA.find((m) => m.id === motivoId) : null;
  if (porId) return porId.classe;
  const porRotulo = rotulo ? MOTIVOS_DE_DIFERENCA.find((m) => m.rotulo === rotulo) : null;
  return porRotulo ? porRotulo.classe : 'ajuste';
}

const LIMITE_MOTIVO = 60;

/* ═══════════════════════════════════════════════════ abrir, pausar, cancelar */

export async function abrirInventario(db) {
  const aberto = await db.prepare(
    `SELECT id FROM inventarios WHERE ${EM_ANDAMENTO} ORDER BY id DESC LIMIT 1`).first();
  if (aberto) {
    return json({ erro: 'Já existe um inventário em andamento.', id: aberto.id }, 409);
  }
  /* O NÚMERO da tela (06/10/2026) — o próximo depois do maior que existe.
     O id continua técnico e nunca volta; o número de um inventário excluído
     (que por regra não mexeu em estoque) pode ser reaproveitado, e é isso
     que faz o primeiro inventário real ser o #1. */
  const r = await db.prepare(
    `INSERT INTO inventarios (status, numero)
     VALUES ('aberto', (SELECT COALESCE(MAX(numero), 0) + 1 FROM inventarios))
     RETURNING id, numero, iniciado_em`).first();
  return json({ id: r.id, numero: r.numero, iniciadoEm: r.iniciado_em, status: 'aberto' }, 201);
}

/** O número que a Sthefany vê. Inventário anterior à numeração (banco sem a
 *  coluna preenchida) cai no id — nunca aparece vazio. */
export const numeroDe = (inv) => (inv?.numero ?? inv?.id ?? null);

/** D1 — pausar e retomar não tocam a contagem, porque não precisam: cada
 *  bipe já está gravado. Pausar é só o registro de que ela parou, para a
 *  tela poder dizer isso e para a cobertura fazer sentido ao lado. */
async function marcarPausa(db, id, pausar) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') {
    return json({ erro: 'Só dá para pausar ou retomar um inventário em andamento' }, 409);
  }
  await db.prepare(`UPDATE inventarios SET pausado_em = ${pausar ? `datetime('now')` : 'NULL'} WHERE id = ?`)
    .bind(id).run();
  const depois = await db.prepare(`SELECT pausado_em FROM inventarios WHERE id = ?`).bind(id).first();
  return json({
    ok: true, id,
    status: pausar ? 'pausado' : 'aberto',
    pausadoEm: depois.pausado_em ?? null,
    cobertura: await cobertura(db, id),
  });
}

export const pausarInventario = (db, id) => marcarPausa(db, id, true);
export const retomarInventario = (db, id) => marcarPausa(db, id, false);

/** §28: um inventário abandonado no meio é cancelado, não apagado —
 *  saber que uma contagem foi começada e largada também é informação. */
export async function cancelarInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') return json({ erro: 'Só dá para cancelar um inventário em andamento' }, 409);
  await db.prepare(
    `UPDATE inventarios SET status = 'cancelado', concluido_em = datetime('now') WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

/** §53 — o que impede EXCLUIR um inventário: qualquer efeito em estoque.
 *  Linha do retrato aplicada, saída de perda amarrada (mesmo estornada — ela
 *  mexeu no estoque e o estorno também), ajuste de inventário, movimento que
 *  cite o inventário. Devolve a lista dos motivos; vazia = excluível. */
async function efeitosNoEstoque(db, id) {
  const conta = async (sql) => {
    try { return Number((await db.prepare(sql).bind(id).first())?.n ?? 0); } catch { return 0; }
  };
  const efeitos = [];
  const aplicadas = await conta(
    `SELECT COUNT(*) n FROM inventario_resultado WHERE inventario_id = ? AND aplicado_em IS NOT NULL`);
  if (aplicadas) efeitos.push(`${aplicadas} diferença(s) aplicada(s) no estoque`);
  const saidas = await conta(`SELECT COUNT(*) n FROM saidas_sem_faturamento WHERE inventario_id = ?`);
  if (saidas) efeitos.push(`${saidas} saída(s) de perda lançada(s)`);
  const ajustes = await conta(`SELECT COUNT(*) n FROM inventario_ajustes WHERE inventario_id = ?`);
  if (ajustes) efeitos.push(`${ajustes} ajuste(s) de inventário`);
  const antigos = await conta(`SELECT COUNT(*) n FROM inventario_itens WHERE inventario_id = ? AND ajustado = 1`);
  if (antigos) efeitos.push(`${antigos} ajuste(s) do inventário antigo`);
  /* O movimento cita o inventário pelo NÚMERO da tela desde 06/10/2026, e
     pelo id antes disso — os dois são procurados. */
  const inv = await db.prepare(`SELECT numero FROM inventarios WHERE id = ?`).bind(id).first();
  const citacoes = [...new Set([id, inv?.numero].filter((n) => n != null))];
  let movs = 0;
  for (const n of citacoes) {
    try {
      movs += Number((await db.prepare(
        `SELECT COUNT(*) n FROM movimentos WHERE origem = 'inventario'
            AND (obs LIKE '%nventário #' || ?1 || ' %' OR obs LIKE '%nventário #' || ?1)`).bind(n).first())?.n ?? 0);
    } catch { /* sem a tabela */ }
  }
  if (movs) efeitos.push(`${movs} movimento(s) de estoque citando este inventário`);
  return efeitos;
}

/** §53 — EXCLUIR um inventário, só quando ele não mexeu em estoque.
 *
 *  O pedido da Sthefany (05/10/2026): apagar inventário de teste ou aberto
 *  por engano. A regra contábil não muda — o que alterou estoque não se
 *  apaga, porque a razão precisa continuar explicando o saldo (§28). O que
 *  NÃO alterou é só uma contagem largada; apagá-la não tira explicação de
 *  número nenhum.
 *
 *  Em andamento: descarte primeiro (o descarte é o registro de que a
 *  contagem foi largada). A exclusão deixa uma linha em
 *  `inventarios_excluidos` — quando, em que situação, quantas leituras e as
 *  variações criadas durante a contagem, que CONTINUAM no cadastro da peça
 *  (estrutura, não estoque). O id não volta a ser usado (AUTOINCREMENT). */
export async function excluirInventario(db, id, corpo = {}) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status === 'aberto') {
    return json({
      erro: 'Este inventário ainda está em andamento. Descarte a contagem antes de excluir.',
    }, 409);
  }
  const efeitos = await efeitosNoEstoque(db, id);
  if (efeitos.length) {
    return json({
      erro: 'Este inventário já alterou o estoque e não pode ser excluído: o histórico das peças depende dele.',
      efeitos,
    }, 409);
  }

  const leituras = await db.prepare(
    `SELECT COUNT(*) n, COALESCE(SUM(contado), 0) pecas FROM inventario_contagem WHERE inventario_id = ?`)
    .bind(id).first();
  let eventos = [];
  try {
    eventos = ((await db.prepare(
      `SELECT tipo, sku, variacao, detalhe, em FROM inventario_eventos WHERE inventario_id = ? ORDER BY id`)
      .bind(id).all()).results) ?? [];
  } catch { /* banco sem a tabela de eventos */ }
  const motivo = String(corpo.motivo ?? '').trim().slice(0, 200) || null;

  /* Um batch: o registro da exclusão e a remoção das linhas, filhas antes
     da mãe (as chaves estrangeiras valem no D1). Tabela que este banco não
     tem fica de fora — não há linha dela a apagar. */
  const existe = async (tabela) => !!(await db.prepare(
    `SELECT 1 x FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(tabela).first());
  const filhas = ['inventario_contagem', 'inventario_eventos', 'inventario_itens',
    'inventario_nao_identificado', 'inventario_resultado', 'inventario_leituras'];
  const stmts = [
    db.prepare(
      `INSERT INTO inventarios_excluidos
         (inventario_id, status, iniciado_em, concluido_em, leituras, pecas, eventos_json, motivo, numero)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, statusVisivel(inv), inv.iniciado_em ?? null, inv.concluido_em ?? null,
      Number(leituras?.n ?? 0), Number(leituras?.pecas ?? 0), JSON.stringify(eventos), motivo,
      inv.numero ?? null),
  ];
  for (const t of filhas) {
    if (await existe(t)) stmts.push(db.prepare(`DELETE FROM ${t} WHERE inventario_id = ?`).bind(id));
  }
  stmts.push(db.prepare(`DELETE FROM inventarios WHERE id = ?`).bind(id));
  await db.batch(stmts);

  return json({
    ok: true, id, numero: numeroDe(inv), excluido: true,
    leituras: Number(leituras?.n ?? 0),
    variacoesMantidas: eventos.filter((e) => e.tipo === 'variacao_criada')
      .map((e) => ({ sku: e.sku, variacao: e.variacao })),
  });
}

/* ══════════════════════════════════════════════════════════ variações do SKU */

/** As variações CADASTRADAS de um SKU, com o saldo que a razão atribui a
 *  cada uma. O saldo de uma variação é a mesma soma de `movimentos.qtd`
 *  que fecha a invariante, com um filtro de identidade a mais — não existe
 *  segunda contabilidade para desencontrar.
 *
 *  O casamento é o mesmo de `pendencias.js › escolherVariacao`: pelo
 *  `variante_id` quando o movimento sabe dele, pelo NOME quando não sabe. */
async function variacoesComSaldo(db) {
  const { results } = await db.prepare(
    `SELECT pv.sku, pv.nome, pv.variante_id, pv.ordem,
            COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo
                       WHERE mo.sku = pv.sku
                         AND (mo.variante_id = pv.variante_id
                              OR (mo.variante_id IS NULL AND mo.variacao = pv.nome))), 0) AS saldo
       FROM produto_variacoes pv
      ORDER BY pv.sku, pv.ordem, pv.nome`).all();

  const porSku = new Map();
  for (const r of results ?? []) {
    if (!porSku.has(r.sku)) porSku.set(r.sku, []);
    porSku.get(r.sku).push({
      nome: r.nome,
      varianteId: r.variante_id == null ? null : String(r.variante_id),
      saldo: Number(r.saldo || 0),
    });
  }
  return porSku;
}

/** A régua de variações de UM código, sem o saldo.
 *
 *  Existe separada de propósito: contar é o gesto mais repetido do sistema
 *  — uma chamada por bipe — e a versão com saldo tem uma subconsulta sobre
 *  `movimentos` por variação. Ler a linha do produto para montar a régua é
 *  tudo o que a contagem precisa, e é o que evita transformar um inventário
 *  de 790 códigos numa varredura da razão inteira a cada peça. */
async function variacoesDoSku(db, sku) {
  const { results } = await db.prepare(
    `SELECT nome, variante_id FROM produto_variacoes WHERE sku = ? ORDER BY ordem, nome`)
    .bind(sku).all();
  return (results ?? []).map((r) => ({
    nome: r.nome,
    varianteId: r.variante_id == null ? null : String(r.variante_id),
  }));
}

/** Quanto de cada variação está consignado numa maleta que não encerrou.
 *
 *  Tabela nova (`maleta_item_variacoes`, pós-golive-1); banco que ainda não
 *  rodou a migration devolve vazio, e o comportamento é o mesmo de nunca
 *  ter identificado nada — que é justamente o que faz a comparação por
 *  variação parar em `nao_comparavel` em vez de chutar. */
async function consignadoPorVariacao(db) {
  const mapa = new Map();
  try {
    const { results } = await db.prepare(
      `SELECT mv.sku, mv.variacao, mv.variante_id, SUM(mv.qtd) AS qtd
         FROM maleta_item_variacoes mv
         JOIN maletas m ON m.id = mv.maleta_id
        WHERE m.status IN ('aberta', 'em_acerto')
        GROUP BY mv.sku, mv.variacao, mv.variante_id`).all();
    for (const r of results ?? []) {
      if (!mapa.has(r.sku)) mapa.set(r.sku, new Map());
      const m = mapa.get(r.sku);
      for (const chave of [r.variante_id == null ? null : String(r.variante_id), r.variacao]) {
        if (chave == null) continue;
        m.set(chave, (m.get(chave) || 0) + Number(r.qtd || 0));
        break;
      }
    }
  } catch { /* migration pendente: nenhuma consignação identificada */ }
  return mapa;
}

/* ═════════════════════════════════════════════════════════ contagem (D1, D2) */

async function inventarioEmAndamento(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return { erro: json({ erro: 'Inventário não encontrado' }, 404) };
  if (inv.status !== 'aberto') return { erro: json({ erro: 'Este inventário já foi fechado' }, 409) };
  return { inv };
}

/** O QUE SE ESPERA EM CASA, AGORA, para UMA linha — o código inteiro ou uma
 *  variação dele. É o número que o bipe confere (02/10/2026).
 *
 *  A regra é a mesma de `SQL_ESPERADO` (total menos o que está nas maletas
 *  abertas), recortada para um código só: o bipe é o gesto mais repetido do
 *  sistema, e reler o catálogo inteiro a cada peça seria o atraso que a
 *  Sthefany não tem no Excel.
 *
 *  Na variação, o esperado só existe quando a razão do código tem identidade
 *  inteira — toda peça sabe de qual aro é, e toda peça consignada também.
 *  Sem isso a resposta é `null`, e quem chamou pede o número a quem está com
 *  a peça na mão: o servidor não reparte o código entre aros (regra 2). */
async function esperadoAgora(db, sku, { variacao = '', varianteId = null } = {}) {
  const p = await db.prepare(
    `SELECT p.qtd,
            COALESCE((SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
                        JOIN maletas m ON m.id = mi.maleta_id
                       WHERE mi.sku = p.sku AND m.status IN ('aberta', 'em_acerto')), 0) AS consignado
       FROM produtos p WHERE p.sku = ?`).bind(sku).first();
  if (!p) return null;
  const qtd = Number(p.qtd || 0);
  const consignado = Number(p.consignado || 0);
  if (!variacao && !varianteId) return qtd - consignado;

  const { results } = await db.prepare(
    `SELECT pv.nome, pv.variante_id,
            COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo
                       WHERE mo.sku = pv.sku
                         AND (mo.variante_id = pv.variante_id
                              OR (mo.variante_id IS NULL AND mo.variacao = pv.nome))), 0) AS saldo
       FROM produto_variacoes pv WHERE pv.sku = ?`).bind(sku).all();
  const cadastradas = (results ?? []).map((r) => ({
    nome: r.nome, varianteId: r.variante_id == null ? null : String(r.variante_id), saldo: Number(r.saldo || 0),
  }));
  const alvo = cadastradas.find((v) => (varianteId ? v.varianteId === varianteId : v.nome === variacao));
  if (!alvo) return null;
  const consignadas = (await consignadoPorVariacao(db)).get(sku) || new Map();
  const identificado = cadastradas.reduce((s, v) => s + v.saldo, 0);
  const consignadoIdent = cadastradas.reduce((s, v) => s + consignadaDe(consignadas, v), 0);
  if (identificado !== qtd || consignadoIdent !== consignado) return null;
  return alvo.saldo - consignadaDe(consignadas, alvo);
}

/** Conta UMA linha: um SKU, ou um SKU numa variação. Upsert — reenviar o
 *  mesmo corpo com o número certo corrige o engano, e é assim que a tela
 *  desfaz uma bipada a mais.
 *
 *  D4 é cobrado aqui, e é a trava que impede o inventário de voltar a
 *  fabricar movimento sem variação: SKU com variação cadastrada NÃO aceita
 *  contagem agregada. O 409 devolve o cardápio dentro do erro, para a tela
 *  montar a régua sem inventar nome nenhum. */
export async function contarItem(db, id, corpo = {}) {
  const { inv, erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;

  const sku = normSku(corpo.sku);
  if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);

  /* DOIS JEITOS DE DIZER O QUE ESTÁ NA GAVETA (02/10/2026).
   *
   *  `contado` — o número absoluto, como sempre foi (dashboard clássico,
   *  campo digitado).
   *
   *  `faltando` — o jeito da Sthefany. O sistema já sabe quanto deveria
   *  haver em casa; ela bipa a referência UMA vez para dizer "conferi" e só
   *  diz QUANTO falta. O esperado é lido aqui, no servidor, na hora do bipe:
   *  a tela pode estar com um número de cinco minutos atrás, e o contado
   *  nunca pode nascer de um esperado velho. */
  const porFalta = corpo.faltando !== undefined && corpo.faltando !== null && corpo.faltando !== '';
  const faltando = porFalta ? Number(corpo.faltando) : null;
  if (porFalta && (!Number.isInteger(faltando) || faltando < 0)) {
    return json({ erro: 'Faltando tem que ser um inteiro maior ou igual a zero.' }, 400);
  }
  let contado = porFalta ? null : Number(corpo.contado);
  /* D2 — zero é legítimo e significativo aqui: é "conferi, não tem
     nenhuma". O que não existe é contagem negativa. */
  if (!porFalta && (!Number.isInteger(contado) || contado < 0)) {
    return json({ erro: 'A contagem tem que ser um inteiro maior ou igual a zero.' }, 400);
  }

  const p = await db.prepare(
    `SELECT sku, desc FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo.`, sku, desconhecido: true }, 409);

  const forasDoInventario = await db.prepare(
    `SELECT 1 FROM produtos p
      WHERE p.sku = ?
        AND (p.sku IN (SELECT kit_sku FROM kit_componentes)
             OR p.sku IN (SELECT sku_comercial FROM personalizacao_modelos
                           WHERE sku_comercial IS NOT NULL))`).bind(sku).first();
  if (forasDoInventario) {
    return json({
      erro: `${p.desc} não tem saldo próprio — quem se conta são as peças que o compõem.`, sku,
    }, 409);
  }

  const cadastradas = await variacoesDoSku(db, sku);
  let variacao = String(corpo.variacao ?? '').trim();
  let varianteId = corpo.varianteId == null || corpo.varianteId === '' ? null : String(corpo.varianteId);

  /* `codigoInteiro` — ela conferiu o CÓDIGO, todas as variações juntas.
     É o bipe comum: a etiqueta do anel é a mesma para todos os aros. A
     linha fica agregada (`variacao = ''`), e o fechamento só a dá por
     conferida quando bate; diferença num código com variação continua
     sem virar movimento enquanto não se disser de qual aro (D4). */
  const codigoInteiro = corpo.codigoInteiro === true;
  if (cadastradas.length && !variacao && !varianteId && codigoInteiro) {
    /* segue agregado */
  } else if (cadastradas.length) {
    if (!variacao && !varianteId) {
      return json({
        erro: `${p.desc} tem variação cadastrada. Diga qual você contou.`,
        sku,
        variacoes: cadastradas.map((v) => ({ nome: v.nome, varianteId: v.varianteId })),
      }, 409);
    }
    const achada = varianteId
      ? cadastradas.find((v) => v.varianteId === varianteId)
      : cadastradas.find((v) => v.nome === variacao);
    if (!achada) {
      return json({
        erro: `"${varianteId ?? variacao}" não é uma variação cadastrada de ${sku}.`,
        sku,
        variacoes: cadastradas.map((v) => ({ nome: v.nome, varianteId: v.varianteId })),
      }, 409);
    }
    variacao = achada.nome;
    varianteId = achada.varianteId;
  } else if (variacao || varianteId) {
    return json({
      erro: `${p.desc} não tem variação cadastrada. Cadastre as variações antes de contar por variação.`,
      sku,
    }, 409);
  }

  let esperado = null;
  if (porFalta) {
    esperado = await esperadoAgora(db, sku, { variacao, varianteId });
    if (esperado == null) {
      return json({
        erro: `O sistema não sabe quantas de ${p.desc}${variacao ? ` (${variacao})` : ''} deveriam estar em casa. `
          + 'Diga quantas você encontrou.',
        sku, variacao: variacao || null, precisaContado: true,
      }, 409);
    }
    /* Peça na mão e o sistema esperando zero em casa: não existe "falta" a
       dizer. Quantas ela achou é o único número que diz alguma coisa. */
    if (esperado <= 0) {
      return json({
        erro: `O sistema não esperava ${p.desc} em casa. Diga quantas você encontrou.`,
        sku, variacao: variacao || null, esperado, precisaContado: true,
      }, 409);
    }
    if (faltando > esperado) {
      return json({
        erro: `Faltando ${faltando} é mais do que as ${esperado} esperadas em casa.`,
        sku, esperado,
      }, 400);
    }
    contado = esperado - faltando;
  }

  const origem = corpo.origem === 'digitado' ? 'digitado' : 'bipagem';
  const linha = await db.prepare(
    `INSERT INTO inventario_contagem
       (inventario_id, sku, variacao, variante_id, contado, origem, esperado_na_hora, faltando)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (inventario_id, sku, variacao) DO UPDATE
        SET contado = excluded.contado,
            variante_id = excluded.variante_id,
            origem = excluded.origem,
            esperado_na_hora = excluded.esperado_na_hora,
            faltando = excluded.faltando,
            contado_em = datetime('now')
     RETURNING *`,
  ).bind(id, sku, variacao || '', varianteId, contado, origem, esperado, faltando).first();

  return json({
    ok: true,
    sku, desc: p.desc,
    variacao: linha.variacao || null,
    varianteId: linha.variante_id ?? null,
    contado: linha.contado,
    esperado: linha.esperado_na_hora ?? null,
    faltando: linha.faltando ?? null,
    contadoEm: linha.contado_em,
    cobertura: await cobertura(db, id),
    pausado: !!inv.pausado_em,
  });
}

/* ═══════════════════════════════ a LEITURA — uma peça de cada vez (06/10/2026) */

/** O gesto que cada leitura representa. Todos viram linha em
 *  `inventario_leituras`, com o id que a tela gerou para ele. */
const GESTOS = new Set(['bipe', 'mais', 'menos', 'definir', 'todas', 'nenhuma', 'mover', 'limpar']);

/** A peça é contável neste inventário? Kit e configuração montável não têm
 *  saldo próprio — quem se conta são as peças que os compõem. */
async function pecaContavel(db, sku) {
  const p = await db.prepare(`SELECT sku, desc FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return { erro: json({ erro: `Código ${sku} não está no catálogo.`, sku, desconhecido: true }, 409) };
  const fora = await db.prepare(
    `SELECT 1 FROM produtos p
      WHERE p.sku = ?
        AND (p.sku IN (SELECT kit_sku FROM kit_componentes)
             OR p.sku IN (SELECT sku_comercial FROM personalizacao_modelos
                           WHERE sku_comercial IS NOT NULL))`).bind(sku).first();
  if (fora) {
    return { erro: json({ erro: `${p.desc} não tem estoque próprio — conte as peças que o compõem.`, sku }, 409) };
  }
  return { p };
}

/** As linhas contadas de UM código neste inventário: '' é a variação não
 *  informada, o resto é o nome cadastrado da variação. */
async function linhasDoCodigo(db, id, sku) {
  const { results } = await db.prepare(
    `SELECT variacao, contado, contado_em FROM inventario_contagem
      WHERE inventario_id = ? AND sku = ? ORDER BY variacao`).bind(id, sku).all();
  return (results ?? []).map((r) => ({ variacao: r.variacao || '', contado: Number(r.contado), contadoEm: r.contado_em }));
}

/** CONTA UMA PEÇA — o gesto mais repetido do sistema.
 *
 *  O modelo mudou em 06/10/2026, pelo uso real: um bipe é UMA UNIDADE
 *  conferida, e a tela mostra "esperado em casa 6 · conferido 3". O jeito
 *  antigo ("um bipe confere a referência inteira") fazia um único bipe
 *  aparecer como "6 em casa", e a Sthefany entendeu que a máquina tinha
 *  contado várias; e o "+ variação" gravava sempre 1, então duas peças do
 *  mesmo aro não cabiam. Agora:
 *
 *    bipe / mais   +1 na linha (variação, ou "não informada")
 *    menos         −1
 *    definir       o número digitado vira a contagem da linha — é o TOTAL
 *                  da linha, nunca "mais X" (2 bipadas + 5 digitadas = 5).
 *                  Com `naoInformadas: true` numa variação, ela disse que
 *                  as peças bipadas sem variação estão entre as digitadas:
 *                  elas passam para a variação em vez de somar (§59)
 *    todas         "estão todas aqui": a contagem do código vira o esperado
 *    nenhuma       "procurei e não tem": conferido ZERO (que não é "não
 *                  conferido" — §19, D2)
 *    mover         a peça bipada sem variação passa a ter a variação dita
 *    limpar        volta o código para "não conferido"
 *
 *  `leituraId` é obrigatório e é a trava contra contar duas vezes: a tela
 *  gera um por gesto e o reenvia igual quando a rede falha. A leitura que já
 *  chegou responde `repetida: true` e não soma nada. A trava contra o bipe
 *  REPETIDO (o mesmo código de novo, sem outro no meio, a qualquer tempo)
 *  é da tela, que pergunta antes de mandar — o servidor não tem como
 *  distinguir dois anéis iguais da mesma peça lida duas vezes (§59).
 *
 *  Nada aqui mexe em estoque: é contagem. Variação desconhecida no bipe fica
 *  em "não informada" — nunca é atribuída a um aro sem ela dizer (regra 2). */
export async function registrarLeitura(db, id, corpo = {}) {
  const { inv, erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;
  if (inv.pausado_em) {
    return json({ erro: 'O inventário está pausado. Toque em Continuar para voltar a conferir.' }, 409);
  }
  const sku = normSku(corpo.sku);
  if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);
  const leituraId = String(corpo.leituraId ?? '').trim();
  if (!leituraId || leituraId.length > 80) return json({ erro: 'Leitura sem identificação.' }, 400);
  const gesto = String(corpo.gesto ?? 'bipe');
  if (!GESTOS.has(gesto)) return json({ erro: 'Gesto de contagem desconhecido.' }, 400);

  const { p, erro: foraDoInventario } = await pecaContavel(db, sku);
  if (foraDoInventario) return foraDoInventario;

  const repetida = await db.prepare(
    `SELECT 1 AS x FROM inventario_leituras WHERE inventario_id = ? AND leitura_id = ? LIMIT 1`)
    .bind(id, leituraId).first();
  if (repetida) {
    return json({ ok: true, repetida: true, sku, desc: p.desc, linhas: await linhasDoCodigo(db, id, sku) });
  }

  const cadastradas = await variacoesDoSku(db, sku);
  /* O nome que ela mandou, resolvido para o cadastrado: "nº23" e "n°23"
     são a mesma variação. `null` = não existe neste código. */
  const resolver = (nome) => {
    const t = String(nome ?? '').trim();
    if (!t) return { nome: '', varianteId: null };
    const exato = cadastradas.find((v) => v.nome === t);
    const achada = exato ?? cadastradas.find((v) => chaveDaVariacao(v.nome) === chaveDaVariacao(t));
    return achada ? { nome: achada.nome, varianteId: achada.varianteId } : null;
  };

  const linhas = await linhasDoCodigo(db, id, sku);
  const atual = new Map(linhas.map((l) => [l.variacao, l.contado]));
  const somaAtual = linhas.reduce((s, l) => s + l.contado, 0);

  /* As partes da leitura: em qual linha, quanto. */
  let partes = [];
  const naVariacao = (campo = 'variacao') => {
    const r = resolver(corpo[campo]);
    if (!r) {
      return { erro: json({
        erro: `"${String(corpo[campo]).trim()}" não é uma variação de ${p.desc}.`, sku,
        variacoes: cadastradas.map((v) => v.nome),
      }, 409) };
    }
    return { r };
  };

  if (gesto === 'bipe' || gesto === 'mais' || gesto === 'menos' || gesto === 'definir') {
    const { r, erro: e } = naVariacao();
    if (e) return e;
    let delta = gesto === 'menos' ? -1 : 1;
    if (gesto === 'definir') {
      const n = Number(corpo.quantidade);
      if (!Number.isInteger(n) || n < 0 || n > 9999) {
        return json({ erro: 'A quantidade tem que ser um número inteiro de 0 a 9999.' }, 400);
      }
      const antes = atual.get(r.nome) ?? 0;
      delta = n - antes;
      /* "Estão entre as digitadas": as bipadas sem variação passam para a
         variação, no mesmo lote — o total da peça vira o número dito. */
      const entram = corpo.naoInformadas === true && r.nome
        ? Math.min(atual.get('') ?? 0, Math.max(0, delta)) : 0;
      if (entram > 0) {
        partes.push({ nome: '', varianteId: null, delta: -entram });
      } else if (delta === 0 && atual.has(r.nome)) {
        /* O mesmo número que já estava: nada a gravar, nem rastro. */
        return json({ ok: true, sku, desc: p.desc, gesto, inalterada: true, linhas });
      }
    }
    partes.push({ ...r, delta });
  } else if (gesto === 'mover') {
    const de = naVariacao('de');
    if (de.erro) return de.erro;
    const para = naVariacao('para');
    if (para.erro) return para.erro;
    if (de.r.nome === para.r.nome) return json({ erro: 'A peça já está nessa variação.' }, 409);
    const qtd = corpo.quantidade == null ? 1 : Number(corpo.quantidade);
    if (!Number.isInteger(qtd) || qtd < 1) return json({ erro: 'Quantidade inválida.' }, 400);
    partes = [{ ...de.r, delta: -qtd }, { ...para.r, delta: qtd }];
  } else if (gesto === 'todas') {
    const esperado = await esperadoAgora(db, sku);
    if (esperado == null || esperado <= 0) {
      return json({ erro: `O sistema não esperava ${p.desc} em casa. Conte as peças uma a uma.`, sku }, 409);
    }
    /* Num código com variação, as variações já contadas ficam como estão e
       o que falta para chegar ao esperado entra como "não informada". */
    const contadasComVariacao = somaAtual - (atual.get('') ?? 0);
    const alvo = Math.max(0, esperado - contadasComVariacao);
    partes = [{ nome: '', varianteId: null, delta: alvo - (atual.get('') ?? 0) }];
  } else if (gesto === 'nenhuma') {
    partes = linhas.filter((l) => l.contado > 0)
      .map((l) => ({ ...(resolver(l.variacao) ?? { nome: l.variacao, varianteId: null }), delta: -l.contado }));
    if (!atual.has('')) partes.push({ nome: '', varianteId: null, delta: 0 });
  } else if (gesto === 'limpar') {
    if (!linhas.length) {
      return json({ ok: true, sku, desc: p.desc, linhas: [] });
    }
    await db.batch([
      ...linhas.map((l) => db.prepare(
        `INSERT INTO inventario_leituras (inventario_id, leitura_id, sku, variacao, delta, gesto)
         VALUES (?, ?, ?, ?, ?, 'limpar')`).bind(id, leituraId, sku, l.variacao, -l.contado)),
      db.prepare(`DELETE FROM inventario_contagem WHERE inventario_id = ? AND sku = ?`).bind(id, sku),
    ]);
    return json({ ok: true, sku, desc: p.desc, linhas: [] });
  }

  if (!cadastradas.length && partes.some((pt) => pt.nome)) {
    return json({ erro: `${p.desc} não tem variação cadastrada.`, sku }, 409);
  }
  for (const pt of partes) {
    if ((atual.get(pt.nome) ?? 0) + pt.delta < 0) {
      return json({
        erro: `Não há peça contada em ${pt.nome || 'variação não informada'} para tirar.`, sku,
      }, 409);
    }
  }

  /* Um batch: as leituras PRIMEIRO (a chave única recusa a repetida e
     desfaz o resto), depois a soma na contagem. `MAX(?, 0)` no VALUES
     porque o CHECK de `contado` vale antes do ON CONFLICT. */
  const stmts = [];
  for (const pt of partes) {
    stmts.push(db.prepare(
      `INSERT INTO inventario_leituras (inventario_id, leitura_id, sku, variacao, delta, gesto)
       VALUES (?, ?, ?, ?, ?, ?)`).bind(id, leituraId, sku, pt.nome, pt.delta, gesto));
  }
  for (const pt of partes) {
    stmts.push(db.prepare(
      `INSERT INTO inventario_contagem (inventario_id, sku, variacao, variante_id, contado, origem)
       VALUES (?, ?, ?, ?, MAX(?, 0), 'bipagem')
       ON CONFLICT (inventario_id, sku, variacao) DO UPDATE
          SET contado = inventario_contagem.contado + ?,
              variante_id = excluded.variante_id,
              origem = 'bipagem',
              esperado_na_hora = NULL,
              faltando = NULL,
              contado_em = datetime('now')`,
    ).bind(id, sku, pt.nome, pt.varianteId ?? null, pt.delta, pt.delta));
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    if (/UNIQUE constraint/i.test(String(e?.message ?? e))) {
      return json({ ok: true, repetida: true, sku, desc: p.desc, linhas: await linhasDoCodigo(db, id, sku) });
    }
    if (/CHECK constraint/i.test(String(e?.message ?? e))) {
      return json({ erro: 'A contagem não pode ficar negativa.', sku }, 409);
    }
    throw e;
  }

  /* A leitura JÁ está gravada. Reler as linhas é só para a resposta: se o
     banco falhar AGORA (cota do D1 no limite, rede), a resposta não pode
     virar erro — a tela poria na fila de reenvio uma leitura que entrou, e
     ela ficaria sem saber se o bipe valeu. Sem a releitura, a conta é a do
     lote que acabou de entrar. */
  let depois;
  try {
    depois = await linhasDoCodigo(db, id, sku);
  } catch {
    depois = linhasAposLote(linhas, partes);
  }
  return json({ ok: true, sku, desc: p.desc, gesto, linhas: depois });
}

/** As linhas do código depois de um lote, calculadas sem voltar ao banco:
 *  o que havia + o delta de cada parte. Mesma regra do upsert. */
function linhasAposLote(linhas, partes) {
  const m = new Map(linhas.map((l) => [l.variacao, l.contado]));
  for (const pt of partes) m.set(pt.nome, Math.max(0, (m.get(pt.nome) ?? 0) + pt.delta));
  return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([variacao, contado]) => ({ variacao, contado, contadoEm: null }));
}


/* ════════════════════════════════════ variação criada sem sair da contagem */

/** "+ Criar variação" na própria contagem (02/10/2026; refeito em 06/10).
 *
 *  A Sthefany pega o anel, vê que o aro 19 não existe no cadastro e não pode
 *  sair do inventário para ir até Peças. A variação nasce OFICIAL — a mesma
 *  `produtos.js › adicionarVariacao` de Peças: fica no cadastro, aparece em
 *  vendas, maletas e nos próximos inventários. Nada de variação temporária.
 *
 *  `quantidade` é quantas ela tem na mão desse aro. As peças que ela já
 *  bipou sem variação ("não informada") passam para a variação nova antes
 *  de qualquer peça ser somada — senão o bipe e a criação contariam o mesmo
 *  anel duas vezes.
 *
 *  Se a variação já existe ("23" quando há "nº23"), nada é criado: a
 *  resposta diz qual é (`jaExiste`, `existente`), e a tela oferece contar
 *  nela. */
export async function criarVariacaoNaContagem(db, id, corpo = {}) {
  const { inv, erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;
  const sku = normSku(corpo.sku);
  if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);
  const quantidade = corpo.quantidade == null || corpo.quantidade === '' ? 0 : Number(corpo.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 9999) {
    return json({ erro: 'A quantidade encontrada tem que ser um número inteiro.' }, 400);
  }

  const r = await adicionarVariacao(db, sku, { valor: corpo.valor, atributo: corpo.atributo });
  if (r.erro) {
    const { status, ...resto } = r;
    return json(resto, status || 409);
  }
  if (r.criadas.length) {
    await db.batch(r.criadas.map((c) => db.prepare(
      `INSERT INTO inventario_eventos (inventario_id, tipo, sku, variacao, detalhe)
       VALUES (?, 'variacao_criada', ?, ?, ?)`).bind(id, sku, c.nome,
      JSON.stringify({ atributo: r.atributo, valor: r.valor, varianteId: c.varianteId }))));
  }

  /* A contagem da variação nova. Só quando há UMA combinação nova (o caso do
     anel): com duas cores e um aro novo nasceriam duas, e de qual cor é a
     peça na mão quem diz é ela, na linha da variação. */
  let contagem = null;
  if (quantidade > 0 && r.criadas.length === 1 && !inv.pausado_em) {
    const nova = r.criadas[0].nome;
    const linhas = await linhasDoCodigo(db, id, sku);
    const semVariacao = linhas.find((l) => l.variacao === '')?.contado ?? 0;
    const mover = Math.min(semVariacao, quantidade);
    const base = String(corpo.leituraId ?? '').trim() || `criar-${id}-${sku}-${Date.now()}`;
    if (mover > 0) {
      contagem = await registrarLeitura(db, id, {
        sku, leituraId: `${base}:mover`, gesto: 'mover', de: '', para: nova, quantidade: mover,
      });
    }
    if (quantidade - mover > 0) {
      const atualNova = (await linhasDoCodigo(db, id, sku)).find((l) => l.variacao === nova)?.contado ?? 0;
      contagem = await registrarLeitura(db, id, {
        sku, leituraId: `${base}:definir`, gesto: 'definir', variacao: nova, quantidade: atualNova + quantidade - mover,
      });
    }
  }

  return json({
    ok: true, sku, desc: r.desc,
    criadas: r.criadas, variacoes: r.variacoes,
    linhas: await linhasDoCodigo(db, id, sku),
    contagemRegistrada: !!contagem,
    estoqueAlterado: false,
  }, 201);
}

/** "+ Adicionar variação" em PEÇAS — o mesmo núcleo, sem inventário. */
export async function adicionarVariacaoDaPeca(db, sku, corpo = {}) {
  const r = await adicionarVariacao(db, sku, { valor: corpo.valor, atributo: corpo.atributo });
  if (r.erro) {
    const { status, ...resto } = r;
    return json(resto, status || 409);
  }
  return json(r, 201);
}

/** Volta uma linha para "não contado" — que NÃO é zero (D2). Existe porque
 *  desfazer um engano tem de ter um caminho diferente de "conferi e não
 *  tem nenhuma": os dois são resultados diferentes da contagem. */
export async function descontarItem(db, id, sku, variacao) {
  const { erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;
  const alvo = normSku(sku);
  const r = await db.prepare(
    `DELETE FROM inventario_contagem
      WHERE inventario_id = ? AND sku = ? AND variacao = ?`)
    .bind(id, alvo, String(variacao ?? '').trim()).run();
  const removidas = Number(r?.meta?.changes ?? r?.meta?.rows_written ?? 0);
  return json({
    ok: true, sku: alvo, variacao: String(variacao ?? '').trim() || null,
    estado: 'nao_contado', removidas,
    cobertura: await cobertura(db, id),
  });
}

/** D5 — "não sei qual variação é" é resposta de primeira classe, não
 *  caminho de erro. A quantidade fica registrada, aparece no relatório e
 *  BLOQUEIA a aplicação daquele SKU inteiro, dizendo por quê. Ela nunca
 *  vira movimento: é exatamente a regra 2 do CLAUDE.md — não sabe qual aro
 *  saiu, não escreve. */
export async function registrarNaoIdentificado(db, id, corpo = {}) {
  const { erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;

  const sku = normSku(corpo.sku);
  if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);
  const qtd = Number(corpo.qtd);
  if (!Number.isInteger(qtd) || qtd < 0) {
    return json({ erro: 'A quantidade tem que ser um inteiro maior ou igual a zero.' }, 400);
  }

  const p = await db.prepare(`SELECT sku, desc FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo.`, sku, desconhecido: true }, 409);

  const cadastradas = await variacoesDoSku(db, sku);
  if (!cadastradas.length) {
    /* Sem variação cadastrada não existe "qual delas": a contagem normal já
       diz tudo o que há para dizer, e aceitar isto aqui criaria um bloqueio
       sem nada para resolver. */
    return json({
      erro: `${p.desc} não tem variação cadastrada — conte pelo código mesmo.`, sku,
    }, 409);
  }

  /* Zero apaga: é como ela desfaz um "não sei" depois de descobrir qual era. */
  if (qtd === 0) {
    await db.prepare(`DELETE FROM inventario_nao_identificado WHERE inventario_id = ? AND sku = ?`)
      .bind(id, sku).run();
    return json({ ok: true, sku, qtd: 0, bloqueia: false });
  }

  await db.prepare(
    `INSERT INTO inventario_nao_identificado (inventario_id, sku, qtd) VALUES (?, ?, ?)
     ON CONFLICT (inventario_id, sku) DO UPDATE
        SET qtd = excluded.qtd, contado_em = datetime('now')`,
  ).bind(id, sku, qtd).run();

  return json({
    ok: true, sku, desc: p.desc, qtd,
    bloqueia: true,
    aviso: `${qtd} ${qtd === 1 ? 'peça contada' : 'peças contadas'} de ${p.desc} sem dizer qual variação. `
      + 'Nenhuma diferença deste código será corrigida enquanto isso não for resolvido.',
  });
}

/** Quantos códigos do catálogo já receberam alguma contagem. É por aqui que
 *  a tela abre o relatório: "você conferiu 214 de 790 códigos". */
async function cobertura(db, id) {
  const [conferidos, total] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT sku) AS n FROM inventario_contagem WHERE inventario_id = ?`)
      .bind(id).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM produtos p WHERE ${SQL_CONTAVEL}`).first(),
  ]);
  return { conferidos: Number(conferidos?.n || 0), total: Number(total?.n || 0) };
}

/* ═════════════════════════════════════════════ contagem em lote (dashboard legado) */

/** Rota preservada para o dashboard legado, que bipa por CÓDIGO e não sabe
 *  de variação. Substitui a contagem inteira em vez de somar: reenviar o
 *  mesmo lote duas vezes (rede ruim, botão clicado de novo) não dobra nada.
 *
 *  Um SKU com variação cadastrada entra aqui como contagem AGREGADA, na
 *  linha `variacao = ''`. Ela é gravada — a Sthefany contou, e a contagem
 *  dela é um fato — mas o fechamento a marca `nao_comparavel` (D4/D11) e
 *  nenhuma diferença dela vira movimento. É a diferença entre registrar o
 *  que ela viu e inventar de qual aro a peça saiu.
 *
 *  Códigos ausentes do corpo voltam a "não contado" (D2), e não a zero: é
 *  esta linha que impede um inventário parado pela metade de listar meio
 *  catálogo como faltante. */
export async function salvarContagem(db, id, { contados, desconhecidos }) {
  const { erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;

  const contaveis = new Set((await db.prepare(
    `SELECT sku FROM (${SQL_ESPERADO})`).all()).results.map((p) => p.sku));
  const catalogo = new Set((await db.prepare(`SELECT sku FROM produtos`).all()).results.map((p) => p.sku));

  const stmts = [db.prepare(`DELETE FROM inventario_contagem WHERE inventario_id = ?`).bind(id)];
  const fora = new Set(desconhecidos || []);
  let codigos = 0;

  for (const [bruto, qtd] of Object.entries(contados || {})) {
    const sku = normSku(bruto);
    if (!(qtd > 0)) continue;
    // um código que não está no catálogo não pode entrar na razão de
    // estoque — vai para a lista de avisos, que a tela mostra à parte
    if (!catalogo.has(sku)) { fora.add(bruto); continue; }
    // kit e configuração montável não se contam: quem tem saldo são as
    // peças que os compõem. Bipar um deles é aviso, não contagem.
    if (!contaveis.has(sku)) { fora.add(bruto); continue; }
    stmts.push(db.prepare(
      `INSERT INTO inventario_contagem (inventario_id, sku, variacao, contado, origem)
       VALUES (?, ?, '', ?, 'bipagem')`,
    ).bind(id, sku, qtd));
    codigos += 1;
  }
  stmts.push(db.prepare(`UPDATE inventarios SET desconhecidos_json = ? WHERE id = ?`)
    .bind(JSON.stringify([...fora]), id));

  await db.batch(stmts);
  return json({ ok: true, codigos });
}

/* ══════════════════════════════════════════════════════ fechamento (D3, D10, D11) */

/** A comparação de um inventário, linha a linha, com a retroação já feita.
 *  Devolve linhas puras — quem chama decide se congela (concluir) ou só
 *  mostra (resultado). */
async function comparar(db, id, { completa = false } = {}) {
  const produtos = (await db.prepare(SQL_ESPERADO).all()).results;
  const contagens = (await db.prepare(
    `SELECT sku, variacao, variante_id, contado, contado_em
       FROM inventario_contagem WHERE inventario_id = ?`).bind(id).all()).results ?? [];
  const naoIdentificados = new Map(((await db.prepare(
    `SELECT sku, qtd FROM inventario_nao_identificado WHERE inventario_id = ?`)
    .bind(id).all()).results ?? []).map((r) => [r.sku, Number(r.qtd)]));

  const porSku = new Map();
  for (const c of contagens) {
    if (!porSku.has(c.sku)) porSku.set(c.sku, []);
    porSku.get(c.sku).push(c);
  }

  const variacoes = await variacoesComSaldo(db);
  const consignadoVar = await consignadoPorVariacao(db);

  /* Movimentos posteriores a uma contagem, por SKU. Ler isto NÃO é
     adivinhar: eles estão registrados, com `criado_em`. É o que impede o
     desenho ingênuo de registrar sobra de 2 e devolver ao estoque duas
     peças que estão com a cliente (D10).

     Lidos UMA vez, desde a contagem mais antiga (08/10/2026). Antes era
     uma consulta por código conferido: com 821 códigos o balanço fazia 886
     consultas numa requisição só, e o plano Free do Workers recusa a
     invocação que passa de 50 — o Balanço e o Finalizar do inventário #1
     não conseguiam terminar em produção. O filtro é o mesmo do SQL, feito
     em memória (`criado_em` é texto ISO; a comparação de texto é a mesma). */
  const desdeMin = contagens.map((c) => c.contado_em).filter(Boolean).sort()[0] ?? null;
  const posteriores = new Map();
  if (desdeMin) {
    const { results: movs } = await db.prepare(
      `SELECT m.sku, m.variacao, m.variante_id, m.qtd, m.criado_em, m.tipo, m.origem, m.obs,
              v.data AS venda_data,
              (SELECT s.data FROM saidas_sem_faturamento s
                WHERE s.movimento_id = m.id LIMIT 1) AS saida_data
         FROM movimentos m
         LEFT JOIN vendas v ON v.id = m.venda_id
        WHERE m.criado_em > ?`).bind(desdeMin).all();
    for (const m of movs ?? []) {
      if (!posteriores.has(m.sku)) posteriores.set(m.sku, []);
      posteriores.get(m.sku).push(m);
    }
  }
  /* §60 — O QUE CONTA COMO "DEPOIS DA CONTAGEM" (08/10/2026).
   *
   *  A retroação existe para o fato FÍSICO posterior: contou na segunda,
   *  vendeu na quarta. Dois tipos de movimento registrado depois da
   *  contagem não são isso, e somá-los fazia o fechamento baixar a mesma
   *  peça DUAS vezes (inventário #1: 15 códigos, 27 peças):
   *
   *   · Ajustar estoque (§54) feito depois de contar. É a pessoa dizendo o
   *     total certo — mais nova que a contagem, então vale ela; a linha não
   *     gera diferença nenhuma (`ajustadoDepois`). Ex.: contou 4, o sistema
   *     dizia 10, ela ajustou 10 → 4; o fechamento aplicava −6 de novo.
   *   · Venda ou saída sem faturamento LANÇADA depois, mas com a data do
   *     fato anterior ao dia da contagem (brinde de 27/09 lançado em 07/10).
   *     A peça já estava fora quando ela contou. No mesmo dia da contagem
   *     não dá para saber a ordem: segue a regra de sempre (é posterior). */
  const ajusteManual = (m) => m.tipo === 'ajuste' && m.origem === 'ajuste';
  const fatoAntesDaContagem = (m, desde) => {
    const fato = m.venda_data || m.saida_data;
    const dia = diaOperacional(desde);
    return Boolean(fato && dia && String(fato).slice(0, 10) < dia);
  };
  const lancadosDepois = (sku, depoisDe) => (posteriores.get(sku) ?? [])
    .filter((m) => depoisDe != null && m.criado_em > depoisDe);
  const movimentosDe = (sku, depoisDe, ateInclusive = null) => lancadosDepois(sku, depoisDe)
    .filter((m) => (ateInclusive == null || m.criado_em <= ateInclusive)
      && !ajusteManual(m) && !fatoAntesDaContagem(m, depoisDe));
  const ajustesDepois = (sku, desde) => lancadosDepois(sku, desde).filter(ajusteManual);
  const avisoRetroativo = (sku, desde) => {
    const n = lancadosDepois(sku, desde).filter((m) => !ajusteManual(m) && fatoAntesDaContagem(m, desde)).length;
    if (!n) return null;
    return n === 1
      ? 'uma saída lançada depois tem data anterior à contagem — já estava fora quando você contou'
      : `${n} saídas lançadas depois têm data anterior à contagem — já estavam fora quando você contou`;
  };
  const juntarAvisos = (...xs) => (xs.filter(Boolean).join(' · ') || null);
  /* A linha cujo estoque foi ajustado à mão depois da contagem: o ajuste
     é a palavra mais nova, então a diferença é zero e o motivo é dito. */
  const linhaAjustadaDepois = (base, contado, ajustes) => {
    const ultimo = ajustes[ajustes.length - 1];
    const oQue = String(ultimo.obs || 'Ajuste de estoque').replace(/^Ajuste de estoque · /, '');
    return {
      ...base, variacao: '', varianteId: null, contado, esperado: contado, deltaPos: 0, dif: 0,
      situacao: 'conferido', motivo: null, ajustadoDepois: true,
      aviso: `Estoque ajustado depois da contagem (${oQue}). Vale o ajuste; o inventário não mexe de novo.`,
    };
  };
  const deltaSku = (sku, desde) => movimentosDe(sku, desde)
    .reduce((s, m) => s + Number(m.qtd || 0), 0);
  const deltaVariacao = (sku, v, desde) => movimentosDe(sku, desde)
    .filter((m) => (m.variante_id != null && v.varianteId != null
        && String(m.variante_id) === String(v.varianteId))
      || (m.variante_id == null && m.variacao === v.nome))
    .reduce((s, m) => s + Number(m.qtd || 0), 0);
  const avisoDelta = (d) => {
    if (!d) return null;
    const n = Math.abs(d);
    return d < 0
      ? `mexeu depois que você contou: ${n} ${n === 1 ? 'saída' : 'saídas'}`
      : `mexeu depois que você contou: ${n} ${n === 1 ? 'entrada' : 'entradas'}`;
  };

  const linhas = [];
  for (const p of produtos) {
    const contadas = porSku.get(p.sku) || [];
    const cadastradas = variacoes.get(p.sku) || [];
    const naoIdent = naoIdentificados.get(p.sku) || 0;
    const base = { sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco };

    /* ── SKU sem variação cadastrada: o caso da imensa maioria. */
    if (!cadastradas.length) {
      const c = contadas.find((x) => (x.variacao || '') === '');
      // nem tinha nem apareceu: fora do relatório, como sempre foi
      if (!c && !p.esperado) continue;
      if (!c) {
        /* `conferivel` — esta falta tem endereço. O código não tem variação
           cadastrada, então "não estava em casa" é uma frase completa, e a
           declaração de contagem completa pode transformá-la em diferença. */
        linhas.push({ ...base, variacao: '', varianteId: null, contado: null,
          esperado: p.esperado, deltaPos: 0, dif: null, situacao: 'nao_conferido',
          motivo: null, conferivel: true });
        continue;
      }
      const ajustes = ajustesDepois(p.sku, c.contado_em);
      if (ajustes.length) {
        linhas.push(linhaAjustadaDepois(base, c.contado, ajustes));
        continue;
      }
      const deltaPos = await deltaSku(p.sku, c.contado_em);
      const esperado = p.esperado - deltaPos;
      const dif = c.contado - esperado;
      linhas.push({ ...base, variacao: '', varianteId: null, contado: c.contado,
        esperado, deltaPos, dif,
        situacao: dif === 0 ? 'conferido' : (dif < 0 ? 'faltando' : 'sobrando'),
        motivo: null, aviso: juntarAvisos(avisoDelta(deltaPos), avisoRetroativo(p.sku, c.contado_em)) });
      continue;
    }

    /* ── SKU COM variação cadastrada (refeito em 06/10/2026).
     *
     *  A DIFERENÇA É DO CÓDIGO, como na planilha da Sthefany: código,
     *  estoque, revendedora, físico, falta. "Esperado em casa 7, conferido
     *  6" é uma falta de 1 mesmo que ninguém saiba de qual aro — e antes
     *  disso o código inteiro virava "não comparável" e ela não tinha o que
     *  fazer com ele.
     *
     *  O que a regra 2 continua proibindo é ESCREVER a falta num aro que
     *  ninguém disse. Por isso a linha leva o `modo`, que decide em qual
     *  variação cada peça da diferença entra na razão:
     *
     *    codigo       a razão do código não separa por variação (todo o
     *                 saldo está "sem variação" — os anéis do go-live). A
     *                 diferença entra no código inteiro, sem variação. É o
     *                 mesmo critério do Ajustar estoque (§54);
     *    porVariacao  a razão separa, e ela contou cada peça de casa numa
     *                 variação. A diferença de cada variação é a dela — nada
     *                 é deduzido. As partes ficam congeladas no fechamento;
     *    escolher     a razão separa, mas há peça contada sem variação. A
     *                 diferença existe e aparece; aplicá-la pede que ela
     *                 diga de qual variação é. Sem isso, fica pendente.
     *
     *  As peças com revendedora sem variação identificada continuam em "não
     *  informada" — nunca são atribuídas a um aro. */
    const razaoPorVariacao = cadastradas.some((v) => v.saldo !== 0);
    const saldoIdentificado = cadastradas.reduce((s, v) => s + v.saldo, 0);
    const consignadas = consignadoVar.get(p.sku) || new Map();
    const naMaleta = (v) => consignadaDe(consignadas, v);
    const consignadoIdentificado = cadastradas.reduce((s, v) => s + naMaleta(v), 0);
    const saldoSem = p.qtd - saldoIdentificado;
    const consignadoSem = p.consignado - consignadoIdentificado;
    const contadoDe = new Map(contadas.map((c) => [c.variacao || '', Number(c.contado)]));
    const naoInformadas = (contadoDe.get('') ?? 0) + naoIdent;
    const detalhe = {
      razaoPorVariacao,
      variacoes: cadastradas.map((v) => ({
        nome: v.nome, varianteId: v.varianteId,
        cadastro: v.saldo, comRevendedoras: naMaleta(v),
        esperado: razaoPorVariacao ? v.saldo - naMaleta(v) : null,
        contado: contadoDe.has(v.nome) ? contadoDe.get(v.nome) : null,
      })),
      naoInformada: {
        cadastro: saldoSem, comRevendedoras: consignadoSem,
        esperado: razaoPorVariacao ? saldoSem - consignadoSem : p.esperado,
        contado: contadoDe.has('') || naoIdent ? naoInformadas : null,
      },
    };

    if (!contadas.length && !naoIdent) {
      if (p.esperado) {
        linhas.push({ ...base, variacao: '', varianteId: null, contado: null,
          esperado: p.esperado, deltaPos: 0, dif: null, situacao: 'nao_conferido',
          motivo: null, conferivel: true, ...detalhe });
      }
      continue;
    }

    /* A retroação é contada a partir do ÚLTIMO toque no código: é aí que a
       contagem dela ficou completa. Entrada ou saída ENTRE o primeiro e o
       último toque é ambígua (a peça vendida já tinha sido contada?), e a
       linha diz isso em vez de decidir. */
    const momentos = contadas.map((x) => x.contado_em).filter(Boolean).sort();
    const desde = momentos[momentos.length - 1] ?? null;
    const primeiro = momentos[0] ?? null;
    const deltaPos = desde ? await deltaSku(p.sku, desde) : 0;
    const durante = primeiro && desde && primeiro < desde
      ? movimentosDe(p.sku, primeiro, desde).length
      : 0;
    const total = contadas.reduce((s, x) => s + Number(x.contado), 0) + naoIdent;
    const ajustes = desde ? ajustesDepois(p.sku, desde) : [];
    if (ajustes.length) {
      linhas.push({ ...linhaAjustadaDepois(base, total, ajustes),
        modo: 'codigo', partes: null, variacoesDivergem: false, distribuicaoContada: null,
        conferivel: true, ...detalhe });
      continue;
    }
    const esperado = p.esperado - deltaPos;
    const dif = total - esperado;
    const situacao = dif === 0 ? 'conferido' : (dif < 0 ? 'faltando' : 'sobrando');

    let modo;
    let partes = null;
    let variacoesDivergem = false;
    if (!razaoPorVariacao) {
      modo = 'codigo';
      if (dif) partes = [{ variacao: null, varianteId: null, qtd: dif }];
    } else if (!naoInformadas && !durante) {
      modo = 'porVariacao';
      const baldes = [];
      let somaDeltas = 0;
      for (const v of cadastradas) {
        const dv = desde ? await deltaVariacao(p.sku, v, desde) : 0;
        somaDeltas += dv;
        const d = (contadoDe.get(v.nome) ?? 0) - (v.saldo - naMaleta(v) - dv);
        if (d) baldes.push({ variacao: v.nome, varianteId: v.varianteId, qtd: d });
      }
      const d0 = -(saldoSem - consignadoSem - (deltaPos - somaDeltas));
      if (d0) baldes.push({ variacao: null, varianteId: null, qtd: d0 });
      variacoesDivergem = baldes.length > 0;
      if (dif) partes = baldes;
    } else {
      modo = 'escolher';
    }

    /* As variações que ela CONTOU, prontas para virar o cadastro do código
       (`guardarVariacoesContadas`): o que está em casa de cada variação mais
       o que a maleta já tem identificado dela. O resto fica "não informada".
       Só quando isso não apaga informação: razão sem variação, ou toda peça
       de casa contada numa variação. */
    const contouVariacao = cadastradas.some((v) => (contadoDe.get(v.nome) ?? 0) > 0);
    const distribuicaoContada = contouVariacao && (modo === 'codigo' || modo === 'porVariacao')
      ? cadastradas.map((v) => ({ nome: v.nome, varianteId: v.varianteId,
        qtd: (contadoDe.get(v.nome) ?? 0) + naMaleta(v) }))
      : null;

    linhas.push({ ...base, variacao: '', varianteId: null, contado: total,
      esperado, deltaPos, dif, situacao, motivo: null,
      aviso: durante
        ? 'Esta peça teve entrada ou saída enquanto era conferida — confira antes de ajustar.'
        : juntarAvisos(avisoDelta(deltaPos), avisoRetroativo(p.sku, desde)),
      modo, partes, variacoesDivergem, distribuicaoContada, conferivel: true, ...detalhe });
  }
  return completa ? declararContagemCompleta(linhas) : linhas;
}

/** A DECLARAÇÃO aplicada ao retrato, e só a ele.
 *
 *  Nada aqui escreve estoque. O que muda é o significado de uma linha: um
 *  código que ninguém bipou deixa de ser incógnita e passa a ser uma falta
 *  de `esperado` peças — a mesma falta que a tela vai pedir para resolver,
 *  uma a uma, com motivo.
 *
 *  Num código com variação a falta declarada também tem endereço: se a
 *  razão separa por variação, cada variação perde o que se esperava dela em
 *  casa (ela disse que não há NENHUMA); se não separa, a falta é do código.
 *  `esperado <= 0` não vira nada — seria fabricar divergência de zero. */
function declararContagemCompleta(linhas) {
  return linhas.map((l) => {
    if (l.situacao !== 'nao_conferido') return l;
    if (!l.conferivel) return { ...l, motivo: DECLARADA_SEM_IDENTIDADE };
    if (!(l.esperado > 0)) return l;
    let modo = l.modo;
    let partes = null;
    if (l.variacoes) {
      if (!l.razaoPorVariacao) {
        modo = 'codigo';
        partes = [{ variacao: null, varianteId: null, qtd: -l.esperado }];
      } else {
        modo = 'porVariacao';
        partes = [
          ...l.variacoes.filter((v) => v.esperado).map((v) => ({
            variacao: v.nome, varianteId: v.varianteId, qtd: -v.esperado })),
          ...(l.naoInformada?.esperado ? [{ variacao: null, varianteId: null, qtd: -l.naoInformada.esperado }] : []),
        ];
      }
    }
    return {
      ...l,
      contado: 0,
      dif: -l.esperado,
      situacao: 'faltando',
      declarado: true,
      motivo: DECLARADA_FALTA,
      ...(l.variacoes ? { modo, partes } : {}),
    };
  });
}

/** As cinco listas do §7.3. `faltando` e `sobrando` mantêm exatamente o
 *  formato antigo — inclusive `sugestao` —, porque é o que a tela legada
 *  lê. As três listas novas são campos novos: quem não as conhece as
 *  ignora, e nada quebra. */
function relatorio(id, linhas, desconhecidos, cob, concluidoEm, extra = {}) {
  const faltando = [], sobrando = [], naoConferido = [], naoComparavel = [];
  const conferidos = [];
  let conferido = 0;

  for (const l of linhas) {
    if (l.situacao === 'conferido') {
      conferido += 1;
      /* A lista de quem BATEU. Ela não existia, e por isso "642 códigos OK"
         era um número sem nada atrás: quem quisesse conferir o que bateu não
         tinha onde olhar. Ela não pede decisão nenhuma — a tela a mantém
         fechada —, mas existir é a diferença entre um resumo e uma
         afirmação que ninguém pode checar. */
      conferidos.push({ sku: l.sku, desc: l.desc, cat: l.cat,
        variacao: l.variacao || null, contado: l.contado, esperado: l.esperado,
        aviso: l.aviso ?? null, ...extrasDeVariacao(l) });
      continue;
    }
    if (l.situacao === 'nao_conferido') {
      naoConferido.push({ sku: l.sku, desc: l.desc, cat: l.cat,
        variacao: l.variacao || null, esperado: l.esperado, ...extrasDeVariacao(l),
        /* Preenchido só quando a contagem foi declarada completa e ESTE
           código ficou de fora mesmo assim. Sem o motivo, a linha pareceria
           esquecimento do sistema em vez de recusa dele. */
        motivo: l.motivo ?? null });
      continue;
    }
    if (l.situacao === 'nao_comparavel') {
      naoComparavel.push({ sku: l.sku, desc: l.desc, cat: l.cat,
        variacao: l.naoIdentificado ? null : (l.variacao || null),
        naoIdentificado: !!l.naoIdentificado,
        contado: l.contado, motivo: l.motivo });
      continue;
    }
    const linha = {
      sku: l.sku, desc: l.desc, cat: l.cat, preco: l.preco,
      variacao: l.variacao || null, varianteId: l.varianteId,
      contado: l.contado, esperado: l.esperado, dif: l.dif, sugestao: l.dif,
      deltaPos: l.deltaPos, aviso: l.aviso ?? null,
      valor: (l.preco || 0) * Math.abs(l.dif),
      aplicado: !!l.aplicado,
      /* `declarado` — esta falta NÃO foi bipada como zero: ela nasceu da
         declaração de que a conferência terminou. Os dois casos têm o mesmo
         `contado: 0` e significam gestos diferentes, e a tela precisa poder
         dizer qual foi. */
      declarado: !!l.declarado,
      motivo: l.motivo ?? null,
      ...extrasDeVariacao(l),
    };
    (l.dif < 0 ? faltando : sobrando).push(linha);
  }

  const ordena = (a, b) => b.valor - a.valor || String(a.desc).localeCompare(String(b.desc), 'pt');
  const ordenaSimples = (a, b) => String(a.desc).localeCompare(String(b.desc), 'pt');
  const rel = {
    ok: true, id,
    concluidoEm,
    cobertura: cob,
    conferido,
    /* `conferidos` no nome antigo continua significando o que significava
       para a tela legada: quantas linhas bateram exatamente. Mudar o
       significado dele quebraria o dashboard clássico em silêncio. */
    conferidos: conferido,
    /* A LISTA, em campo novo. Quem não a conhece a ignora. */
    conferidosItens: conferidos.sort(ordenaSimples),
    pecasContadas: linhas.reduce((s, l) => s + (l.contado || 0), 0),
    faltando: faltando.sort(ordena),
    sobrando: sobrando.sort(ordena),
    naoConferido: naoConferido.sort(ordenaSimples),
    naoComparavel: naoComparavel.sort(ordenaSimples),
    desconhecidos,
    /* A declaração, dita em voz alta no relatório: é ela que explica por que
       um código que ninguém bipou está na lista de faltantes. */
    contagemCompleta: !!extra.contagemCompleta,
    /* A lista de motivos vive num lugar só, e o servidor a manda junto: sem
       isso a tela inventaria a sua, e "quantas peças eu perdi por saída sem
       lançamento" voltaria a depender da grafia de quem digitou. */
    motivos: MOTIVOS_DE_DIFERENCA,
  };
  rel.conciliacao = contarConciliacao(rel);
  return rel;
}

/** O que uma linha de código COM variação leva para a tela: o modo da
 *  diferença, as partes já sabidas, o detalhe por variação e a distribuição
 *  contada. Linha de código sem variação não leva nada disso. */
function extrasDeVariacao(l) {
  if (!l.variacoes && !l.modo) return {};
  return {
    modo: l.modo ?? null,
    partes: l.partes ?? null,
    precisaVariacao: l.modo === 'escolher' && !!l.dif,
    razaoPorVariacao: !!l.razaoPorVariacao,
    variacoes: l.variacoes ?? [],
    naoInformada: l.naoInformada ?? null,
    variacoesDivergem: !!l.variacoesDivergem,
    distribuicaoContada: l.distribuicaoContada ?? null,
  };
}

/** ONDE ESTÁ A CONCILIAÇÃO — derivada, nunca guardada.
 *
 *  Não existe coluna `conciliado`, e não precisa existir: "resolvida" já é
 *  um fato do banco (`inventario_resultado.aplicado_em`, com o estorno
 *  devolvendo a linha para pendente pelo índice único). Uma segunda
 *  contabilidade de estado só teria como divergir da primeira.
 *
 *  `bloqueadas` fica FORA de `pendentes` de propósito: uma linha não
 *  comparável não está esperando uma decisão sobre estoque — está esperando
 *  alguém dizer de qual variação ela é. Somá-la às pendências faria o
 *  inventário parecer inacabável por um motivo que não é o dela. */
function contarConciliacao(rel) {
  const divergencias = rel.faltando.length + rel.sobrando.length;
  const resolvidas = [...rel.faltando, ...rel.sobrando].filter((l) => l.aplicado).length;
  const pendentes = divergencias - resolvidas;
  return {
    divergencias,
    resolvidas,
    pendentes,
    bloqueadas: rel.naoComparavel.length,
    naoConferidos: rel.naoConferido.length,
    /* "Posso concluir este inventário agora?" — a pergunta 6 da revisão,
       respondida com um booleano em vez de uma conta que a tela refaria. */
    conciliado: pendentes === 0,
  };
}

/** Fecha a contagem e CONGELA o resultado.
 *
 *  O esperado é congelado aqui, do mesmo jeito que a maleta congela o
 *  preço do envio (§6.1): sem isso, abrir um inventário de três meses
 *  atrás mostraria a diferença contra o estoque de hoje, e um inventário
 *  que muda de resultado depois de fechado não prova nada. A partir da
 *  4.4 o congelamento é por VARIAÇÃO, e é dele que a aplicação lê a
 *  quantidade — nunca do cliente. */
export async function concluirInventario(db, id, corpo = {}) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') return json({ erro: 'Este inventário já foi fechado' }, 409);

  /* `=== true` e não um valor verdadeiro qualquer: esta é a chave que
     transforma "ninguém olhou" em "não estava lá", e o dashboard legado
     fecha inventário mandando corpo NENHUM. O padrão tem de ser o
     comportamento de sempre, e só um `true` literal muda de caminho. */
  const contagemCompleta = corpo?.contagemCompleta === true;

  const linhas = await comparar(db, id, { completa: contagemCompleta });
  const cob = await cobertura(db, id);

  const stmts = [db.prepare(`DELETE FROM inventario_resultado WHERE inventario_id = ?`).bind(id)];
  for (const l of linhas) {
    /* `efemera` é a linha do "não sei qual variação": ela não tem variação
       para servir de chave, e a fonte dela (`inventario_nao_identificado`)
       já é permanente. Congelá-la aqui inventaria uma variação. */
    if (l.efemera) continue;
    /* O modo e as partes congelam junto: é deles que a aplicação lê em qual
       variação cada peça da diferença entra (código com variação). */
    const partesJson = l.modo ? JSON.stringify({ modo: l.modo, partes: l.partes ?? null }) : null;
    stmts.push(db.prepare(
      `INSERT INTO inventario_resultado
         (inventario_id, sku, variacao, variante_id, contado, esperado, delta_pos, dif, situacao, motivo, partes_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, l.sku, l.variacao || '', l.varianteId ?? null,
      l.contado, l.esperado, l.deltaPos, l.dif, l.situacao, l.motivo ?? null, partesJson));
  }
  stmts.push(db.prepare(
    `UPDATE inventarios SET status = 'concluido', pausado_em = NULL, concluido_em = datetime('now'),
            contagem_completa = ?
      WHERE id = ?`).bind(contagemCompleta ? 1 : 0, id));
  await db.batch(stmts);

  const rel = relatorio(id, linhas, JSON.parse(inv.desconhecidos_json || '[]'), cob,
    hojeOperacional(), { contagemCompleta });
  return json({ ...rel, numero: numeroDe(inv) });
}

/** O retrato congelado, relido. É o que a tela abre depois de fechar a aba
 *  do relatório, e é a mesma fonte que a aplicação usa. */
export async function resultadoInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'concluido') {
    return json({ erro: 'Este inventário ainda não foi concluído', status: statusVisivel(inv) }, 409);
  }

  const { results } = await db.prepare(
    `SELECT r.*, p.desc, p.cat, p.preco,
            s.estornada AS saida_estornada,
            s.motivo AS saida_motivo
       FROM inventario_resultado r
       JOIN produtos p ON p.sku = r.sku
       LEFT JOIN saidas_sem_faturamento s ON s.id = r.saida_id
      WHERE r.inventario_id = ?`).bind(id).all();

  /* QUEM FOI BIPADO. A contagem nunca é apagada no fechamento — ela é o
     rastro de quem contou o quê e quando —, e é ela que separa os dois
     zeros: `contado = 0` com linha de contagem é "conferi, não tem nenhuma";
     `contado = 0` SEM linha de contagem é a declaração de que a conferência
     terminou. Mesmo número, gestos diferentes, e o retrato tem de saber
     dizer qual foi mesmo três meses depois. */
  const contagens = ((await db.prepare(
    `SELECT sku, variacao, contado FROM inventario_contagem WHERE inventario_id = ?`)
    .bind(id).all()).results) ?? [];
  const bipadas = new Set(contagens.map((c) => CHAVE(c.sku, c.variacao)));

  /* Código com variação (06/10/2026): o modo e as partes congelados, e o
     que ela contou em cada variação — para a revisão dizer "nº21 2 · nº23 2
     · não informada 1" e oferecer guardar isso no cadastro. */
  const detalheDeVariacao = async (r) => {
    if (!r.partes_json) return {};
    let pj = {};
    try { pj = JSON.parse(r.partes_json) || {}; } catch { pj = {}; }
    const doSku = contagens.filter((c) => c.sku === r.sku);
    const cadastradas = await variacoesDoSku(db, r.sku);
    const contadoDe = new Map(doSku.map((c) => [c.variacao || '', Number(c.contado)]));
    const contouVariacao = cadastradas.some((v) => (contadoDe.get(v.nome) ?? 0) > 0);
    return {
      modo: pj.modo ?? null,
      partes: pj.partes ?? null,
      variacoes: cadastradas.map((v) => ({
        nome: v.nome, varianteId: v.varianteId, esperado: null,
        contado: contadoDe.has(v.nome) ? contadoDe.get(v.nome) : null,
      })),
      naoInformada: { esperado: null, contado: contadoDe.has('') ? contadoDe.get('') : null },
      razaoPorVariacao: pj.modo !== 'codigo',
      distribuicaoContada: contouVariacao && (pj.modo === 'codigo' || pj.modo === 'porVariacao')
        ? cadastradas.map((v) => ({ nome: v.nome, varianteId: v.varianteId, qtd: contadoDe.get(v.nome) ?? 0 }))
        : null,
    };
  };

  const ajustes = await ajustesDoInventario(db, id);
  const extras = new Map();
  for (const r of results ?? []) {
    if (r.partes_json) extras.set(CHAVE(r.sku, r.variacao), await detalheDeVariacao(r));
  }
  const linhas = (results ?? []).map((r) => ({
    ...(extras.get(CHAVE(r.sku, r.variacao)) ?? {}),
    sku: r.sku, desc: r.desc, cat: r.cat, preco: r.preco,
    variacao: r.variacao,
    naoIdentificado: false,
    declarado: r.situacao === 'faltando' && r.contado === 0
      && !bipadas.has(CHAVE(r.sku, r.variacao)),
    varianteId: r.variante_id, contado: r.contado, esperado: r.esperado,
    deltaPos: r.delta_pos, dif: r.dif, situacao: r.situacao, motivo: r.motivo,
    aviso: r.delta_pos
      ? `mexeu depois que você contou: ${Math.abs(r.delta_pos)} `
        + `${Math.abs(r.delta_pos) === 1 ? (r.delta_pos < 0 ? 'saída' : 'entrada') : (r.delta_pos < 0 ? 'saídas' : 'entradas')}`
      : null,
    aplicadoEm: r.aplicado_em, saidaId: r.saida_id,
    /* O rótulo curto com que ELA explicou a diferença, relido da saída
       (perda) ou do ajuste de inventário (§55). */
    motivoAplicado: r.saida_id
      ? (r.saida_estornada ? null : (r.saida_motivo ?? null))
      : (ajustes.get(CHAVE(r.sku, r.variacao))?.motivo ?? null),
    classeAplicada: r.saida_id ? 'perda' : (ajustes.has(CHAVE(r.sku, r.variacao)) ? 'ajuste' : null),
    /* Estornada volta a ser aplicável: o índice único libera o relançamento
       depois do estorno (D12), e a tela precisa dizer isso. */
    aplicado: !!r.aplicado_em && !r.saida_estornada,
  }));

  /* As peças do antigo "não sei qual variação" (`inventario_nao_identificado`)
     já estão somadas na linha do código desde 06/10/2026 — a diferença é do
     código, e aplicá-la pede que ela diga a variação (modo `escolher`). */
  const rel = relatorio(id, linhas.map((l) => ({ ...l, deltaPos: l.deltaPos })),
    JSON.parse(inv.desconhecidos_json || '[]'),
    /* A contagem não é apagada no fechamento: ela é o rastro de quem contou o
       quê e quando. A cobertura relida vem dela, e não das linhas do retrato,
       porque um código conferido e sem diferença não gera linha de retrato e
       sumiria da conta. */
    await cobertura(db, id),
    diaOperacional(inv.concluido_em) ?? '',
    { contagemCompleta: !!inv.contagem_completa });

  /* O relatório recém-montado não sabe o que já foi aplicado; o retrato
     sabe. Marcar aqui evita duplicar a regra dentro de `relatorio`. */
  const aplicados = new Map(linhas.map((l) => [CHAVE(l.sku, l.variacao), l]));
  for (const lista of [rel.faltando, rel.sobrando]) {
    for (const linha of lista) {
      const fonte = aplicados.get(CHAVE(linha.sku, linha.variacao || ''));
      linha.aplicado = !!(fonte && fonte.aplicado);
      linha.saidaId = fonte ? fonte.saidaId : null;
      /* O motivo COM QUE a diferença foi resolvida, relido da saída que a
         aplicou. Sem isto a revisão não teria como responder "quais
         diferenças eu já resolvi, e por quê" depois de fechar a aba — e um
         motivo que só existe até o recarregar não é auditoria, é enfeite. */
      linha.motivoAplicado = fonte ? (fonte.motivoAplicado ?? null) : null;
      linha.classeAplicada = fonte && fonte.aplicado ? (fonte.classeAplicada ?? null) : null;
    }
  }
  /* Recontado DEPOIS da marcação: antes dela `aplicado` é sempre falso, e a
     conciliação diria que nada foi resolvido em todo inventário já corrigido. */
  rel.conciliacao = contarConciliacao(rel);
  rel.numero = numeroDe(inv);
  return json(rel);
}

/* ═══════════════════════════════════════════════ aplicar a diferença (D6–D9, D12) */

const rotuloVariacao = (v) => (v ? ` (${v})` : '');

/** Aplica a diferença de itens NOMEADOS, um movimento por linha.
 *
 *  Três coisas que este caminho garante, e que o `/ajustar` antigo não
 *  garantia:
 *
 *   · a quantidade vem do retrato CONGELADO, nunca do cliente — ela já foi
 *     decidida no fechamento, e aceitar um número novo aqui seria deixar a
 *     tela reabrir a comparação (§8);
 *   · a diferença vira `saidas_sem_faturamento` com `inventario_id`,
 *     variação, movimento amarrado e estorno possível (D6, D7, D8);
 *   · aplicar duas vezes é recusado pelo ÍNDICE do banco, não por um flag
 *     lido e escrito no mesmo batch — vale sob crash-e-retry e sob duas
 *     abas abertas.
 *
 *  Nada é escrito antes de todos os itens passarem na validação: um lote
 *  com um item inválido não aplica metade e reclama depois. */
async function aplicarDiferenca(db, id, pedidos, { exigirMotivo = false } = {}) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'concluido') {
    return json({ erro: 'Só dá para corrigir depois de concluir a contagem' }, 409);
  }
  if (!pedidos.length) return json({ erro: 'Nenhum item informado' }, 400);

  const { results } = await db.prepare(
    `SELECT r.*, s.estornada AS saida_estornada
       FROM inventario_resultado r
       LEFT JOIN saidas_sem_faturamento s ON s.id = r.saida_id
      WHERE r.inventario_id = ?`).bind(id).all();
  const porChave = new Map((results ?? []).map((r) => [CHAVE(r.sku, r.variacao), r]));
  const porSku = new Map();
  for (const r of results ?? []) {
    if (!porSku.has(r.sku)) porSku.set(r.sku, []);
    porSku.get(r.sku).push(r);
  }

  /* ── validação, inteira, antes de qualquer escrita. */
  const alvos = [];
  const vistos = new Set();
  for (let pedido of pedidos) {
    const sku = normSku(pedido.sku);
    if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);
    const temVariacao = pedido.variacao != null && String(pedido.variacao).trim() !== '';
    let linha;
    if (temVariacao) {
      /* Desde 06/10/2026 o retrato de um código com variação é UMA linha,
         a do código: a variação pedida cai nela (e, se a diferença pedir,
         vira o destino que ela escolheu). */
      linha = porChave.get(CHAVE(sku, String(pedido.variacao).trim())) ?? porChave.get(CHAVE(sku, ''));
      if (linha && !linha.variacao && pedido.destino == null) pedido = { ...pedido, destino: String(pedido.variacao).trim() };
    } else {
      const doSku = (porSku.get(sku) || []).filter((r) => r.dif != null && r.dif !== 0);
      /* Regra 2 do CLAUDE.md: duas variações do mesmo código com diferença
         e nenhuma dita é exatamente "não sei qual aro saiu". Recusa. */
      if (doSku.length > 1) {
        return json({
          erro: `${sku} tem diferença em mais de uma variação. Diga qual você está corrigindo.`,
          sku,
          variacoes: doSku.map((r) => ({ variacao: r.variacao, dif: r.dif })),
        }, 409);
      }
      linha = doSku[0] ?? porChave.get(CHAVE(sku, ''));
    }

    if (!linha) return json({ erro: `${sku} não faz parte deste inventário`, sku }, 400);
    const chave = CHAVE(linha.sku, linha.variacao);
    if (vistos.has(chave)) {
      return json({ erro: `${sku}${rotuloVariacao(linha.variacao)} veio duas vezes no mesmo lote`, sku }, 400);
    }
    vistos.add(chave);

    /* D3 — não conferido nunca entra em correção. É a trava que impede um
       inventário parado pela metade de zerar meio catálogo. */
    if (linha.situacao === 'nao_conferido') {
      return json({
        erro: `${sku}${rotuloVariacao(linha.variacao)} não foi conferido neste inventário. `
          + 'Não contado não é zero, e não vira diferença.', sku,
      }, 409);
    }
    if (linha.situacao === 'nao_comparavel') {
      return json({
        erro: `${sku}${rotuloVariacao(linha.variacao)} não é comparável: ${linha.motivo}`,
        sku, motivo: linha.motivo,
      }, 409);
    }
    if (linha.dif == null || linha.dif === 0) {
      return json({ erro: `${sku}${rotuloVariacao(linha.variacao)} não tem diferença para corrigir`, sku }, 409);
    }
    if (linha.aplicado_em && !linha.saida_estornada) {
      return json({
        erro: `${sku}${rotuloVariacao(linha.variacao)} já foi corrigido neste inventário`,
        sku, saidaId: linha.saida_id,
      }, 409);
    }

    /* O MOTIVO, quando quem chama sabe dizê-lo.
     *
     *  `exigirMotivo` separa as duas portas. `/aplicar` é a rota nova e tem
     *  um único consumidor — a revisão da V2 —, e lá o motivo é obrigatório:
     *  uma peça que sumiu sem ninguém dizer o que aconteceu vira uma baixa
     *  de estoque que ninguém consegue explicar seis meses depois, que é o
     *  mesmo defeito que §27 e §30 já fecharam para desconto e para saída.
     *
     *  `/ajustar` é a rota PRESERVADA do dashboard clássico, que manda
     *  `{sku, qtd}` e não tem campo de motivo. Exigir ali quebraria a tela
     *  em produção para cobrar uma informação que ela não tem como coletar —
     *  então lá o motivo continua sendo o rótulo genérico de sempre. */
    const motivo = String(pedido.motivo ?? '').trim();
    if (exigirMotivo && !motivo) {
      return json({
        erro: `Diga o que aconteceu com ${sku}${rotuloVariacao(linha.variacao)}. `
          + 'Diferença aplicada sem motivo não se audita depois.',
        sku, variacao: linha.variacao || null,
        motivos: MOTIVOS_DE_DIFERENCA,
      }, 409);
    }
    if (motivo.length > LIMITE_MOTIVO) {
      return json({
        erro: `O motivo de ${sku} é longo demais (máximo ${LIMITE_MOTIVO} caracteres). `
          + 'O texto comprido cabe na observação.',
        sku,
      }, 400);
    }
    const motivoId = String(pedido.motivoId ?? '').trim() || null;
    if (motivoId && !MOTIVOS_DE_DIFERENCA.some((m) => m.id === motivoId)) {
      return json({ erro: `Motivo desconhecido: ${motivoId}`, sku, motivos: MOTIVOS_DE_DIFERENCA }, 400);
    }
    const classe = classeDoMotivo(motivoId, motivo);
    if (classe === 'perda' && linha.dif > 0) {
      return json({
        erro: `${sku}${rotuloVariacao(linha.variacao)} está sobrando — sobra não é perda. Escolha outro motivo.`,
        sku,
      }, 409);
    }

    /* EM QUAL VARIAÇÃO a diferença entra na razão (06/10/2026). O retrato
       congelou o modo: `codigo` e `porVariacao` já trazem as partes; em
       `escolher`, quem diz é ela — `destino` é o nome da variação, ou ''
       para "não informada". Sem destino, a linha não é aplicada: a regra 2
       não deixa escrever a falta num aro que ninguém disse. */
    let congelado = null;
    try { congelado = linha.partes_json ? JSON.parse(linha.partes_json) : null; } catch { congelado = null; }
    let partes;
    if (congelado?.modo === 'escolher') {
      if (pedido.destino == null) {
        return json({
          erro: `${sku}: diga de qual variação é a diferença antes de ajustar.`,
          sku, precisaVariacao: true,
        }, 409);
      }
      const r = await destinoDaDiferenca(db, sku, String(pedido.destino).trim(), linha.dif);
      if (r.erro) return json({ erro: `${sku}: ${r.erro}`, sku, precisaVariacao: true }, 409);
      partes = [r.parte];
    } else if (Array.isArray(congelado?.partes) && congelado.partes.length) {
      partes = congelado.partes.map((pt) => ({
        variacao: pt.variacao || null, varianteId: pt.varianteId ?? null, qtd: Number(pt.qtd),
      }));
    } else {
      partes = [{ variacao: linha.variacao || null, varianteId: linha.variante_id ?? null, qtd: linha.dif }];
    }
    const somaDasPartes = partes.reduce((s, pt) => s + pt.qtd, 0);
    if (somaDasPartes !== linha.dif) {
      return json({ erro: `${sku}: a diferença não fecha entre as variações. Nada foi ajustado.`, sku }, 409);
    }
    if (classe === 'perda' && partes.length > 1) {
      return json({
        erro: `${sku}: a diferença está em mais de uma variação — registre como ajuste, não como perda.`, sku,
      }, 409);
    }
    alvos.push({
      linha,
      partes,
      motivo: motivo || null,
      classe,
      observacao: String(pedido.observacao ?? '').trim() || null,
    });
  }

  /* ── escrita, item a item. */
  const data = (diaOperacional(inv.concluido_em) ?? '').split('-').reverse().join('/');
  const numero = numeroDe(inv);
  const aplicados = [];
  for (const { linha, partes, motivo, classe, observacao } of alvos) {
    if (classe === 'ajuste') {
      const r = await aplicarComoAjuste(db, id, numero, data, linha, motivo, observacao, partes);
      if (!r.ok) {
        return json({
          erro: r.erro, sku: linha.sku, variacao: linha.variacao || null,
          aplicados, naoAplicados: alvos.length - aplicados.length,
        }, 409);
      }
      aplicados.push({
        sku: linha.sku, variacao: linha.variacao || null,
        qtd: linha.dif, saidaId: null, movimentoId: r.movimentoId,
        sentido: linha.dif < 0 ? 'saida' : 'entrada', motivo: r.motivo, classe: 'ajuste',
      });
      continue;
    }
    const r = await registrarSaida(db, {
      tipo: 'perda',
      sentido: linha.dif < 0 ? 'saida' : 'entrada',
      sku: linha.sku,
      variacao: partes[0].variacao || null,
      varianteId: partes[0].varianteId ?? null,
      qtd: Math.abs(linha.dif),
      /* O motivo QUE ELA ESCOLHEU vai para a coluna que o schema chama de
         "rótulo curto e agrupável", e de lá entra na razão dentro de
         `movimentos.obs` (`saidas.js › obsMov`). Sem motivo dito — o caminho
         do dashboard clássico — fica o rótulo genérico de sempre, que é o
         que aquela tela sempre gravou. */
      motivo: motivo ?? `Diferença de inventário #${numero}`,
      observacao: observacao
        ?? `Inventário #${numero}, de ${data}: contado ${linha.contado}, `
          + `sistema dizia ${linha.esperado}`,
      inventarioId: id,
    });
    if (!r.ok) {
      /* Anuncia em voz alta o que foi feito e o que não foi, em vez de
         devolver só o erro e deixar quem chamou supor (regra 9). */
      return json({
        erro: r.erro, sku: linha.sku, variacao: linha.variacao || null,
        aplicados, naoAplicados: alvos.length - aplicados.length,
      }, r.statusHttp ?? 409);
    }
    await db.prepare(
      `UPDATE inventario_resultado
          SET aplicado_em = datetime('now'), saida_id = ?
        WHERE inventario_id = ? AND sku = ? AND variacao = ?`)
      .bind(r.saida.id, id, linha.sku, linha.variacao).run();
    aplicados.push({
      sku: linha.sku, variacao: linha.variacao || null,
      qtd: linha.dif, saidaId: r.saida.id, movimentoId: r.saida.movimentoId,
      sentido: r.saida.sentido, motivo: r.saida.motivo, classe: 'perda',
    });
  }
  return json({ ok: true, aplicados });
}

/** §55 — a diferença como AJUSTE DE INVENTÁRIO. Um batch só: o registro em
 *  `inventario_ajustes` (cuja chave primária recusa a mesma linha duas
 *  vezes — duas abas, crash e retry), o movimento `ajuste` com origem
 *  `inventario`, e a marca de aplicado no retrato. Conflito na chave desfaz
 *  tudo.
 *
 *  `partes` (06/10/2026) é em qual variação cada peça da diferença entra:
 *  uma parte só no caso comum (código sem variação, ou código inteiro), uma
 *  por variação quando ela contou por variação. A soma das partes é a
 *  diferença congelada — `aplicarDiferenca` recusa antes se não for. */
async function aplicarComoAjuste(db, id, numero, data, linha, motivo, observacao, partes) {
  /* Sem motivo (o `/ajustar` do painel clássico) a razão diz só o fato; o
     registro em `inventario_ajustes` guarda o rótulo genérico de sempre. */
  const rotulo = motivo ?? `Diferença de inventário #${numero}`;
  const obs = `Ajuste de inventário #${numero}${motivo ? ` · ${motivo}` : ''} · contado ${linha.contado}, `
    + `sistema dizia ${linha.esperado}${data ? ` (${data})` : ''}`
    + (observacao ? ` · ${observacao}` : '');
  /* O id do movimento vem do próprio lote (`last_row_id` do último INSERT
     em `movimentos`), não de uma consulta depois dele (08/10/2026, §60):
     a tela aplica TODAS as diferenças numa requisição, e duas chamadas ao
     D1 por item passavam do teto de 50 do plano Free a partir de 25
     diferenças — o Finalizar parava no meio. */
  const lote = [
    db.prepare(
      `INSERT INTO inventario_ajustes (inventario_id, sku, variacao, qtd, motivo, observacao)
       VALUES (?, ?, ?, ?, ?, ?)`).bind(id, linha.sku, linha.variacao || '', linha.dif, rotulo, observacao),
  ];
  let posMovimento = -1;
  for (const parte of partes) {
    const stmts = movimentar(db, {
      sku: linha.sku, tipo: 'ajuste', quantidade: parte.qtd, origem: 'inventario', obs,
      variacao: parte.variacao || null, varianteId: parte.varianteId ?? null,
    });
    posMovimento = lote.length; // o INSERT em `movimentos` é o primeiro de `movimentar`
    lote.push(...stmts);
  }
  lote.push(db.prepare(
    /* `saida_id = NULL`: se a linha já foi resolvida como perda e a
       saída foi estornada, o vínculo antigo sairia lendo "estornada"
       por cima deste ajuste. */
    `UPDATE inventario_resultado SET aplicado_em = datetime('now'), saida_id = NULL
      WHERE inventario_id = ? AND sku = ? AND variacao = ?`).bind(id, linha.sku, linha.variacao));
  let resultados;
  try {
    resultados = await db.batch(lote);
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/UNIQUE constraint|PRIMARY KEY/i.test(msg)) {
      return { ok: false, erro: `${linha.sku}${rotuloVariacao(linha.variacao)} já foi corrigido neste inventário` };
    }
    throw e;
  }
  const doLote = posMovimento >= 0 ? Number(resultados?.[posMovimento]?.meta?.last_row_id) : NaN;
  if (Number.isInteger(doLote) && doLote > 0) return { ok: true, movimentoId: doLote, motivo: rotulo };
  const mov = await db.prepare(
    `SELECT id FROM movimentos WHERE sku = ? AND obs = ? ORDER BY id DESC LIMIT 1`).bind(linha.sku, obs).first();
  return { ok: true, movimentoId: mov ? mov.id : null, motivo: rotulo };
}

/** Os baldes de UM código na razão: cada variação cadastrada e o "sem
 *  variação", com o saldo e o que as maletas abertas têm identificado de
 *  cada um. É a mesma leitura de `variacoesComSaldo`, recortada. */
async function baldesDoCodigo(db, sku) {
  const p = await db.prepare(
    `SELECT p.qtd,
            COALESCE((SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
                        JOIN maletas m ON m.id = mi.maleta_id
                       WHERE mi.sku = p.sku AND m.status IN ('aberta', 'em_acerto')), 0) AS consignado
       FROM produtos p WHERE p.sku = ?`).bind(sku).first();
  if (!p) return null;
  const { results } = await db.prepare(
    `SELECT pv.nome, pv.variante_id,
            COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo
                       WHERE mo.sku = pv.sku
                         AND (mo.variante_id = pv.variante_id
                              OR (mo.variante_id IS NULL AND mo.variacao = pv.nome))), 0) AS saldo
       FROM produto_variacoes pv WHERE pv.sku = ? ORDER BY pv.ordem, pv.nome`).bind(sku).all();
  const consignadas = (await consignadoPorVariacao(db)).get(sku) || new Map();
  const variacoes = (results ?? []).map((r) => {
    const v = { nome: r.nome, varianteId: r.variante_id == null ? null : String(r.variante_id), saldo: Number(r.saldo || 0) };
    return { ...v, naMaleta: consignadaDe(consignadas, v) };
  });
  const saldoIdent = variacoes.reduce((s, v) => s + v.saldo, 0);
  const malIdent = variacoes.reduce((s, v) => s + v.naMaleta, 0);
  return {
    qtd: Number(p.qtd || 0),
    consignado: Number(p.consignado || 0),
    variacoes,
    semVariacao: { saldo: Number(p.qtd || 0) - saldoIdent, naMaleta: Number(p.consignado || 0) - malIdent },
  };
}

/** A variação que ELA disse para uma diferença do modo `escolher`. Recusa o
 *  que deixaria o balde abaixo do que as maletas têm dele — a peça que está
 *  com a revendedora existe, e não pode sair do estoque por um ajuste de
 *  casa. */
async function destinoDaDiferenca(db, sku, destino, dif) {
  const b = await baldesDoCodigo(db, sku);
  if (!b) return { erro: 'peça não encontrada.' };
  let balde;
  let parte;
  if (!destino) {
    balde = b.semVariacao;
    parte = { variacao: null, varianteId: null, qtd: dif };
  } else {
    const v = b.variacoes.find((x) => x.nome === destino)
      ?? b.variacoes.find((x) => chaveDaVariacao(x.nome) === chaveDaVariacao(destino));
    if (!v) return { erro: `"${destino}" não é uma variação desta peça.` };
    balde = v;
    parte = { variacao: v.nome, varianteId: v.varianteId, qtd: dif };
  }
  if (balde.saldo + dif < Math.max(0, balde.naMaleta)) {
    const nome = destino || 'variação não informada';
    return { erro: `${nome} tem ${balde.saldo - Math.max(0, balde.naMaleta)} em casa — não dá para tirar ${Math.abs(dif)} dela.` };
  }
  return { parte };
}

/** GUARDAR AS VARIAÇÕES CONTADAS no cadastro do código (06/10/2026).
 *
 *  É como o inventário ensina ao sistema quais aros existem de verdade: o
 *  que ela contou em casa de cada variação, mais o que a maleta tem
 *  identificado dela, vira a distribuição da razão. O resto — inclusive a
 *  peça com revendedora sem variação conhecida — fica em "não informada".
 *  Não muda o total: é repartição (`variantes.js › distribuirVariantes`,
 *  modo parcial), dois movimentos que se anulam por variação.
 *
 *  Recusa, sem escrever, quando guardar apagaria informação ou partiria de
 *  número velho: peça contada sem variação num código que já separa por
 *  variação; entrada ou saída depois da contagem; soma acima do total
 *  (a sobra precisa ser ajustada antes). */
export async function guardarVariacoesContadas(db, id, corpo = {}) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status === 'cancelado') return json({ erro: 'Este inventário foi descartado.' }, 409);
  const sku = normSku(corpo.sku);
  if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);

  const linhas = await linhasDoCodigo(db, id, sku);
  const b = await baldesDoCodigo(db, sku);
  if (!b || !b.variacoes.length) return json({ erro: 'Esta peça não tem variação cadastrada.', sku }, 409);
  const contadoDe = new Map(linhas.map((l) => [l.variacao, l.contado]));
  const naoInformadas = contadoDe.get('') ?? 0;
  const razaoPorVariacao = b.variacoes.some((v) => v.saldo !== 0);
  if (!b.variacoes.some((v) => (contadoDe.get(v.nome) ?? 0) > 0)) {
    return json({ erro: 'Nenhuma variação desta peça foi contada.', sku }, 409);
  }
  if (razaoPorVariacao && naoInformadas > 0) {
    return json({
      erro: `${naoInformadas} ${naoInformadas === 1 ? 'peça foi contada' : 'peças foram contadas'} sem variação. `
        + 'Diga a variação delas antes de guardar — senão o cadastro perderia o que já sabia.', sku,
    }, 409);
  }
  const desde = linhas.map((l) => l.contadoEm).filter(Boolean).sort().pop();
  if (desde) {
    const depois = Number((await db.prepare(
      `SELECT COUNT(*) AS n FROM movimentos
        WHERE sku = ? AND criado_em > ? AND COALESCE(origem, '') NOT IN ('inventario', 'variacao')`)
      .bind(sku, desde).first())?.n ?? 0);
    if (depois) {
      return json({
        erro: 'Esta peça teve entrada ou saída depois da contagem. Confira as variações na ficha da peça.', sku,
      }, 409);
    }
  }
  if (b.variacoes.some((v) => !v.varianteId)) {
    return json({ erro: 'Uma das variações desta peça está incompleta no cadastro. Abra a ficha da peça.', sku }, 409);
  }
  const distribuicao = b.variacoes.map((v) => ({
    varianteId: v.varianteId, qtd: (contadoDe.get(v.nome) ?? 0) + Math.max(0, v.naMaleta),
  }));
  const soma = distribuicao.reduce((s, d) => s + d.qtd, 0);
  if (soma > b.qtd) {
    return json({
      erro: `Foram contadas ${soma} com variação e o código tem ${b.qtd}. Ajuste a sobra deste código antes.`, sku,
    }, 409);
  }
  const r = await distribuirVariantes(db, sku, {
    distribuicao, parcial: true, obs: `Inventário #${numeroDe(inv)}: variações contadas`,
  });
  if (r.erro) {
    const { status, ...resto } = r;
    return json(resto, status || 409);
  }
  return json({ ...r, sku, guardadas: distribuicao.length });
}

/** O BALANÇO — o resultado AO VIVO, antes de finalizar (06/10/2026).
 *
 *  É a mesma comparação do fechamento, sem congelar nada e sem escrever
 *  nada: a Sthefany vê o que vai acontecer ("3 peças terão o estoque
 *  reduzido, 2 aumentado, 17 não conferidas") antes de qualquer ajuste.
 *  Não conferido continua não conferido — não vira falta sozinho. */
export async function balancoInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') return json({ erro: 'Este inventário já foi fechado' }, 409);
  const linhas = await comparar(db, id);
  const rel = relatorio(id, linhas, JSON.parse(inv.desconhecidos_json || '[]'), await cobertura(db, id),
    hojeOperacional());
  const esperados = (await db.prepare(SQL_ESPERADO).all()).results ?? [];
  const casa = esperados.filter((p) => Number(p.esperado) > 0);
  const soma = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  rel.numero = numeroDe(inv);
  rel.totais = {
    codigosEsperados: casa.length,
    pecasEsperadas: soma(casa, (p) => Number(p.esperado)),
    codigosConferidos: rel.conferido + rel.faltando.length + rel.sobrando.length,
    pecasConferidas: rel.pecasContadas,
    naoConferidos: rel.naoConferido.length,
    pecasNaoConferidas: soma(rel.naoConferido, (l) => Math.max(0, Number(l.esperado) || 0)),
  };
  rel.impacto = {
    reduzem: rel.faltando.length,
    pecasAMenos: soma(rel.faltando, (l) => Math.abs(l.dif)),
    aumentam: rel.sobrando.length,
    pecasAMais: soma(rel.sobrando, (l) => Math.abs(l.dif)),
    precisamVariacao: [...rel.faltando, ...rel.sobrando].filter((l) => l.precisaVariacao).length,
    naoConferidos: rel.naoConferido.length,
  };
  return json(rel);
}

/** Os ajustes de inventário (§55) de UM inventário, por linha. Banco sem a
 *  migration devolve vazio — a revisão continua abrindo, só sem o motivo
 *  de ajuste (que nesse banco nem pode existir). */
async function ajustesDoInventario(db, id) {
  try {
    const { results } = await db.prepare(
      `SELECT sku, variacao, qtd, motivo FROM inventario_ajustes WHERE inventario_id = ?`).bind(id).all();
    return new Map((results ?? []).map((a) => [CHAVE(a.sku, a.variacao), a]));
  } catch { return new Map(); }
}

/** Rota nova. A quantidade não vem no corpo — o servidor usa a `dif`
 *  congelada (§8 do desenho). */
export async function aplicarInventario(db, id, { itens } = {}) {
  const pedidos = (itens || []).filter((i) => i && i.sku);
  /* Rota nova, consumidor único (a revisão da V2): aqui o motivo é
     obrigatório. Ver o comentário em `aplicarDiferenca`. */
  return aplicarDiferenca(db, id, pedidos, { exigirMotivo: true });
}

/** Rota PRESERVADA para o dashboard legado, que manda `{sku, qtd}`.
 *
 *  `qtd` é deliberadamente ignorado: ele já foi decidido no fechamento, e
 *  o corpo do cliente pode estar velho. O que a tela legada manda é
 *  exatamente a `sugestao` que ela recebeu do `/concluir`, então ignorar
 *  não muda nada no caminho feliz — e no caminho infeliz impede aplicar um
 *  número que não é mais o do retrato.
 *
 *  As duas mudanças de comportamento declaradas na Fase 2: passa a recusar
 *  item não contado e item não comparável. */
export async function ajustarInventario(db, id, { itens } = {}) {
  const pedidos = (itens || []).filter((i) => i && i.sku);
  if (!pedidos.length) return json({ erro: 'Nenhum ajuste informado' }, 400);
  return aplicarDiferenca(db, id, pedidos);
}

/* ══════════════════════════════════════════════════════════════════ leitura */

export async function detalheInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);

  const contagem = ((await db.prepare(
    `SELECT c.sku, c.variacao, c.variante_id, c.contado, c.contado_em, c.origem,
            c.esperado_na_hora, c.faltando, p.desc, p.cat, p.preco
       FROM inventario_contagem c JOIN produtos p ON p.sku = c.sku
      WHERE c.inventario_id = ? ORDER BY p.desc, c.variacao`).bind(id).all()).results) ?? [];
  const naoIdentificado = ((await db.prepare(
    `SELECT n.sku, n.qtd, p.desc FROM inventario_nao_identificado n
       JOIN produtos p ON p.sku = n.sku WHERE n.inventario_id = ?`).bind(id).all()).results) ?? [];

  /* `itens` é a forma ANTIGA, por código, e é o que o dashboard legado lê
     para retomar uma contagem. Ela soma as variações do mesmo SKU: a tela
     legada bipa por código e não sabe separá-las. O detalhe por variação
     vive em `contagem`, campo novo. */
  const agregado = new Map();
  for (const c of contagem) {
    const atual = agregado.get(c.sku) || { sku: c.sku, desc: c.desc, cat: c.cat, preco: c.preco, contado: 0 };
    atual.contado += c.contado;
    agregado.set(c.sku, atual);
  }

  /* Inventário fechado ANTES da 4.4 não tem linha em `inventario_contagem`.
     Ele continua legível, na tabela histórica, e continua certo. */
  let itens = [...agregado.values()].map((i) => ({ ...i, esperado: null, dif: null, ajustado: false }));
  let historico = false;
  if (!itens.length) {
    const antigos = ((await db.prepare(
      `SELECT ii.*, p.desc, p.cat, p.preco FROM inventario_itens ii
         JOIN produtos p ON p.sku = ii.sku
        WHERE ii.inventario_id = ? ORDER BY p.desc`).bind(id).all()).results) ?? [];
    if (antigos.length) {
      historico = true;
      itens = antigos.map((i) => ({
        sku: i.sku, desc: i.desc, cat: i.cat, preco: i.preco,
        contado: i.contado, esperado: i.esperado,
        dif: i.esperado === null ? null : i.contado - i.esperado,
        ajustado: !!i.ajustado,
      }));
    }
  }

  /* `esperados` — O QUE SE ESPERA ENCONTRAR EM CASA, código a código, já
     com a regra do servidor aplicada: total menos o consignado, sem kit e
     sem configuração montável (ver SQL_ESPERADO).

     Existe porque a tela de contagem precisa comparar contra ALGUMA coisa
     enquanto o inventário está aberto, e `itens` só fala dos códigos já
     contados. Sem isto a tela tinha de refazer a conta por fora — e a
     versão dela usava `produtos.qtd`, o total, o que fazia peça em maleta
     aparecer como FALTANDO. A regra vive em um lugar só, e é este.

     Só quando o inventário está em andamento: fechado, quem manda é o
     retrato congelado em `inventario_resultado`, e mandar o esperado de
     HOJE junto com um retrato de ontem convidaria a comparar os dois. */
  const emAndamento = inv.status === 'aberto';
  /* COM QUEM ESTÁ O QUE NÃO ESTÁ EM CASA, por revendedora (02/10/2026). A
     Sthefany bipou um anel, viu "esperado em casa 3" e não sabia que as
     outras duas estavam com a Evelyn e com a Luciana. O número não muda —
     é a mesma soma de `SQL_ESPERADO` —, ele só passa a dizer o nome. */
  const comRevendedoras = new Map();
  const variacoesDoCodigo = new Map();
  if (emAndamento) {
    const { results: porRev } = await db.prepare(
      `SELECT mi.sku, r.nome, m.id AS maleta_id, SUM(mi.qtd - mi.devolvida) AS qtd
         FROM maleta_itens mi
         JOIN maletas m ON m.id = mi.maleta_id
         JOIN revendedoras r ON r.id = m.rev_id
        WHERE m.status IN ('aberta', 'em_acerto')
        GROUP BY mi.sku, m.id
       HAVING SUM(mi.qtd - mi.devolvida) > 0
        ORDER BY r.nome`).all();
    /* A variação da peça na maleta, quando alguém a disse (Pendências, ou
       "Identificar variação" no inventário). O que ninguém disse fica como
       "variação não informada" — 06/10/2026. */
    const varDaMaleta = new Map();
    try {
      const { results: mv } = await db.prepare(
        `SELECT mv.maleta_id, mv.sku, mv.variacao, SUM(mv.qtd) AS qtd FROM maleta_item_variacoes mv
           JOIN maletas m ON m.id = mv.maleta_id
          WHERE m.status IN ('aberta', 'em_acerto')
          GROUP BY mv.maleta_id, mv.sku, mv.variacao`).all();
      for (const x of mv ?? []) {
        const k = `${x.maleta_id}|${x.sku}`;
        if (!varDaMaleta.has(k)) varDaMaleta.set(k, []);
        varDaMaleta.get(k).push({ nome: x.variacao, qtd: Number(x.qtd) });
      }
    } catch { /* sem a tabela: nada identificado */ }
    for (const r of porRev ?? []) {
      if (!comRevendedoras.has(r.sku)) comRevendedoras.set(r.sku, []);
      comRevendedoras.get(r.sku).push({
        nome: r.nome, maletaId: r.maleta_id, qtd: Number(r.qtd),
        variacoes: varDaMaleta.get(`${r.maleta_id}|${r.sku}`) ?? [],
      });
    }
    /* As variações de cada código com o esperado EM CASA de cada uma —
       quando a razão do código tem identidade inteira. Sem ela o esperado
       da variação é `null`: o código continua conferível pelo total, e o
       servidor não reparte o total entre aros. */
    const saldos = await variacoesComSaldo(db);
    const consignadoVar = await consignadoPorVariacao(db);
    const totais = new Map(((await db.prepare(
      `SELECT sku, qtd FROM produtos WHERE sku IN (SELECT sku FROM produto_variacoes)`).all()).results ?? [])
      .map((r) => [r.sku, Number(r.qtd || 0)]));
    for (const [sku, vs] of saldos) {
      const consignadas = consignadoVar.get(sku) || new Map();
      const identificado = vs.reduce((s, v) => s + v.saldo, 0);
      const consignadoTotal = (comRevendedoras.get(sku) || []).reduce((s, r) => s + r.qtd, 0);
      const consignadoIdent = vs.reduce((s, v) => s + consignadaDe(consignadas, v), 0);
      const identidade = identificado === (totais.get(sku) ?? 0) && consignadoIdent === consignadoTotal;
      /* 06/10/2026 — a razão "separa por variação" quando alguma variação
         tem saldo. Aí o esperado em casa de cada uma é o saldo dela menos o
         que a maleta tem identificado dela, e o resto é "não informada".
         Quando não separa (os anéis do go-live), o esperado é só do código. */
      const separa = vs.some((v) => v.saldo !== 0);
      const semSaldo = (totais.get(sku) ?? 0) - identificado;
      const semMaleta = consignadoTotal - consignadoIdent;
      variacoesDoCodigo.set(sku, {
        identidade,
        separa,
        naoInformada: {
          cadastro: semSaldo, comRevendedoras: semMaleta,
          esperado: separa ? semSaldo - semMaleta : null,
        },
        lista: vs.map((v) => ({
          nome: v.nome, varianteId: v.varianteId,
          cadastro: v.saldo, comRevendedoras: consignadaDe(consignadas, v),
          esperado: separa ? v.saldo - consignadaDe(consignadas, v) : null,
        })),
      });
    }
  }
  const esperados = emAndamento
    ? ((await db.prepare(
        `${SQL_ESPERADO} ORDER BY p.desc`).all()).results ?? []).map((p) => ({
          sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco,
          /* Os três separados de propósito: `esperado` é o que se conta,
             e os outros dois explicam POR QUE ele não é o total. */
          total: p.qtd, consignado: p.consignado, esperado: p.esperado,
          revendedoras: comRevendedoras.get(p.sku) ?? [],
          ...(variacoesDoCodigo.has(p.sku) ? {
            variacoes: variacoesDoCodigo.get(p.sku).lista,
            variacaoComIdentidade: variacoesDoCodigo.get(p.sku).identidade,
            razaoPorVariacao: variacoesDoCodigo.get(p.sku).separa,
            naoInformada: variacoesDoCodigo.get(p.sku).naoInformada,
          } : {}),
        }))
    : [];
  const eventos = ((await db.prepare(
    `SELECT e.tipo, e.sku, e.variacao, e.detalhe, e.em, p.desc FROM inventario_eventos e
       JOIN produtos p ON p.sku = e.sku WHERE e.inventario_id = ? ORDER BY e.id`).bind(id).all()).results) ?? [];

  return json({
    id: inv.id,
    numero: numeroDe(inv),
    status: statusVisivel(inv),
    iniciadoEm: inv.iniciado_em, pausadoEm: inv.pausado_em ?? null, concluidoEm: inv.concluido_em,
    desconhecidos: JSON.parse(inv.desconhecidos_json || '[]'),
    historico,
    itens,
    esperados,
    contagem: contagem.map((c) => ({
      sku: c.sku, desc: c.desc, variacao: c.variacao || null, varianteId: c.variante_id,
      contado: c.contado, contadoEm: c.contado_em, origem: c.origem,
      esperadoNaHora: c.esperado_na_hora ?? null, faltando: c.faltando ?? null,
    })),
    eventos: eventos.map((e) => ({ tipo: e.tipo, sku: e.sku, desc: e.desc, variacao: e.variacao, em: e.em })),
    naoIdentificado: naoIdentificado.map((n) => ({ sku: n.sku, desc: n.desc, qtd: n.qtd })),
    cobertura: await cobertura(db, id),
  });
}

export async function listarInventarios(db, limite = 20) {
  const r = await db.prepare(
    `SELECT i.*,
            (SELECT COUNT(*) FROM inventario_resultado x
              WHERE x.inventario_id = i.id AND x.dif IS NOT NULL AND x.dif <> 0) AS divergentes_novo,
            (SELECT COUNT(*) FROM inventario_itens x
              WHERE x.inventario_id = i.id AND x.esperado IS NOT NULL AND x.contado <> x.esperado) AS divergentes_antigo,
            (SELECT COALESCE(SUM(contado), 0) FROM inventario_contagem x WHERE x.inventario_id = i.id) AS pecas_novo,
            (SELECT COALESCE(SUM(contado), 0) FROM inventario_itens x WHERE x.inventario_id = i.id) AS pecas_antigo,
            (SELECT COUNT(*) FROM inventario_resultado x
              WHERE x.inventario_id = i.id AND x.situacao = 'nao_comparavel') AS nao_comparaveis,
            (EXISTS (SELECT 1 FROM inventario_resultado x WHERE x.inventario_id = i.id AND x.aplicado_em IS NOT NULL)
              OR EXISTS (SELECT 1 FROM saidas_sem_faturamento x WHERE x.inventario_id = i.id)
              OR EXISTS (SELECT 1 FROM inventario_itens x WHERE x.inventario_id = i.id AND x.ajustado = 1)) AS alterou_estoque
       FROM inventarios i ORDER BY i.id DESC LIMIT ?`).bind(limite).all();
  return json(r.results.map((i) => ({
    id: i.id,
    numero: numeroDe(i),
    status: statusVisivel(i),
    iniciadoEm: i.iniciado_em, pausadoEm: i.pausado_em ?? null, concluidoEm: i.concluido_em,
    /* Inventário fechado antes da 4.4 só existe em `inventario_itens`; o de
       agora só existe nas tabelas novas. Cada linha lê a sua. */
    divergentes: i.pecas_novo || i.divergentes_novo ? i.divergentes_novo : i.divergentes_antigo,
    pecas: i.pecas_novo || i.pecas_antigo,
    naoComparaveis: i.nao_comparaveis,
    /* §53 — a tela só oferece "Excluir" quando o servidor também aceitaria. */
    alterouEstoque: !!i.alterou_estoque,
    excluivel: i.status !== 'aberto' && !i.alterou_estoque,
  })));
}

/** O que o dashboard precisa saber sem pedir a lista inteira: tem contagem
 *  aberta agora? está pausada? quando foi a última? já venceu o prazo? */
export async function resumoInventario(db, prazoDias) {
  const [aberto, ultimo] = await Promise.all([
    db.prepare(`SELECT * FROM inventarios WHERE ${EM_ANDAMENTO} ORDER BY id DESC LIMIT 1`).first(),
    db.prepare(`SELECT * FROM inventarios WHERE status = 'concluido' ORDER BY id DESC LIMIT 1`).first(),
  ]);

  let diasDesde = null;
  if (ultimo && ultimo.concluido_em) {
    const ms = Date.now() - Date.parse(ultimo.concluido_em.replace(' ', 'T') + 'Z');
    diasDesde = Math.max(0, Math.floor(ms / 86400000));
  }
  return {
    abertoId: aberto ? aberto.id : null,
    abertoNumero: aberto ? numeroDe(aberto) : null,
    abertoEm: aberto ? aberto.iniciado_em : null,
    pausadoEm: aberto ? (aberto.pausado_em ?? null) : null,
    ultimoId: ultimo ? ultimo.id : null,
    ultimoNumero: ultimo ? numeroDe(ultimo) : null,
    ultimoEm: ultimo ? diaOperacional(ultimo.concluido_em) : null,
    diasDesde,
    prazoDias,
    // nunca contou ainda também é "vencido": é o estado que mais precisa
    // aparecer, e não o que menos
    vencido: diasDesde === null || diasDesde >= prazoDias,
  };
}
