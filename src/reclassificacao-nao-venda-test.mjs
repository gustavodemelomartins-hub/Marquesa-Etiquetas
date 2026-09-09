import assert from 'node:assert/strict';
import {
  PADROES_AUDITORIA,
  aplicarReclassificacao,
  desfazerReclassificacao,
  proporClassificacao,
} from '../api/src/auditoria-historico.js';
import { TIPOS_SAIDA } from '../api/src/saidas.js';

const linha = (observacao, nome = 'Inventário') => ({
  cliente_nome_original: nome,
  cliente_nome_norm: nome.toLowerCase(),
  observacao_original: observacao,
});

const duvida = proporClassificacao(linha('ACHO QUE FOI VENDIDO'), PADROES_AUDITORIA);
assert.equal(duvida.classe, 'perda');
assert.equal(duvida.confianca, 'baixa');
assert.match(duvida.motivo, /dúvida/i);
assert.ok(!TIPOS_SAIDA.has('acho_que_foi_vendido'));
assert.deepEqual([...TIPOS_SAIDA].sort(), ['brinde', 'perda', 'uso_proprio']);

const confirmada = proporClassificacao(linha('PERDIDO'), PADROES_AUDITORIA);
assert.equal(confirmada.classe, 'perda');
assert.equal(confirmada.confianca, 'alta');

const sorteio = proporClassificacao(
  linha('Sorteio em evento', 'Pessoa sem regra confirmada'),
  PADROES_AUDITORIA,
);
assert.equal(sorteio, null, 'Sorteio não pode ganhar classe por inferência');

function bancoFalso() {
  const estado = {
    linha: { id: 42, lote_id: 2, venda_historica_id: 7, valor_total: 0, qtd: 1 },
    reclassificacao: null,
  };

  return {
    estado,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...valores) {
          args = valores;
          return stmt;
        },
        async first() {
          if (sql.includes('SELECT h.* FROM vendas_historico_itens')) {
            return Number(args[0]) === estado.linha.id ? { ...estado.linha } : null;
          }
          if (sql.includes('SELECT id, status FROM historico_reclassificacao')) {
            return estado.reclassificacao
              ? { id: estado.reclassificacao.id, status: estado.reclassificacao.status }
              : null;
          }
          if (sql.includes('SELECT classe FROM vendas_historicas')) return { classe: 'ajuste' };
          if (sql.includes('DELETE FROM historico_reclassificacao')) {
            if (!estado.reclassificacao) return null;
            const removida = estado.reclassificacao;
            estado.reclassificacao = null;
            return removida;
          }
          throw new Error(`SQL inesperado em first(): ${sql}`);
        },
        async run() {
          if (!sql.includes('INSERT INTO historico_reclassificacao')) {
            throw new Error(`SQL inesperado em run(): ${sql}`);
          }
          estado.reclassificacao = {
            id: 1,
            historico_item_id: args[0],
            classe_nova: args[1],
            confianca: args[2],
            motivo: args[3],
            status: args[4],
            decidido_por: args[5],
          };
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

const db = bancoFalso();
const decisao = {
  historicoItemId: 42,
  classe: 'perda',
  // A decisão humana confirma a classe; não reescreve a baixa confiança da
  // proposta automática que motivou a revisão.
  confianca: 'baixa',
  motivo: 'Diferença negativa confirmada no inventário; observação original preservada.',
};

const primeira = await aplicarReclassificacao(db, { decisoes: [decisao], usuario: 'teste' });
assert.equal(primeira.ok, true);
assert.equal(primeira.aplicadas, 1);
assert.equal(primeira.impacto.estoqueAlterado, false);
assert.equal(primeira.impacto.valorRemovidoDoFaturamento, 0);
assert.equal(db.estado.reclassificacao.classe_nova, 'perda');
assert.equal(db.estado.reclassificacao.confianca, 'baixa');

const repetida = await aplicarReclassificacao(db, { decisoes: [decisao], usuario: 'teste' });
assert.equal(repetida.statusHttp, 207);
assert.match(repetida.problemas[0].erro, /já decidida/);

const rollback = await desfazerReclassificacao(db, 42);
assert.equal(rollback.ok, true);
assert.equal(rollback.estoqueAlterado, false);
assert.equal(db.estado.reclassificacao, null);

const depoisDoRollback = await aplicarReclassificacao(db, { decisoes: [decisao], usuario: 'teste' });
assert.equal(depoisDoRollback.ok, true);

console.log('Reclassificação não-venda: regra, idempotência e rollback OK');
