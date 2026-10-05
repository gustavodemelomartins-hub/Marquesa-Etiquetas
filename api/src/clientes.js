/** Clientes: identidade, busca, ficha e a decisão de vínculo que a
 *  importação histórica não toma sozinha.
 *
 *  Veio inteiro de dentro do despachante, sem mudança de comportamento. As
 *  duas primeiras funções são os corpos das rotas de busca e de cadastro,
 *  que viviam soltos na corrente de `if`; as outras três já eram funções e
 *  só mudaram de arquivo.
 *
 *  Nome não é identidade e homônimo não é fundido sozinho: quem decide isso
 *  é `decidirVinculoCliente`, com gente olhando. */
import { json } from './auth.js';
import { normalizarNomeCliente } from './vendas-historico-normalizar.js';
import { anexarAvatares } from './cliente-avatar.js';

// ------------------------------------------------------------ clientes
export async function buscarClientes(db, url, env = null) {
  const busca = (url.searchParams.get('busca') || '').trim();
  /* O teto era 100, e a lista da V2 parava na letra B dizendo "100
     clientes" quando havia 353. A lista inteira (sem busca) cabe com folga
     numa resposta; o teto continua existindo para uma chamada errada não
     pedir um milhão de linhas. */
  const limite = Math.min(+(url.searchParams.get('limite') || 25), 2000);
  /* Arquivada sai da lista padrão (e do seletor de cliente da venda). Quem
     quer vê-las pede `arquivadas=sim`; `todas` devolve as duas. */
  const arquivadas = url.searchParams.get('arquivadas') || 'nao';
  const filtro = arquivadas === 'sim' ? 'arquivada_em IS NOT NULL'
    : arquivadas === 'todas' ? '1 = 1' : 'arquivada_em IS NULL';
  let r;
  if (busca) {
    const norm = `%${normalizarNomeCliente(busca) ?? ''}%`;
    const cru = `%${busca.toLowerCase()}%`;
    const digitos = somenteDigitos(busca);
    r = await db.prepare(
      `SELECT * FROM clientes
        WHERE (nome_norm LIKE ?
           OR LOWER(nome) LIKE ?
           OR (? IS NOT NULL AND tel_norm LIKE ?))
          AND ${filtro}
        ORDER BY nome LIMIT ?`,
    ).bind(norm, cru, digitos, `%${digitos ?? ''}%`, limite).all();
  } else {
    r = await db.prepare(`SELECT * FROM clientes WHERE ${filtro} ORDER BY nome LIMIT ?`).bind(limite).all();
  }
  /* `cidade` viaja junto porque duas "Camila" só se distinguem por
     algum campo além do nome — e escolher a errada no balcão manda a
     venda para o histórico de outra pessoa. */
  const lista = r.results.map(c => ({
    id: c.id, clienteId: c.id, nome: c.nome, tel: c.tel || '', cidade: c.cidade || '',
    arquivada: !!c.arquivada_em,
  }));
  /* Foto da cliente: acréscimo opcional — sem a migration ou sem R2 a lista
     sai igual, só sem foto (ver anexarAvatares). */
  if (env) await anexarAvatares(db, env, lista);
  return json(lista);

}


export async function criarCliente(db, request) {
  const b = await request.json();
  const { nome, tel } = b;
  if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
  /* `nome_norm` é gravado na criação. Sem isto, todo cliente novo
   * nasce com a chave de busca vazia e só ganha uma quando alguém
   * abre o perfil dele — e até lá a importação histórica não o
   * reconhece, criando um segundo cadastro para a mesma pessoa. */
  const r = await db.prepare(
    `INSERT INTO clientes (nome, tel, nome_norm, tel_norm, email, email_norm,
                           instagram, cidade, cpf, cpf_norm, nascimento, obs)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
  ).bind(
    nome.trim(), tel || '',
    normalizarNomeCliente(nome),
    tel ? String(tel).replace(/\D/g, '') || null : null,
    b.email || null, b.email ? String(b.email).trim().toLowerCase() : null,
    b.instagram || null, b.cidade || null,
    b.cpf || null, somenteDigitos(b.cpf),
    b.nascimento || null, b.obs || null,
  ).first();
  return json({ id: r.id, nome: r.nome, tel: r.tel || '' }, 201);

}

/** Só os dígitos. Telefone e CPF são digitados de seis jeitos diferentes e
 *  buscar por eles não pode depender de quem pôs o ponto. Devolve NULL —
 *  nunca string vazia — quando não sobrou dígito nenhum: §24. */
export function somenteDigitos(v) {
  if (v === null || v === undefined) return null;
  const d = String(v).replace(/\D/g, '');
  return d || null;
}

/** Edição do cadastro de cliente (a área de CRM).
 *
 *  Só toca dados cadastrais: nada aqui altera venda, estoque ou histórico.
 *  `nome_norm` e os `*_norm` são recalculados junto, senão a busca passa a
 *  discordar do que está na tela. */
export async function atualizarCliente(db, id, corpo) {
  const atual = await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(id).first();
  if (!atual) return json({ erro: 'Cliente não encontrado' }, 404);

  const campos = ['nome', 'tel', 'email', 'instagram', 'cidade', 'cpf', 'nascimento', 'obs'];
  const novo = {};
  for (const c of campos) if (corpo[c] !== undefined) novo[c] = corpo[c] === '' ? null : corpo[c];

  if (novo.nome !== undefined && !String(novo.nome ?? '').trim()) {
    return json({ erro: 'Nome é obrigatório' }, 400);
  }
  if (!Object.keys(novo).length) return json({ erro: 'Nada para atualizar' }, 400);

  const nome = novo.nome ?? atual.nome;
  const tel = novo.tel !== undefined ? novo.tel : atual.tel;
  const email = novo.email !== undefined ? novo.email : atual.email;
  const cpf = novo.cpf !== undefined ? novo.cpf : atual.cpf;

  /* ─── o defeito que fazia "Editar dados" parecer não salvar
   *
   * O UPDATE sempre funcionou. O que se perdia era o HISTÓRICO.
   *
   * A ficha da cliente é montada por `cliente_nome_norm` — o nome
   * normalizado — porque a imensa maioria das linhas veio da planilha, e a
   * planilha só tem nome. Renomear "Senhora (não sei nome)" para "Cliente
   * sem nome" mudava `clientes.nome_norm` e deixava as compras dela
   * carimbadas com o norm ANTIGO. Efeito na tela: as compras sumiam, o
   * valor gasto zerava, o ticket médio zerava — e quem viu isso concluiu,
   * com razão, que a edição não tinha pegado.
   *
   * A correção é escrever a identidade REAL antes de mexer no nome: as
   * linhas que hoje casam pelo norm antigo passam a apontar para o
   * `cliente_id`. Depois disso o nome pode virar o que for, que o histórico
   * segue amarrado por id — que é o que §2 pede desde sempre: nome não é
   * identidade, id é.
   *
   * É uma escrita ADITIVA. Nenhuma linha é apagada, nenhum valor é
   * alterado, nenhum id muda: só se preenche um `cliente_id` que estava
   * nulo. Rodar de novo não faz nada — as linhas já apontam.
   */
  const normAntigo = atual.nome_norm ?? normalizarNomeCliente(atual.nome) ?? null;
  const normNovo = normalizarNomeCliente(nome);
  const renomeou = novo.nome !== undefined && normAntigo && normNovo !== normAntigo;

  /* A trava que impede o amarre de virar um chute.
   *
   * Se DUAS clientes têm o mesmo nome normalizado, as compras carimbadas
   * com aquele nome podem ser de qualquer uma das duas — e apontá-las para
   * a que está sendo editada seria escolher por conta própria de quem é o
   * dinheiro. §2: nome não é identidade. Nesse caso o amarre não acontece,
   * a edição do cadastro segue normalmente, e o sistema DIZ o que deixou de
   * fazer em vez de fazer errado em silêncio. */
  const homonimos = renomeou ? await db.prepare(
    'SELECT COUNT(*) AS n FROM clientes WHERE nome_norm = ? AND id <> ?',
  ).bind(normAntigo, id).first() : { n: 0 };
  const nomeEraAmbiguo = Number(homonimos?.n ?? 0) > 0;

  let historicoAmarrado = null;
  if (renomeou && !nomeEraAmbiguo) {
    const amarrar = [
      ['vendas', 'cliente_nome_norm'],
      ['vendas_historicas', 'cliente_nome_norm'],
      ['vendas_historico_itens', 'cliente_nome_norm'],
      ['historico_operacoes', 'cliente_nome_norm'],
      ['garantias', 'cliente_nome_norm'],
    ];
    historicoAmarrado = {};
    for (const [tabela, coluna] of amarrar) {
      try {
        const r = await db.prepare(
          `UPDATE ${tabela} SET cliente_id = ?
            WHERE cliente_id IS NULL AND ${coluna} = ?`,
        ).bind(id, normAntigo).run();
        historicoAmarrado[tabela] = r?.meta?.changes ?? 0;
      } catch {
        /* Tabela que ainda não existe neste banco (migration pendente) não
           pode impedir a edição de um cadastro. Ela simplesmente não tinha
           linha para amarrar. */
        historicoAmarrado[tabela] = null;
      }
    }
  }

  const sets = Object.keys(novo).map((c) => `${c} = ?`);
  const binds = Object.values(novo);
  sets.push('nome_norm = ?', 'tel_norm = ?', 'email_norm = ?', 'cpf_norm = ?',
            "atualizada_em = datetime('now')");
  binds.push(
    normNovo,
    tel ? String(tel).replace(/\D/g, '') || null : null,
    email ? String(email).trim().toLowerCase() : null,
    somenteDigitos(cpf),
  );
  binds.push(id);

  const r = await db.prepare(`UPDATE clientes SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
    .bind(...binds).first();
  return json({
    ok: true,
    cliente: r,
    /* A tela precisa saber o norm NOVO para reabrir a ficha certa: ela
       navega por `cli:<norm>`, e continuar com o antigo mostraria uma ficha
       vazia logo depois de uma edição bem-sucedida. */
    norm: r.nome_norm,
    normAnterior: normAntigo,
    renomeou,
    /* Quantas linhas passaram a apontar para o id. Zero é a resposta normal
       de quem só corrigiu um telefone, e também de quem renomeou uma cliente
       cujas compras já estavam amarradas por id — que é o caso de toda venda
       nascida no sistema. */
    historicoAmarrado,
    /* Quando havia outra cliente com o mesmo nome, o histórico solto NÃO foi
       amarrado — e isso é dito, não escondido. */
    nomeEraAmbiguo,
    aviso: nomeEraAmbiguo
      ? 'Havia outro cadastro com este mesmo nome. As compras registradas só pelo nome '
        + 'não foram amarradas a esta ficha: não dá para saber de qual das duas elas são. '
        + 'Use a revisão de vínculos de cliente para decidir.'
      : null,
  });
}

/** Decide um vínculo de cliente que a importação NÃO fez sozinha.
 *
 *  `vincular` funde o histórico daquele nome no cadastro escolhido;
 *  `separar` afirma que são pessoas diferentes e o nome segue por conta
 *  própria. Nenhuma das duas apaga linha de histórico. */
export async function decidirVinculoCliente(db, revisaoId, { decisao, clienteId = null }) {
  const rev = await db.prepare('SELECT * FROM clientes_vinculo_revisao WHERE id = ?')
    .bind(revisaoId).first();
  if (!rev) return json({ erro: 'Revisão não encontrada' }, 404);
  if (rev.status !== 'pendente') return json({ erro: 'Revisão já decidida' }, 409);

  if (decisao === 'separar') {
    await db.prepare(
      `UPDATE clientes_vinculo_revisao SET status = 'separado', decidido_em = datetime('now')
        WHERE id = ?`,
    ).bind(revisaoId).run();
    return json({ ok: true, decisao: 'separado' });
  }

  if (decisao !== 'vincular') return json({ erro: 'decisao deve ser vincular ou separar' }, 400);

  const alvo = clienteId ?? rev.candidato_id;
  if (!alvo) return json({ erro: 'Informe clienteId para vincular' }, 400);
  const existe = await db.prepare('SELECT id FROM clientes WHERE id = ?').bind(alvo).first();
  if (!existe) return json({ erro: 'Cliente de destino não encontrado' }, 404);

  const r = await db.prepare(
    `UPDATE vendas_historico_itens SET cliente_id = ? WHERE cliente_nome_norm = ?`,
  ).bind(alvo, rev.nome_norm).run();

  await db.prepare(
    `UPDATE clientes_vinculo_revisao SET status = 'vinculado', decidido_em = datetime('now')
      WHERE id = ?`,
  ).bind(revisaoId).run();

  return json({ ok: true, decisao: 'vinculado', clienteId: alvo, itensAtualizados: r.meta?.changes ?? null });
}

/* ------------------------------------------- arquivar, reativar, excluir
 *
 * §28: cadastro que alguma linha referencia não se apaga — arquiva. Só o
 * cadastro SEM dependência nenhuma é excluído de verdade, e a lista do que
 * conta como dependência mora aqui, num lugar só.
 *
 * O casamento por NOME também conta. Parte do histórico (planilha e venda
 * de balcão antiga) acha a cliente por `nome_norm`, sem `cliente_id`;
 * apagar o cadastro deixaria essas linhas sem dono sem que nenhuma chave
 * estrangeira reclamasse. Na dúvida, não exclui: arquivar resolve. */
const DEPENDENCIAS = [
  { chave: 'vendas', rotulo: 'vendas',
    sql: `SELECT COUNT(*) AS n FROM vendas
           WHERE cliente_id = ?1 OR (cliente_id IS NULL AND ?2 IS NOT NULL AND cliente_nome_norm = ?2)` },
  { chave: 'historico', rotulo: 'compras da planilha',
    sql: `SELECT COUNT(*) AS n FROM vendas_historico_itens
           WHERE cliente_id = ?1 OR (cliente_id IS NULL AND ?2 IS NOT NULL AND cliente_nome_norm = ?2)` },
  { chave: 'vendasHistoricas', rotulo: 'vendas da planilha',
    sql: 'SELECT COUNT(*) AS n FROM vendas_historicas WHERE cliente_id = ?1' },
  { chave: 'operacoes', rotulo: 'cobranças e correções',
    sql: 'SELECT COUNT(*) AS n FROM historico_operacoes WHERE cliente_id = ?1' },
  { chave: 'garantias', rotulo: 'garantias e trocas',
    sql: 'SELECT COUNT(*) AS n FROM garantias WHERE cliente_id = ?1' },
  { chave: 'credito', rotulo: 'movimentos de crédito',
    sql: 'SELECT COUNT(*) AS n FROM credito_movimentos WHERE cliente_id = ?1' },
  { chave: 'vinculos', rotulo: 'revisões de vínculo',
    sql: 'SELECT COUNT(*) AS n FROM clientes_vinculo_revisao WHERE candidato_id = ?1' },
];

export async function dependenciasCliente(db, id) {
  const c = await db.prepare('SELECT id, nome, nome_norm, arquivada_em FROM clientes WHERE id = ?').bind(id).first();
  if (!c) return { ok: false, statusHttp: 404, erro: 'Cliente não encontrada.' };
  const norm = c.nome_norm || normalizarNomeCliente(c.nome) || null;
  const itens = [];
  for (const d of DEPENDENCIAS) {
    const st = d.sql.includes('?2') ? db.prepare(d.sql).bind(id, norm) : db.prepare(d.sql).bind(id);
    const n = Number((await st.first())?.n ?? 0);
    if (n > 0) itens.push({ chave: d.chave, rotulo: d.rotulo, n });
  }
  return {
    ok: true, id: c.id, nome: c.nome, arquivada: !!c.arquivada_em,
    dependencias: itens, podeExcluir: itens.length === 0,
  };
}

export async function excluirCliente(db, id) {
  const dep = await dependenciasCliente(db, id);
  if (!dep.ok) return json({ erro: dep.erro }, dep.statusHttp);
  if (!dep.podeExcluir) {
    return json({
      erro: 'Esta cliente tem histórico e não pode ser excluída. Arquive o cadastro.',
      dependencias: dep.dependencias,
    }, 409);
  }
  await db.prepare('DELETE FROM clientes WHERE id = ?').bind(id).run();
  return json({ ok: true, excluida: { id: dep.id, nome: dep.nome } });
}

export async function arquivarCliente(db, id, corpo = {}) {
  const c = await db.prepare('SELECT id, arquivada_em FROM clientes WHERE id = ?').bind(id).first();
  if (!c) return json({ erro: 'Cliente não encontrada.' }, 404);
  if (c.arquivada_em) return json({ erro: 'Esta cliente já está arquivada.' }, 409);
  const motivo = String(corpo.motivo ?? '').trim().slice(0, 200) || null;
  await db.prepare(
    `UPDATE clientes SET arquivada_em = datetime('now'), arquivada_motivo = ?,
            atualizada_em = datetime('now') WHERE id = ?`,
  ).bind(motivo, id).run();
  return json({ ok: true, id, arquivada: true });
}

export async function reativarCliente(db, id) {
  const c = await db.prepare('SELECT id, arquivada_em FROM clientes WHERE id = ?').bind(id).first();
  if (!c) return json({ erro: 'Cliente não encontrada.' }, 404);
  if (!c.arquivada_em) return json({ erro: 'Esta cliente não está arquivada.' }, 409);
  await db.prepare(
    `UPDATE clientes SET arquivada_em = NULL, arquivada_motivo = NULL,
            atualizada_em = datetime('now') WHERE id = ?`,
  ).bind(id).run();
  return json({ ok: true, id, arquivada: false });
}
