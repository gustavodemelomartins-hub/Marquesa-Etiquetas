/** Estado agregado do painel e os parâmetros que o operam.
 *
 *  `GET /api/state` é read model transversal, não domínio: ele lê de todo
 *  mundo e não escreve em ninguém. `PUT /api/config` é o oposto — escreve, e
 *  só nas chaves que a operação pode ajustar. */
import { json } from '../../auth.js';
import { montarState } from '../../state.js';

export const rotas = [
  {
    metodo: 'GET', caminho: '/api/state', auth: 'bearer',
    async handler({ db, env }) {
      return json(await montarState(db, env));
    },
  },
  {
    metodo: 'PUT', caminho: '/api/config', auth: 'bearer',
    async handler({ db, request }) {
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
         da sincronização (`syncUltimoPedido`), e deixar a tela escrever nele
         por engano faria o robô reler ou pular pedidos. Só os dois limites do
         freio são ajustáveis daqui. */
      for (const chave of ['prazoDias', 'prataPct', 'inventarioDias', 'faixas',
                           'syncLimiteMudancas', 'syncLimiteZerar',
                           /* Planejamento de maletas: quantas peças uma maleta
                              costuma levar e quanto tem de sobrar em casa. São
                              parâmetros do NEGÓCIO, não do robô — uma maleta de
                              60 peças e outra de 150 são operações diferentes, e
                              o número certo é o que a Sthefany usa. */
                           'maletaAlvoPecas', 'reservaMinima',
                           /* Corte do go-live: pedido da loja anterior a esta
                              data é história e não vira venda aqui. Não é
                              estado interno do robô — é uma decisão de quem
                              opera, tomada uma vez, e por isso entra por uma
                              rota autenticada e auditável em vez de SQL solto
                              na produção. Ver sync.js › corteDePedidos. */
                           'syncCorteEm']) {
        if (b[chave] !== undefined) {
          stmts.push(db.prepare(
            `INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`
          ).bind(chave, JSON.stringify(b[chave])));
        }
      }
      if (stmts.length) await db.batch(stmts);
      return json({ ok: true });
    },
  },
];
