import type { AppState } from '../../types/api';
import { Painel } from '../../components/Painel';
import { plural } from '../../domain/formato';
import {
  calcularCapacidade,
  ROTULO_MODO,
  RESERVA_POR_MODO,
  type ModoPlanejamento,
} from '../../domain/capacidade';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

const MODOS: ModoPlanejamento[] = ['conservador', 'equilibrado', 'agressivo'];

interface Props {
  estado: AppState;
  planejamento: UsoPlanejamento;
  aoVerSugestoes: () => void;
  aoCriarMaleta: () => void;
}

/** "Com o estoque que tenho em casa hoje, quantas maletas novas monto?"
 *
 *  O bloco mostra a resposta E as duas premissas que a produziram, lado a
 *  lado, editáveis. Não existe regra de negócio por trás desse número — ver
 *  o cabeçalho de `domain/capacidade.ts` —, então esconder as premissas
 *  transformaria uma projeção em fato. */
export function CapacidadeMaletas({ estado, planejamento, aoVerSugestoes, aoCriarMaleta }: Props) {
  const { config, origemAlvo, definirModo, definirTamanhoAlvo, restaurarPadrao } = planejamento;
  const cap = calcularCapacidade(estado, config);

  return (
    <Painel
      titulo="Capacidade para novas maletas"
      dica="Quantas maletas cabem no que está em casa hoje"
      acoes={
        <>
          <button type="button" className="btn btn-leitura btn-sm" onClick={aoVerSugestoes}>
            Ver sugestões
          </button>
          <button type="button" className="btn btn-escrita btn-sm" onClick={aoCriarMaleta}>
            + Criar maleta
          </button>
        </>
      }
    >
      <div className="capacidade">
        <div className="cap-numero">
          <div className="valor">{cap.maletas}</div>
          <div className="rotulo">
            {plural(cap.maletas, 'maleta nova', 'maletas novas')} de {cap.tamanhoAlvo} peças
          </div>
        </div>

        <dl className="cap-conta">
          <div>
            <dt>Em casa, elegível</dt>
            <dd>
              {cap.emCasa} <span className="unid">peças</span>
            </dd>
          </div>
          <div>
            <dt>Fica em casa (reserva {cap.reservaPct}%)</dt>
            <dd>
              −{cap.reservado} <span className="unid">peças</span>
            </dd>
          </div>
          <div className="destaque">
            <dt>Liberado para consignar</dt>
            <dd>
              {cap.consignavel} <span className="unid">peças</span>
            </dd>
          </div>
          <div>
            <dt>Sobra depois das maletas</dt>
            <dd>
              {cap.sobra} <span className="unid">peças</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="cap-controles">
        <div className="cap-campo">
          <span className="cap-lbl">Modo de planejamento</span>
          <div className="seg" role="group" aria-label="Modo de planejamento">
            {MODOS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={config.modo === m}
                onClick={() => definirModo(m)}
                title={`Mantém ${RESERVA_POR_MODO[m]}% de cada código em casa`}
              >
                {ROTULO_MODO[m]}
              </button>
            ))}
          </div>
          <p className="cap-explica">
            O modo é um único parâmetro: quanto de <b>cada código</b> fica em casa.{' '}
            {ROTULO_MODO[config.modo]} guarda {cap.reservaPct}%. Não há nada além disso
            decidindo — nenhuma heurística, nenhum modelo.
          </p>
        </div>

        <div className="cap-campo">
          <span className="cap-lbl">Peças por maleta</span>
          <div className="cap-alvo">
            <input
              type="number"
              min={1}
              value={config.tamanhoAlvo}
              onChange={(e) => definirTamanhoAlvo(Number(e.target.value))}
              aria-label="Peças por maleta"
            />
            {config.tamanhoAlvoConfirmado && origemAlvo.origem === 'historico' && (
              <button type="button" className="btn btn-leitura btn-sm" onClick={restaurarPadrao}>
                Usar {origemAlvo.valor}
              </button>
            )}
          </div>
          <p className="cap-explica">
            {origemAlvo.origem === 'historico' ? (
              <>
                Padrão: <b>{origemAlvo.valor} peças</b>, a mediana das {origemAlvo.amostra}{' '}
                {plural(origemAlvo.amostra, 'maleta já montada', 'maletas já montadas')}.
              </>
            ) : (
              <>
                Ainda não há maleta no histórico para calcular um tamanho típico —{' '}
                <b>{config.tamanhoAlvo} é um valor de partida</b>, não uma regra da Marquesa.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="aviso" data-tom="atencao">
        <b>Estes dois números ainda não são regra do sistema.</b>
        <div className="corpo">
          <code>api/REGRAS.md</code> não define reserva mínima em casa nem tamanho de maleta. O
          backend só garante que nada saia além do disponível. Enquanto a decisão de negócio não
          for tomada, a configuração vive neste navegador e o número acima é uma projeção sob a
          premissa mostrada — não um fato do estoque.
        </div>
      </div>

      {cap.pecasSemPreco > 0 && (
        <p className="cap-nota">
          {cap.pecasSemPreco} {plural(cap.pecasSemPreco, 'peça liberada está', 'peças liberadas estão')}{' '}
          sem preço e {plural(cap.pecasSemPreco, 'fica', 'ficam')} fora das sugestões: sem preço
          não dá para encerrar o acerto (§24).
        </p>
      )}
    </Painel>
  );
}
