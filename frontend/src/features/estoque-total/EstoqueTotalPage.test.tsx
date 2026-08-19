// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EstoqueTotalPage } from './EstoqueTotalPage';
import type { Connection } from '../../services/client';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';
import type { ResultadoParse } from './parsePlanilha';
import type { RespostaAplicar, ResumoEstoqueTotal, ResumoProdutosNovos, SessaoReconciliacao } from './tipos';

vi.mock('./parsePlanilha', async () => {
  const real = await vi.importActual<typeof import('./parsePlanilha')>('./parsePlanilha');
  return { ...real, parsePlanilha: vi.fn() };
});
vi.mock('./api');

import { parsePlanilha } from './parsePlanilha';
import * as api from './api';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

/* O painel do topo depende de `GET /api/state`. Estes testes provam o
   FLUXO de importação, então entram com `estado: null` — a página então
   mostra só as ações, que é exatamente o que eles exercitam. O painel tem
   os testes dele em domain/. */
const planejamento: UsoPlanejamento = {
  config: { modo: 'equilibrado', tamanhoAlvo: 40, tamanhoAlvoConfirmado: false },
  origemAlvo: { valor: 40, origem: 'padrao', amostra: 0 },
  definirModo: () => {},
  definirTamanhoAlvo: () => {},
  restaurarPadrao: () => {},
};

function renderPagina() {
  return render(
    <EstoqueTotalPage
      conexao={conexao}
      estado={null}
      planejamento={planejamento}
      aoVerPlanejamento={() => {}}
      aoMudarEstoque={() => {}}
    />,
  );
}

function resultadoParseFalso(overrides: Partial<ResultadoParse> = {}): ResultadoParse {
  return {
    nomeArquivo: 'Estoque Agosto.xlsx',
    linhasLidas: 2,
    produtos: [
      { sku: '1', desc: 'Brinco Argola', cat: 'Brinco', preco: 90, qtd: 7 },
      { sku: '2', desc: 'Colar Fino', cat: 'Colar', preco: 120, qtd: 3 },
    ],
    sufixosSomados: [],
    conflitosDescricao: [],
    semColunaSku: false,
    ...overrides,
  };
}

async function selecionarArquivo(nome = 'planilha.xlsx') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], nome);
  await fireEvent.change(input, { target: { files: [file] } });
}

describe('EstoqueTotalPage — Atualizar Estoque Total', () => {
  it('escolha → upload → analisar → mostra resumo e itens da API (nada inventado no cliente)', async () => {
    vi.mocked(parsePlanilha).mockResolvedValue(resultadoParseFalso());

    const sessao: SessaoReconciliacao<ResumoEstoqueTotal> = {
      id: 10,
      origem: 'planilha_estoque_total',
      status: 'revisao',
      criadaEm: '2026-08-18T10:00:00Z',
      decididaEm: null,
      aplicadaEm: null,
      resumo: {
        total: 1,
        porRisco: { trivial: 0, confere: 1, perigoso: 0, desconhecido: 0 },
        linhasLidas: 2,
        linhasInvalidas: 0,
        semAlteracao: 1,
        seraoAlterados: 1,
        novos: 0,
        conflitos: 0,
        criticos: 0,
        naoEncontrados: [],
        ausentesDaPlanilha: ['999'],
      },
      relato: null,
      erro: null,
      itens: [
        {
          id: 1,
          sku: '1',
          variacao: null,
          descricao: 'Brinco Argola',
          tipo: 'ajuste_qtd',
          de: '4',
          para: '7',
          risco: 'confere',
          motivo: 'Planilha diz 7, sistema tinha 4.',
          status: 'pendente',
          erro: null,
          dados: null,
        },
      ],
    };
    vi.mocked(api.analisarEstoqueTotal).mockResolvedValue(sessao);

    renderPagina();

    fireEvent.click(screen.getByRole('button', { name: /Atualizar Estoque Total/ }));
    await selecionarArquivo();
    await screen.findByText('Estoque Agosto.xlsx', { exact: false });

    fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));

    await waitFor(() =>
      expect(api.analisarEstoqueTotal).toHaveBeenCalledWith(conexao, resultadoParseFalso().produtos),
    );

    expect(await screen.findByText('Brinco Argola')).toBeTruthy();
    // O resumo é lido de `sessao.resumo`, não recontado no cliente.
    expect(screen.getByText(/produto do sistema não aparece/)).toBeTruthy();
  });

  it('aprovar item chama a API e recarrega a sessão; botão de aplicar reflete a contagem aprovada', async () => {
    vi.mocked(parsePlanilha).mockResolvedValue(resultadoParseFalso());

    const itemPendente = {
      id: 1,
      sku: '1',
      variacao: null,
      descricao: 'Brinco Argola',
      tipo: 'ajuste_qtd' as const,
      de: '4',
      para: '7',
      risco: 'confere' as const,
      motivo: null,
      status: 'pendente' as const,
      erro: null,
      dados: null,
    };
    const sessaoBase: SessaoReconciliacao<ResumoEstoqueTotal> = {
      id: 10,
      origem: 'planilha_estoque_total',
      status: 'revisao',
      criadaEm: '2026-08-18T10:00:00Z',
      decididaEm: null,
      aplicadaEm: null,
      resumo: {
        total: 1, porRisco: { trivial: 0, confere: 1, perigoso: 0, desconhecido: 0 },
        linhasLidas: 2, linhasInvalidas: 0, semAlteracao: 1, seraoAlterados: 1,
        novos: 0, conflitos: 0, criticos: 0, naoEncontrados: [], ausentesDaPlanilha: [],
      },
      relato: null,
      erro: null,
      itens: [itemPendente],
    };
    const sessaoAprovada: SessaoReconciliacao<ResumoEstoqueTotal> = {
      ...sessaoBase,
      itens: [{ ...itemPendente, status: 'aprovado' }],
    };

    vi.mocked(api.analisarEstoqueTotal).mockResolvedValue(sessaoBase);
    vi.mocked(api.aprovarItem).mockResolvedValue({ ok: true });
    vi.mocked(api.obterSessao).mockResolvedValue(sessaoAprovada);

    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: /Atualizar Estoque Total/ }));
    await selecionarArquivo();
    await screen.findByText('Estoque Agosto.xlsx', { exact: false });
    fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));

    const botaoAplicar = await screen.findByRole('button', { name: /Revisar e aplicar \(0\)/ });
    expect(botaoAplicar.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(api.aprovarItem).toHaveBeenCalledWith(conexao, 10, 1));
    await screen.findByRole('button', { name: /Revisar e aplicar \(1\)/ });
  });

  it('item em conflito de consignação não pode ser aprovado — só rejeitado', async () => {
    vi.mocked(parsePlanilha).mockResolvedValue(resultadoParseFalso());

    const sessao: SessaoReconciliacao<ResumoEstoqueTotal> = {
      id: 11,
      origem: 'planilha_estoque_total',
      status: 'revisao',
      criadaEm: '2026-08-18T10:00:00Z',
      decididaEm: null,
      aplicadaEm: null,
      resumo: {
        total: 1, porRisco: { trivial: 0, confere: 0, perigoso: 0, desconhecido: 1 },
        linhasLidas: 1, linhasInvalidas: 0, semAlteracao: 0, seraoAlterados: 0,
        novos: 0, conflitos: 1, criticos: 1, naoEncontrados: [], ausentesDaPlanilha: [],
      },
      relato: null,
      erro: null,
      itens: [
        {
          id: 5,
          sku: '12345',
          variacao: null,
          descricao: 'Pulseira XYZ',
          tipo: 'ajuste_qtd',
          de: '3',
          para: '2',
          risco: 'desconhecido',
          motivo: 'A planilha informa 2 unidade(s) totais, mas existem 3 registrada(s) com revendedoras.',
          status: 'pendente',
          erro: null,
          dados: { conflito: 'total_menor_que_consignado', consignadoNaAnalise: 3 },
        },
      ],
    };
    vi.mocked(api.analisarEstoqueTotal).mockResolvedValue(sessao);

    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: /Atualizar Estoque Total/ }));
    await selecionarArquivo();
    await screen.findByText('Estoque Agosto.xlsx', { exact: false });
    fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));

    await screen.findByText('Pulseira XYZ');
    const linha = screen.getByText('Pulseira XYZ').closest('tr')!;
    const botaoAprovar = within(linha).getByRole('button', { name: 'Aprovar' });
    expect(botaoAprovar.hasAttribute('disabled')).toBe(true);
    expect(within(linha).getByText('Precisa de revisão')).toBeTruthy();
  });

  it('resultado parcial (com obsoletos) nunca mostra mensagem de sucesso total', async () => {
    vi.mocked(parsePlanilha).mockResolvedValue(resultadoParseFalso());
    const item = {
      id: 1, sku: '1', variacao: null, descricao: 'Brinco', tipo: 'ajuste_qtd' as const,
      de: '4', para: '7', risco: 'confere' as const, motivo: null, status: 'aprovado' as const,
      erro: null, dados: null,
    };
    const sessao: SessaoReconciliacao<ResumoEstoqueTotal> = {
      id: 20, origem: 'planilha_estoque_total', status: 'revisao', criadaEm: 'x',
      decididaEm: null, aplicadaEm: null,
      resumo: {
        total: 1, porRisco: { trivial: 0, confere: 1, perigoso: 0, desconhecido: 0 },
        linhasLidas: 1, linhasInvalidas: 0, semAlteracao: 0, seraoAlterados: 1,
        novos: 0, conflitos: 0, criticos: 0, naoEncontrados: [], ausentesDaPlanilha: [],
      },
      relato: null, erro: null, itens: [item],
    };
    const resposta: RespostaAplicar = {
      sessao: 20, status: 'aplicada_parcial', total: 1, aplicados: 0, obsoletos: 1, erros: 0,
      itens: [{ id: 1, sku: '1', variacao: null, tipo: 'ajuste_qtd', resultado: 'obsoleto', motivo: 'mudou' }],
    };

    vi.mocked(api.analisarEstoqueTotal).mockResolvedValue(sessao);
    vi.mocked(api.aplicarSessao).mockResolvedValue(resposta);
    vi.mocked(api.obterSessao).mockResolvedValue({ ...sessao, status: 'aplicada_parcial', relato: resposta });

    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: /Atualizar Estoque Total/ }));
    await selecionarArquivo();
    await screen.findByText('Estoque Agosto.xlsx', { exact: false });
    fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));
    await screen.findByRole('button', { name: /Revisar e aplicar \(1\)/ });

    fireEvent.click(screen.getByRole('button', { name: /Revisar e aplicar \(1\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar alterações' }));

    await screen.findByText('Importação concluída com pendências');
    expect(screen.queryByText('Tudo certo!')).toBeNull();
    expect(screen.queryByText('Importação concluída', { exact: true })).toBeNull();
  });
});

describe('EstoqueTotalPage — Adicionar Peças Novas', () => {
  it('SKU existente é ignorado: não vira item nem aparece como alteração', async () => {
    vi.mocked(parsePlanilha).mockResolvedValue(
      resultadoParseFalso({
        produtos: [
          { sku: '1', desc: 'Existente', cat: 'Anel', preco: 10, qtd: 99 },
          { sku: '2', desc: 'Novo de Fato', cat: 'Anel', preco: 20, qtd: 5 },
        ],
      }),
    );

    const sessao: SessaoReconciliacao<ResumoProdutosNovos> = {
      id: 30,
      origem: 'planilha_produtos_novos',
      status: 'revisao',
      criadaEm: 'x',
      decididaEm: null,
      aplicadaEm: null,
      resumo: {
        total: 1, porRisco: { trivial: 1, confere: 0, perigoso: 0, desconhecido: 0 },
        linhasLidas: 2, invalidos: 0, ignorados: 1, novos: 1, precisamRevisao: 0,
      },
      relato: null,
      erro: null,
      itens: [
        {
          id: 7, sku: '2', variacao: null, descricao: 'Novo de Fato', tipo: 'produto_novo',
          de: null, para: '5', risco: 'trivial', motivo: 'Código novo, pronto para criar.',
          status: 'pendente', erro: null,
          dados: { desc: 'Novo de Fato', cat: 'Anel', preco: 20, qtdInicial: 5 },
        },
      ],
    };
    vi.mocked(api.analisarProdutosNovos).mockResolvedValue(sessao);

    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: /^Adicionar Peças Novas/ }));
    await selecionarArquivo();
    await screen.findByText('Estoque Agosto.xlsx', { exact: false });
    fireEvent.click(screen.getByRole('button', { name: /Analisar peças novas/ }));

    await waitFor(() => expect(api.analisarProdutosNovos).toHaveBeenCalled());
    expect(screen.getByText('Novo de Fato')).toBeTruthy();
    expect(screen.queryByText('Existente')).toBeNull();
    expect(screen.getByText(/[Jj]á existem e serão ignorados/)).toBeTruthy();
  });
});
