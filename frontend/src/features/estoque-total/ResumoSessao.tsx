import { MetricCard } from '../../components/MetricCard';
import type { ModoPlanilha, ResumoEstoqueTotal, ResumoProdutosNovos } from './tipos';

interface Props {
  modo: ModoPlanilha;
  nomeArquivo: string;
  resumo: ResumoEstoqueTotal | ResumoProdutosNovos;
}

/** Os números vêm todos da API — nada aqui é inventado ou recontado no
 *  cliente (§6 do pedido). */
export function ResumoSessao({ modo, nomeArquivo, resumo }: Props) {
  if (modo === 'estoque-total') {
    const r = resumo as ResumoEstoqueTotal;
    return (
      <>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 'var(--r3)' }}>
          <strong>{nomeArquivo}</strong> · {r.linhasLidas}{' '}
          {r.linhasLidas === 1 ? 'produto analisado' : 'produtos analisados'}
        </p>

        <div className="grade" style={{ marginBottom: 'var(--r4)' }}>
          <MetricCard rotulo="Sem alteração" valor={r.semAlteracao} tom="positivo" />
          <MetricCard
            rotulo="Terão quantidade alterada"
            valor={r.seraoAlterados}
            tom={r.seraoAlterados ? 'atencao' : 'neutro'}
          />
          <MetricCard rotulo="Produtos novos na planilha" valor={r.novos} nota="Não cadastrados aqui" />
          <MetricCard
            rotulo="Precisam de revisão"
            valor={r.conflitos}
            tom={r.conflitos ? 'critico' : 'neutro'}
            nota={r.criticos ? `${r.criticos} não podem ser aplicados automaticamente` : undefined}
          />
        </div>

        {r.ausentesDaPlanilha.length > 0 && (
          <div className="aviso" data-tom="neutro" style={{ marginBottom: 'var(--r4)' }}>
            <b>
              {r.ausentesDaPlanilha.length}{' '}
              {r.ausentesDaPlanilha.length === 1
                ? 'produto do sistema não aparece nesta planilha'
                : 'produtos do sistema não aparecem nesta planilha'}
              .
            </b>
            <div className="corpo">Nenhuma alteração será feita nesses produtos.</div>
          </div>
        )}

        {r.novos > 0 && (
          <div className="aviso" data-tom="neutro" style={{ marginBottom: 'var(--r4)' }}>
            <b>
              {r.novos} {r.novos === 1 ? 'código da planilha não existe' : 'códigos da planilha não existem'} no
              sistema.
            </b>
            <div className="corpo">
              Esta tela não cadastra produto novo. Use &quot;Adicionar Peças Novas&quot; para isso.
            </div>
          </div>
        )}
      </>
    );
  }

  const r = resumo as ResumoProdutosNovos;
  return (
    <>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 'var(--r3)' }}>
        <strong>{nomeArquivo}</strong> · {r.linhasLidas} {r.linhasLidas === 1 ? 'linha lida' : 'linhas lidas'}
      </p>

      <div className="grade" style={{ marginBottom: 'var(--r4)' }}>
        <MetricCard rotulo="Novos produtos" valor={r.novos} tom={r.novos ? 'atencao' : 'neutro'} />
        <MetricCard rotulo="Já existem e serão ignorados" valor={r.ignorados} tom="positivo" />
        <MetricCard
          rotulo="Precisam de revisão"
          valor={r.precisamRevisao}
          tom={r.precisamRevisao ? 'atencao' : 'neutro'}
          nota="Sem preço ou categoria desconhecida"
        />
        {r.invalidos > 0 && <MetricCard rotulo="Linhas inválidas" valor={r.invalidos} tom="critico" nota="Sem código" />}
      </div>

      <div className="aviso" data-tom="neutro" style={{ marginBottom: 'var(--r4)' }}>
        <b>Este fluxo só cadastra o que ainda não existe.</b>
        <div className="corpo">
          Nenhum produto já cadastrado é alterado — mesmo que a planilha traga quantidade, preço ou descrição
          diferente.
        </div>
      </div>
    </>
  );
}
