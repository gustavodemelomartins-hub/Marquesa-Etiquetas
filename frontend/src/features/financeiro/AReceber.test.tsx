// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AReceber } from './AReceber';
import { hojeISO } from '../../domain/formato';
import type { Connection } from '../../services/client';
import type { ContaAReceber, ContasAReceber, PainelFinanceiro, Recorte } from './tipos';

afterEach(cleanup);

const conexao: Connection = { url: 'http://api.local', key: 'chave' };
const recorte: Recorte = { periodo: '30d', de: null, ate: null };

function conta(over: Partial<ContaAReceber> = {}): ContaAReceber {
  return {
    chave: 'venda:1', tipo: 'venda', id: 1, versao: 1, vendaId: 1058,
    data: '2026-09-05', clienteId: 7, clienteNorm: 'camila ferreira',
    cliente: 'Camila Ferreira', clienteAmbiguo: false, origem: 'venda do sistema',
    observacao: null, valorTotal: 159, valorRecebido: 0, valorReceber: 159,
    vencimentoEm: '2026-09-16', vencida: false, pagaEm: null,
    cobrancaStatus: 'aberta', podeDefinirPrazo: true,
    ...over,
  };
}

function resposta(contas: ContaAReceber[]): ContasAReceber {
  const abertas = contas.filter((c) => c.cobrancaStatus === 'aberta');
  return {
    ok: true,
    cobertura: { completa: true, fontes: {}, porque: null },
    resumo: {
      quantidade: abertas.length,
      total: +abertas.reduce((s, c) => s + c.valorReceber, 0).toFixed(2),
      totalCentavos: 0,
      vencidas: abertas.filter((c) => c.vencida).length,
      semPrazo: abertas.filter((c) => !c.vencimentoEm).length,
      porTipo: {},
    },
    contas,
    regra: 'Uma linha por venda.',
  } as ContasAReceber;
}

/** Só o campo que esta tela lê do painel. O resto do contrato tem os
 *  testes dele em `domain/analytics`. */
const painel = { geral: { faturamento: 359 } } as unknown as PainelFinanceiro;

function abrir(contas: ContaAReceber[], p: PainelFinanceiro | null = painel) {
  return render(
    <AReceber
      conexao={conexao}
      dados={resposta(contas)}
      erro={null}
      recarregar={() => {}}
      aoAbrirCliente={() => {}}
      painel={p}
      recorte={recorte}
    />,
  );
}

/** A composição aprovada em `docs/ux/03-screens/financeiro/master.html`.
 *
 *  Estas provas são sobre a ARQUITETURA da tela — quantos números, quais,
 *  que colunas, e o painel que fica. A tela anterior tinha os dados certos
 *  numa composição que não era a aprovada: três números, dois deles
 *  contagem, sem busca, sem filtro e com um diálogo no lugar do painel. */
describe('A receber — paridade com o protótipo', () => {
  it('mostra QUATRO números, e os quatro em dinheiro', () => {
    abrir([
      conta({ chave: 'venda:1', vencimentoEm: hojeISO(), valorReceber: 100, valorTotal: 100 }),
      conta({ chave: 'venda:2', vencida: true, vencimentoEm: '2026-08-01', valorReceber: 269, valorTotal: 269 }),
    ]);

    const kpis = document.querySelector('.mq-kpis') as HTMLElement;
    for (const rotulo of ['Saldo em aberto', 'Vence hoje', 'Em atraso', 'Recebido']) {
      expect(within(kpis).getByText(rotulo)).toBeTruthy();
    }
    /* "Vence hoje" e "Em atraso" são SALDOS, não contagens: a pergunta de
       quem abre esta tela é quanto dinheiro está parado, não quantas
       linhas existem. */
    const valores = kpis.querySelectorAll('.mq-kpi__value');
    expect([...valores].every((k) => k.textContent?.includes('R$'))).toBe(true);
  });

  it('soma "Vence hoje" e "Em atraso" pelo vencimento, não pelo status', () => {
    abrir([
      conta({ chave: 'venda:1', vencimentoEm: hojeISO(), valorReceber: 100 }),
      conta({ chave: 'venda:2', vencimentoEm: hojeISO(), valorReceber: 40 }),
      conta({ chave: 'venda:3', vencida: true, vencimentoEm: '2026-08-01', valorReceber: 269 }),
      conta({ chave: 'venda:4', vencimentoEm: null, valorReceber: 11 }),
    ]);

    const kpis = document.querySelector('.mq-kpis') as HTMLElement;
    const valor = (rotulo: string) =>
      within(kpis).getByText(rotulo).parentElement?.querySelector('.mq-kpi__value')?.textContent;
    expect(valor('Vence hoje')).toContain('140');
    expect(valor('Em atraso')).toContain('269');
    /* A sem prazo não entra em nenhum dos dois, e continua no saldo. */
    expect(valor('Saldo em aberto')).toContain('420');
  });

  it('diz o recorte do "Recebido" em vez de chamá-lo de "no mês"', () => {
    abrir([conta()]);
    /* O protótipo diz "no mês" porque o recorte dele é fixo. Aqui ele é
       escolhido no Resumo e vale para o Financeiro inteiro: dizer "mês"
       com 30 dias na mão faria o número parecer outro. */
    expect(screen.getByText(/pela data efetiva/)).toBeTruthy();
    expect(screen.queryByText(/Recebido no mês/)).toBeNull();
  });

  it('sem painel, o "Recebido" não inventa zero', () => {
    abrir([conta()], null);
    const kpis = document.querySelector('.mq-kpis') as HTMLElement;
    const kpi = within(kpis).getByText('Recebido').parentElement;
    /* Zero afirmaria que nada entrou. O traço diz "ainda não sei", que é
       a verdade enquanto o painel não respondeu. */
    expect(kpi?.querySelector('.mq-kpi__value')?.textContent).toContain('—');
  });

  it('traz as sete colunas do protótipo, com Total e Recebido', () => {
    abrir([conta({ valorTotal: 340, valorRecebido: 100, valorReceber: 240 })]);
    const tabela = screen.getByRole('table', { name: 'Contas a receber' });
    for (const col of ['Cliente', 'Venda', 'Vencimento', 'Total', 'Recebido', 'A receber', 'Situação']) {
      expect(within(tabela).getByText(col)).toBeTruthy();
    }
    /* Os três valores de dinheiro aparecem na MESMA linha: sem "Total" e
       "Recebido" ninguém sabe se 240 é a venda toda ou o que sobrou. */
    expect(within(tabela).getByText('R$ 340')).toBeTruthy();
    expect(within(tabela).getByText('R$ 100')).toBeTruthy();
    expect(within(tabela).getByText('R$ 240')).toBeTruthy();
  });

  it('filtra por busca e pelos chips, sem trocar de tela', () => {
    abrir([
      conta({ chave: 'venda:1', cliente: 'Camila Ferreira' }),
      conta({ chave: 'venda:2', cliente: 'Ana Luiza', vencida: true, vencimentoEm: '2026-08-01' }),
    ]);

    fireEvent.change(screen.getByLabelText('Buscar cliente ou venda'), { target: { value: 'ana' } });
    expect(screen.queryByText('Camila Ferreira')).toBeNull();
    expect(screen.getAllByText('Ana Luiza').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Buscar cliente ou venda'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Em atraso' }));
    expect(screen.queryByText('Camila Ferreira')).toBeNull();
  });

  it('o painel da venda FICA, e segue a linha escolhida', () => {
    abrir([
      conta({ chave: 'venda:1', cliente: 'Camila Ferreira', valorTotal: 159, valorReceber: 159 }),
      conta({ chave: 'venda:2', cliente: 'Ana Luiza', valorTotal: 340, valorRecebido: 100, valorReceber: 240 }),
    ]);

    /* Sem clicar em nada, a primeira já está aberta: uma tela de cobrança
       que começa vazia obriga um clique antes de qualquer trabalho. */
    expect(screen.getByText('Venda selecionada')).toBeTruthy();
    expect(screen.getByText('Valor da venda')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Abrir Ana Luiza/ }));
    const painelVenda = screen.getByText('Venda selecionada').closest('.sale-detail');
    expect(painelVenda).toBeTruthy();
    expect(within(painelVenda as HTMLElement).getByText('R$ 340')).toBeTruthy();
    /* E a lista continua ali — o painel não é um diálogo que tapa o
       trabalho a cada clique. */
    expect(screen.getByRole('table', { name: 'Contas a receber' })).toBeTruthy();
  });

  it('mostra o que já entrou e o que falta como duas linhas', () => {
    abrir([conta({ valorTotal: 340, valorRecebido: 100, valorReceber: 240, pagaEm: '2026-09-10' })]);
    const recebimentos = screen.getByText('Recebimentos da venda').parentElement as HTMLElement;
    expect(within(recebimentos).getByText('Recebido')).toBeTruthy();
    expect(within(recebimentos).getByText('A receber')).toBeTruthy();
    expect(within(recebimentos).getByText(/data efetiva/)).toBeTruthy();
  });

  it('conta em aberto não oferece corrigir: não há recebimento para corrigir', () => {
    abrir([conta()]);
    expect(screen.queryByRole('button', { name: /Corrigir lançamento/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Registrar recebimento' })).toBeTruthy();
    /* O que continua fora é dito, no lugar onde a ação estaria. */
    expect(screen.getByText(/Receber em partes continua fora do sistema/)).toBeTruthy();
  });

  it('em Recebidas, "Corrigir lançamento" pede motivo e chama o estorno com a versão', async () => {
    const paga = conta({
      chave: 'historico:9', tipo: 'historico', id: 9, versao: 3, vendaId: null,
      cliente: 'Iris Melo', valorRecebido: 120, valorReceber: 0, valorTotal: 120,
      pagaEm: '2026-09-10', cobrancaStatus: 'paga', podeDefinirPrazo: false,
    });
    const chamadas: { url: string; corpo: unknown }[] = [];
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url: String(url), corpo: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).includes('/api/contas-receber?status=paga')) {
        return new Response(JSON.stringify(resposta([paga])), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, versao: 4 }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchFalso);
    const recarregar = vi.fn();
    render(
      <AReceber
        conexao={conexao}
        dados={resposta([conta()])}
        erro={null}
        recarregar={recarregar}
        aoAbrirCliente={() => {}}
        painel={painel}
        recorte={recorte}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Recebidas' }));
    const botao = await screen.findByRole('button', { name: 'Corrigir lançamento' });
    fireEvent.click(botao);

    const dialogo = screen.getByRole('dialog', { name: 'Corrigir lançamento' });
    const confirmar = within(dialogo).getByRole('button', { name: /Voltar a conta para em aberto/ });
    expect(confirmar.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'lançado na cliente errada' } });
    expect(confirmar.hasAttribute('disabled')).toBe(false);
    fireEvent.click(confirmar);

    await vi.waitFor(() => expect(recarregar).toHaveBeenCalled());
    const estorno = chamadas.find((c) => c.url.endsWith('/api/contas-receber/estornar'));
    expect(estorno?.corpo).toEqual({ chave: 'historico:9', motivo: 'lançado na cliente errada', versaoEsperada: 3 });
    vi.unstubAllGlobals();
  });

  it('não oferece receber uma conta que não tem saldo', () => {
    abrir([conta({ valorReceber: 0, valorRecebido: 159, cobrancaStatus: 'paga' })]);
    expect(screen.getByRole('button', { name: 'Registrar recebimento' }).hasAttribute('disabled')).toBe(true);
  });

  it('a busca sem resultado é estado vazio, não lista em branco', () => {
    abrir([conta({ cliente: 'Camila Ferreira' })]);
    fireEvent.change(screen.getByLabelText('Buscar cliente ou venda'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum saldo encontrado')).toBeTruthy();
    expect(screen.queryByText('Nada em aberto')).toBeNull();
  });

  it('as três datas são ditas nesta aba, onde se trabalha com elas', () => {
    abrir([conta()]);
    expect(screen.getByText('Três datas, três significados.')).toBeTruthy();
    expect(screen.getByText(/é ela que conta no faturamento/)).toBeTruthy();
  });

  it('repete por escrito quando a cobertura do backend não é completa', () => {
    const dados = resposta([conta()]);
    dados.cobertura = { completa: false, fontes: {}, porque: 'este total cobre apenas a fonte historica' };
    render(
      <AReceber
        conexao={conexao} dados={dados} erro={null} recarregar={() => {}}
        aoAbrirCliente={() => {}} painel={painel} recorte={recorte}
      />,
    );
    expect(screen.getByText('este total cobre apenas a fonte historica')).toBeTruthy();
  });

  it('não some com a tela quando não há nada em aberto', () => {
    abrir([]);
    expect(screen.getByText('Nada em aberto')).toBeTruthy();
    expect(screen.getByText('Nenhuma conta selecionada')).toBeTruthy();
  });
});

/* A tela chama `prompt` para o prazo. Sem isto o jsdom lança e o teste
   morre por um motivo que não é o que ele investiga. */
vi.stubGlobal('prompt', () => null);
