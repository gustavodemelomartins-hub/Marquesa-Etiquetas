// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevendedorasArea, type SubRotaRevendedoras } from './RevendedorasArea';
import type { Connection } from '../../services/client';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';
import { emCasa, estadoDeTeste, maleta, revendedora } from '../../testing/fixtures';
import type {
  IntegracaoScannerAcerto,
  LeitorEtiquetaProps,
} from '../maletas/AcertoMaletaFluxo';

vi.mock('../maletas/api');
import * as api from '../maletas/api';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const conexao: Connection = { url: 'http://api.local', key: 'chave' };
const liberarScanner = vi.fn();

const planejamento: UsoPlanejamento = {
  config: { modo: 'equilibrado', tamanhoAlvo: 8, tamanhoAlvoConfirmado: true },
  origemAlvo: { valor: 8, origem: 'historico', amostra: 2 },
  definirModo: () => {},
  definirTamanhoAlvo: () => {},
  restaurarPadrao: () => {},
};

const estado = estadoDeTeste({
  produtos: [
    emCasa('C1', 20, { cat: 'Colar', preco: 150 }),
    emCasa('B1', 30, { cat: 'Brinco', preco: 60 }),
  ],
  revendedoras: [
    revendedora({ id: 1, nome: 'Andreia Souza', cidade: 'Bauru' }),
    revendedora({ id: 2, nome: 'Graciele' }),
    revendedora({ id: 3, nome: 'Bruna', status: 'inativa' }),
  ],
  maletas: [maleta({ id: 7, revId: 1, acertoEm: '2026-09-01', itens: { C1: 3 }, precos: { C1: 150 } })],
});

/** A navegação de subaba mora no `App`; aqui ela é simulada para o teste
 *  poder clicar numa aba e ver a tela mudar de verdade. */
function Area({
  inicial = 'visao-geral' as SubRotaRevendedoras,
  scannerCompartilhado,
}: {
  inicial?: SubRotaRevendedoras;
  scannerCompartilhado?: IntegracaoScannerAcerto;
}) {
  const [sub, setSub] = useState<SubRotaRevendedoras>(inicial);
  return (
    <RevendedorasArea
      conexao={conexao}
      estado={estado}
      carregando={false}
      erro={null}
      recarregar={() => {}}
      planejamento={planejamento}
      sub={sub}
      aoNavegarSub={setSub}
      scannerCompartilhado={scannerCompartilhado}
    />
  );
}

function LeitorDeTeste({ aoLer, aoFechar }: LeitorEtiquetaProps) {
  const [resultado, setResultado] = useState('');
  useEffect(() => liberarScanner, []);
  const ler = async (codigo: string) => setResultado((await aoLer(codigo)).texto);
  return <div>
    <button type="button" onClick={() => void ler('C1')}>Bipar C1</button>
    <button type="button" onClick={() => void ler('B1')}>Bipar B1</button>
    <button type="button" onClick={aoFechar}>Desligar a câmera</button>
    {resultado && <p role="status">{resultado}</p>}
  </div>;
}

const scannerDeTeste: IntegracaoScannerAcerto = {
  Leitor: LeitorDeTeste,
  resolverSku: (codigo, conhecidos) => conhecidos.has(String(codigo)) ? String(codigo) : null,
};

describe('navegação de Revendedoras', () => {
  it('abre na Visão Geral', () => {
    render(<Area />);
    const abas = screen.getByRole('tablist', { name: 'Revendedoras' });
    expect(within(abas).getByRole('tab', { name: 'Visão geral' })).toHaveProperty(
      'ariaSelected',
      'true',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Revendedoras' })).toBeTruthy();
  });

  it('usa a navegação estável do módulo, sem transformar pessoas em abas', () => {
    render(<Area />);
    const abas = screen.getByRole('tablist', { name: 'Revendedoras' });
    const rotulos = [...abas.querySelectorAll('[role="tab"]')].map((b) => b.textContent);
    expect(rotulos).toEqual(['Visão geral', 'Todas as revendedoras 2', 'Configurações']);
  });

  it('revendedora arquivada não vira aba', () => {
    render(<Area />);
    expect(screen.queryByRole('tab', { name: 'Bruna' })).toBeNull();
  });

  it('cada revendedora continua acessível por Todas as revendedoras', () => {
    render(<Area />);
    fireEvent.click(screen.getByRole('tab', { name: /Todas as revendedoras/ }));
    fireEvent.click(screen.getByRole('button', { name: /Andreia Souza/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Andreia Souza' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Maleta #7' })).toBeTruthy();
  });

  it('perfil com maleta aberta segue a hierarquia do protótipo e não oferece outra maleta', () => {
    render(<Area inicial={1} />);
    expect(screen.getByText('Perfil da revendedora')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar cadastro' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Criar maleta' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Maleta #7' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Mix da maleta' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Histórico de maletas' })).toBeTruthy();
  });

  it('permite editar o cadastro pelo contrato real da revendedora', async () => {
    vi.mocked(api.atualizarRevendedora).mockResolvedValue({ ok: true });
    render(<Area inicial={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar cadastro' }));
    const painel = screen.getByRole('dialog', { name: 'Editar cadastro' });
    fireEvent.change(within(painel).getByLabelText('Telefone'), { target: { value: '(14) 99999-0000' } });
    fireEvent.click(within(painel).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(api.atualizarRevendedora).toHaveBeenCalledWith(
      conexao, 1, expect.objectContaining({ nome: 'Andreia Souza', tel: '(14) 99999-0000' }),
    ));
  });

  it('adiciona peças à maleta aberta sem iniciar uma nova maleta', async () => {
    vi.mocked(api.adicionarItens).mockResolvedValue({ ok: true, adicionados: 1, recusados: [] });
    render(<Area inicial={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar itens' }));
    const painel = screen.getByRole('dialog', { name: 'Adicionar itens à maleta #7' });
    fireEvent.change(within(painel).getByLabelText('Quantidade de B1'), { target: { value: '2' } });
    fireEvent.click(within(painel).getByRole('button', { name: 'Adicionar à maleta' }));
    await waitFor(() => expect(api.adicionarItens).toHaveBeenCalledWith(conexao, 7, { B1: 2 }));
    expect(api.criarMaleta).not.toHaveBeenCalled();
  });

  it('a Visão Geral mostra a agenda de acertos e a capacidade', () => {
    render(<Area />);
    expect(screen.getByRole('heading', { name: 'Agenda de acertos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Capacidade para novas maletas' })).toBeTruthy();
  });
});

describe('sugestões', () => {
  it('ficam fora da primeira tela, atrás de "Ver sugestões"', () => {
    render(<Area />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver sugestões' }));
    const painel = screen.getByRole('dialog', { name: 'Sugestões de maleta' });
    expect(within(painel).getByRole('heading', { name: 'Equilibrada' })).toBeTruthy();
    expect(within(painel).getByRole('heading', { name: 'Giro rápido' })).toBeTruthy();
    expect(within(painel).getByRole('heading', { name: 'Premium' })).toBeTruthy();
  });

  it('mostra no máximo três propostas', () => {
    render(<Area />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver sugestões' }));
    const painel = screen.getByRole('dialog', { name: 'Sugestões de maleta' });
    expect(painel.querySelectorAll('.sugestao')).toHaveLength(3);
  });
});

describe('criar maleta exige confirmação', () => {
  it('clicar em "+ Criar maleta" não cria nada — abre a sequência', () => {
    render(<Area />);
    fireEvent.click(screen.getAllByRole('button', { name: '+ Criar maleta' })[0]!);
    expect(api.criarMaleta).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Criar maleta' })).toBeTruthy();
    expect(screen.getByText(/nada é gravado até você confirmar/)).toBeTruthy();
  });

  it('a criação só acontece depois de escolher, revisar e confirmar', async () => {
    vi.mocked(api.criarMaleta).mockResolvedValue({
      id: 99,
      revId: 2,
      status: 'aberta',
      abertaEm: '2026-08-19',
      acertoEm: null,
      itens: {},
    });
    vi.mocked(api.adicionarItens).mockResolvedValue({ ok: true, adicionados: 2, recusados: [] });

    render(<Area />);
    fireEvent.click(screen.getAllByRole('button', { name: '+ Criar maleta' })[0]!);
    const painel = screen.getByRole('dialog', { name: 'Criar maleta' });

    fireEvent.click(within(painel).getByRole('button', { name: /Graciele/ }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Gerar sugestão' }));

    /* Etapa de revisão: as peças estão na tela e nada foi gravado. */
    expect(within(painel).getByRole('heading', { name: 'Revise as peças' })).toBeTruthy();
    expect(api.criarMaleta).not.toHaveBeenCalled();

    fireEvent.click(within(painel).getByRole('button', { name: 'Revisar e confirmar' }));
    expect(within(painel).getByText('Isto grava.')).toBeTruthy();
    expect(api.criarMaleta).not.toHaveBeenCalled();

    fireEvent.click(within(painel).getByRole('button', { name: /Criar maleta para Graciele/ }));
    await waitFor(() => expect(api.criarMaleta).toHaveBeenCalledTimes(1));
    expect(api.adicionarItens).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Maleta 99 criada' })).toBeTruthy();
  });

  it('nenhuma quantidade enviada passa do que a reserva liberou', async () => {
    vi.mocked(api.criarMaleta).mockResolvedValue({
      id: 100,
      revId: 2,
      status: 'aberta',
      abertaEm: '2026-08-19',
      acertoEm: null,
      itens: {},
    });
    vi.mocked(api.adicionarItens).mockResolvedValue({ ok: true, adicionados: 2, recusados: [] });

    render(<Area />);
    fireEvent.click(screen.getAllByRole('button', { name: '+ Criar maleta' })[0]!);
    const painel = screen.getByRole('dialog', { name: 'Criar maleta' });
    fireEvent.click(within(painel).getByRole('button', { name: /Graciele/ }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Gerar sugestão' }));

    /* Tentar levar mais do que existe: o campo trava no limite da linha. */
    const campo = within(painel).getByLabelText('Quantidade de C1') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '9999' } });

    fireEvent.click(within(painel).getByRole('button', { name: 'Revisar e confirmar' }));
    fireEvent.click(within(painel).getByRole('button', { name: /Criar maleta para Graciele/ }));

    await waitFor(() => expect(api.adicionarItens).toHaveBeenCalledTimes(1));
    const enviados = vi.mocked(api.adicionarItens).mock.calls[0]![2];
    /* 20 em casa, 30% de reserva → no máximo 14 do C1. */
    expect(enviados.C1).toBeLessThanOrEqual(14);
    for (const [, qtd] of Object.entries(enviados)) expect(qtd).toBeGreaterThan(0);
  });
});

describe('acerto da maleta', () => {
  it('usa o leitor compartilhado por padrão e mantém a digitação como fallback', async () => {
    render(<Area inicial={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fazer acerto' }));
    const painel = screen.getByRole('dialog', { name: 'Acerto da maleta 7' });

    fireEvent.change(within(painel).getByLabelText('Código da etiqueta'), { target: { value: 'C1' } });
    fireEvent.click(within(painel).getByRole('button', { name: 'Registrar devolução' }));

    await waitFor(() => expect(within(painel).getByRole('status').textContent).toContain('1 de 3 devolvidas'));
    expect(within(painel).getByLabelText('Devolvidas de C1')).toHaveProperty('value', '1');

    fireEvent.click(within(painel).getByRole('button', { name: 'Abrir câmera' }));
    const leitor = within(painel).getByRole('region', { name: 'Leitor de etiquetas' });
    fireEvent.change(within(leitor).getByLabelText('Código da etiqueta'), { target: { value: 'C1' } });
    fireEvent.click(within(leitor).getByRole('button', { name: 'Contar' }));
    await waitFor(() => expect(within(leitor).getByRole('status').textContent).toContain('2 de 3 devolvidas'));
    expect(within(painel).getByLabelText('Devolvidas de C1')).toHaveProperty('value', '2');
    expect(api.encerrarAcerto).not.toHaveBeenCalled();
  });

  it('começa zerado, usa o bip como devolução e só grava o documento REV-002 ao confirmar', async () => {
    vi.mocked(api.encerrarAcerto).mockResolvedValue({
      ok: true, vendaId: 23, novaMaletaId: null,
      acerto: { enviadas: 3, devolvidas: 1, vendidas: 2, perdas: 0, baixas: 2, totalVendido: 300, comissao: 90, liquido: 210 },
    });
    render(<Area inicial={1} scannerCompartilhado={scannerDeTeste} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fazer acerto' }));
    const painel = screen.getByRole('dialog', { name: 'Acerto da maleta 7' });

    expect(within(painel).getByRole('button', { name: 'Abrir câmera' })).toBeTruthy();
    expect(within(painel).getByLabelText('Devolvidas de C1')).toHaveProperty('value', '0');
    expect(within(painel).getByLabelText('Quantidade destinada de C1 1')).toHaveProperty('value', '3');
    expect(within(painel).getByLabelText('Destino de C1 1')).toHaveProperty('value', 'vendida');
    fireEvent.click(within(painel).getByRole('button', { name: 'Abrir câmera' }));

    fireEvent.click(within(painel).getByRole('button', { name: 'Bipar C1' }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Bipar C1' }));
    await waitFor(() => expect(within(painel).getByRole('status').textContent).toContain('2 de 3 devolvidas'));
    expect(within(painel).getByLabelText('Devolvidas de C1')).toHaveProperty('value', '2');
    expect(within(painel).getByLabelText('Quantidade destinada de C1 1')).toHaveProperty('value', '1');
    expect(api.encerrarAcerto).not.toHaveBeenCalled();

    fireEvent.click(within(painel).getByRole('button', { name: 'Bipar B1' }));
    await waitFor(() => expect(within(painel).getByRole('status').textContent).toContain('Esta peça não pertence a esta maleta'));
    expect(within(painel).getByLabelText('Devolvidas de C1')).toHaveProperty('value', '2');

    fireEvent.change(within(painel).getByLabelText('Devolvidas de C1'), { target: { value: '1' } });

    fireEvent.click(within(painel).getByRole('button', { name: 'Revisar acerto' }));
    expect(liberarScanner).toHaveBeenCalledTimes(1);
    fireEvent.click(within(painel).getByRole('button', { name: 'Confirmar e encerrar maleta' }));
    await waitFor(() => expect(api.encerrarAcerto).toHaveBeenCalledWith(
      conexao,
      7,
      { devolvidas: { C1: 1 }, faltas: [{ sku: 'C1', linhas: [{ qtd: 2, destino: 'vendida' }] }] },
    ));
  });

  it('preserva destinos excepcionais quando outra devolução é registrada', async () => {
    render(<Area inicial={1} scannerCompartilhado={scannerDeTeste} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fazer acerto' }));
    const painel = screen.getByRole('dialog', { name: 'Acerto da maleta 7' });

    fireEvent.click(within(painel).getByRole('button', { name: 'Dividir em outro destino' }));
    const destinos = within(painel).getAllByLabelText(/Destino de C1/);
    fireEvent.change(destinos[1]!, { target: { value: 'troca' } });

    fireEvent.change(within(painel).getByLabelText('Código da etiqueta'), { target: { value: 'C1' } });
    fireEvent.click(within(painel).getByRole('button', { name: 'Registrar devolução' }));

    await waitFor(() => expect(within(painel).getByLabelText('Devolvidas de C1')).toHaveProperty('value', '1'));
    expect(within(painel).getAllByLabelText(/Quantidade destinada de C1/).map((campo) => (campo as HTMLInputElement).value)).toEqual(['1', '1']);
    expect((within(painel).getAllByLabelText(/Destino de C1/)[1] as HTMLSelectElement).value).toBe('troca');
    expect(api.encerrarAcerto).not.toHaveBeenCalled();
  });

  it('só grava depois de fechar todas as quantidades e confirmar', async () => {
    vi.mocked(api.encerrarAcerto).mockResolvedValue({
      ok: true, vendaId: 22, novaMaletaId: null,
      acerto: { enviadas: 3, devolvidas: 1, vendidas: 2, perdas: 0, baixas: 2, totalVendido: 300, comissao: 90, liquido: 210 },
    });
    render(<Area inicial={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fazer acerto' }));
    const painel = screen.getByRole('dialog', { name: 'Acerto da maleta 7' });
    expect(within(painel).getByText('0 devolvidas')).toBeTruthy();
    expect(within(painel).getByText('3 vendidas provisórias')).toBeTruthy();
    fireEvent.change(within(painel).getByLabelText('Devolvidas de C1'), { target: { value: '1' } });
    expect(api.encerrarAcerto).not.toHaveBeenCalled();
    fireEvent.click(within(painel).getByRole('button', { name: 'Revisar acerto' }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Confirmar e encerrar maleta' }));
    await waitFor(() => expect(api.encerrarAcerto).toHaveBeenCalledWith(
      conexao,
      7,
      { devolvidas: { C1: 1 }, faltas: [{ sku: 'C1', linhas: [{ qtd: 2, destino: 'vendida' }] }] },
    ));
    expect(await within(painel).findByRole('heading', { name: 'Acerto concluído' })).toBeTruthy();
  });
});
