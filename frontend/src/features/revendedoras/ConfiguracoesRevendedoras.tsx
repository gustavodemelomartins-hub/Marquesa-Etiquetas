import type { AppState } from '../../types/api';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';
import { Painel } from '../../components/Painel';
import { CapacidadeMaletas } from '../maletas/CapacidadeMaletas';

export function ConfiguracoesRevendedoras({ estado, planejamento, aoVerSugestoes, aoCriarMaleta }: {
  estado: AppState; planejamento: UsoPlanejamento; aoVerSugestoes: () => void; aoCriarMaleta: () => void;
}) {
  return <>
    <Painel titulo="Planejamento de maletas" dica="Premissas usadas na capacidade e nas sugestões">
      <p className="texto-apoio">A reserva mínima e o tamanho alvo permanecem visíveis e editáveis. Eles são premissas de planejamento guardadas neste navegador; o servidor continua garantindo que nenhuma peça saia além do estoque disponível.</p>
    </Painel>
    <CapacidadeMaletas estado={estado} planejamento={planejamento} aoVerSugestoes={aoVerSugestoes} aoCriarMaleta={aoCriarMaleta} />
  </>;
}
