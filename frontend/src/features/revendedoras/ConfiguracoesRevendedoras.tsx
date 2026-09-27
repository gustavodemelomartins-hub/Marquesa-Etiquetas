import type { AppState } from '../../types/api';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';
import { Painel } from '../../components/Painel';
import { CapacidadeMaletas } from '../maletas/CapacidadeMaletas';

export function ConfiguracoesRevendedoras({ estado, planejamento, aoVerSugestoes, aoCriarMaleta }: {
  estado: AppState; planejamento: UsoPlanejamento; aoVerSugestoes: () => void; aoCriarMaleta: () => void;
}) {
  return <>
    <Painel titulo="Planejamento de maletas" dica="Usado na capacidade e nas sugestões de maleta">
      <p className="texto-apoio">Escolha o tamanho das maletas e quanto deixar em casa. Estas escolhas valem para este aparelho e só servem para planejar: o sistema nunca deixa sair mais peça do que existe.</p>
    </Painel>
    <CapacidadeMaletas estado={estado} planejamento={planejamento} aoVerSugestoes={aoVerSugestoes} aoCriarMaleta={aoCriarMaleta} />
  </>;
}
