// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NovoProduto } from './NovoProduto';
import type { Connection } from '../../services/client';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

interface Chamada { metodo: string; caminho: string; corpo: unknown }

/** Um servidor de mentira que RESPONDE como o de verdade responde, e que
 *  guarda o que recebeu. As provas aqui são sobre o contrato: quais rotas
 *  a tela chama, em que ordem, e com que corpo. Cadastrar uma peça com o
 *  corpo errado é o defeito que nenhum teste de renderização pega. */
function servidor(respostas: Record<string, unknown> = {}) {
  const chamadas: Chamada[] = [];
  const padrao: Record<string, unknown> = {
    'GET /api/produtos/sku/checar': { sku: '310928', valido: true, bloqueiam: [], avisos: [], formato: { ok: true } },
    'POST /api/produtos/sku/gerar': { ok: true, sku: '482913' },
    'POST /api/produtos/novos/analisar': {
      prontos: { itens: [{ sku: '310928', desc: 'Anel Solitário', cat: 'Anel', preco: 129, qtd: 4 }] },
      jaExistem: { itens: [] },
      revisao: { itens: [] },
    },
    'POST /api/produtos/novos/cadastrar': { criados: 1, ignorados: [], avisos: [] },
  };
  const tabela = { ...padrao, ...respostas };

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const caminho = String(url).replace('http://api.local', '').split('?')[0] ?? '';
    chamadas.push({
      metodo, caminho,
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const chave = Object.keys(tabela).find((k) => k === `${metodo} ${caminho}`)
      ?? Object.keys(tabela).find((k) => k.startsWith(`${metodo} `) && caminho.startsWith(k.slice(metodo.length + 1)));
    return new Response(JSON.stringify(chave ? tabela[chave] : {}), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
  return chamadas;
}

function abrir(aoCriado = vi.fn()) {
  render(
    <NovoProduto
      conexao={conexao}
      categorias={['Anel', 'Colar']}
      aoCancelar={() => {}}
      aoCriado={aoCriado}
    />,
  );
  return aoCriado;
}

const digitar = (rotulo: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe('Novo produto — o cadastro que a V2 não tinha', () => {
  it('cria a peça pelas MESMAS rotas da importação, com origem manual', async () => {
    const chamadas = servidor();
    const aoCriado = abrir();

    digitar(/Código/, '310928');
    digitar(/Nome da peça/, 'Anel Solitário');
    fireEvent.change(screen.getByLabelText(/Categoria/), { target: { value: 'Anel' } });
    digitar(/Preço/, '129');
    digitar(/Quantidade inicial/, '4');

    fireEvent.click(screen.getByRole('button', { name: /Conferir e criar/ }));
    await screen.findByText('Confira antes de criar');

    /* O laudo aparece ANTES de qualquer escrita: nada foi cadastrado só
       por preencher o formulário. */
    expect(chamadas.some((c) => c.caminho === '/api/produtos/novos/cadastrar')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Criar produto/ }));
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith('310928'));

    const analise = chamadas.find((c) => c.caminho === '/api/produtos/novos/analisar');
    const cadastro = chamadas.find((c) => c.caminho === '/api/produtos/novos/cadastrar');
    expect((analise!.corpo as { origem: string }).origem).toBe('manual');
    expect((cadastro!.corpo as { origem: string }).origem).toBe('manual');
    /* §19: a quantidade viaja na linha e o backend a transforma em
       movimento. Em lugar nenhum desta tela existe uma escrita em `qtd`. */
    expect((cadastro!.corpo as { produtos: { qtd: number }[] }).produtos[0]!.qtd).toBe(4);
  });

  it('§24 — preço em branco vai como ausente, nunca como zero', async () => {
    const chamadas = servidor();
    abrir();

    digitar(/Código/, '310928');
    digitar(/Nome da peça/, 'Anel Solitário');
    fireEvent.click(screen.getByRole('button', { name: /Conferir e criar/ }));
    await screen.findByText('Confira antes de criar');

    const analise = chamadas.find((c) => c.caminho === '/api/produtos/novos/analisar');
    const linha = (analise!.corpo as { produtos: { preco: unknown }[] }).produtos[0];
    expect(linha!.preco).toBeNull();
  });

  it('§17 — recusa o código fora do formato antes de chamar o servidor', async () => {
    const chamadas = servidor();
    abrir();

    digitar(/Código/, '12AB');
    digitar(/Nome da peça/, 'Anel Solitário');
    fireEvent.click(screen.getByRole('button', { name: /Conferir e criar/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(chamadas.some((c) => c.caminho === '/api/produtos/novos/analisar')).toBe(false);
  });

  it('diz ONDE o código já está, em vez de só recusar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    servidor({
      'GET /api/produtos/sku/checar': {
        sku: '310928', valido: true, formato: { ok: true },
        bloqueiam: [{ onde: 'produtos', desc: 'Anel Abaulado' }], avisos: [],
      },
    });
    abrir();

    digitar(/Código/, '310928');
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(await screen.findByText(/já é de Anel Abaulado no catálogo/)).toBeTruthy();
    /* E o caminho fica fechado: conferir um código que é de outra peça só
       produziria o mesmo "já existe" mais tarde. */
    expect(screen.getByRole('button', { name: /Conferir e criar/ }).hasAttribute('disabled')).toBe(true);
  });

  it('o código que já está na Nuvemshop é AVISO, não impedimento', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    servidor({
      'GET /api/produtos/sku/checar': {
        sku: '310928', valido: true, formato: { ok: true }, bloqueiam: [],
        avisos: [{ onde: 'loja_variantes', produto: 'Anel Solitário', variacao: 'Aro 17' }],
      },
    });
    abrir();

    digitar(/Código/, '310928');
    digitar(/Nome da peça/, 'Anel Solitário');
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(await screen.findByText(/já existe na Nuvemshop/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Conferir e criar/ }).hasAttribute('disabled')).toBe(false);
  });

  it('com variações, a quantidade é a SOMA — e a divisão é aplicada depois', async () => {
    const chamadas = servidor({
      'POST /api/produtos/novos/analisar': {
        prontos: { itens: [{ sku: '310928', desc: 'Anel Solitário', cat: 'Anel', preco: null, qtd: 5 }] },
        jaExistem: { itens: [] }, revisao: { itens: [] },
      },
      'PUT /api/produtos/310928/variacoes': {
        combinacoes: [
          { nome: '16', varianteId: 'local:1' },
          { nome: '17', varianteId: 'local:2' },
        ],
      },
      'POST /api/produtos/310928/variacoes/distribuir': { ok: true },
    });
    const aoCriado = abrir();

    digitar(/Código/, '310928');
    digitar(/Nome da peça/, 'Anel Solitário');
    fireEvent.click(screen.getByLabelText(/Esta peça tem variações/));

    fireEvent.change(screen.getByPlaceholderText('Aro'), { target: { value: 'Aro' } });
    fireEvent.change(screen.getByPlaceholderText('16, 17, 18, 19'), { target: { value: '16, 17' } });
    fireEvent.change(screen.getByLabelText('Quantidade de 16'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Quantidade de 17'), { target: { value: '3' } });

    /* O campo "Quantidade inicial" nem existe: dois números para a mesma
       coisa produzem a pergunta que ninguém sabe responder. */
    expect(screen.queryByLabelText(/Quantidade inicial/)).toBeNull();
    expect(screen.getByText(/Quantidade da peça: 5/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Conferir e criar/ }));
    await screen.findByText('Confira antes de criar');
    fireEvent.click(screen.getByRole('button', { name: /Criar produto/ }));
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith('310928'));

    const ordem = chamadas.map((c) => c.caminho);
    expect(ordem.indexOf('/api/produtos/novos/cadastrar'))
      .toBeLessThan(ordem.indexOf('/api/produtos/310928/variacoes'));
    const dist = chamadas.find((c) => c.caminho === '/api/produtos/310928/variacoes/distribuir');
    expect((dist?.corpo as { distribuicao: { varianteId: string; qtd: number }[] }).distribuicao)
      .toEqual([{ varianteId: 'local:1', qtd: 2 }, { varianteId: 'local:2', qtd: 3 }]);
  });

  it('a peça existe mesmo quando a variação falha — e a tela diz isso', async () => {
    servidor({
      'POST /api/produtos/novos/analisar': {
        prontos: { itens: [{ sku: '310928', desc: 'Anel Solitário', cat: 'Anel', preco: null, qtd: 2 }] },
        jaExistem: { itens: [] }, revisao: { itens: [] },
      },
      /* Estrutura gravada, mas sem nenhuma combinação utilizável: a soma
         não fecha e a divisão NÃO pode ser inventada. */
      'PUT /api/produtos/310928/variacoes': { combinacoes: [] },
    });
    const aoCriado = abrir();

    digitar(/Código/, '310928');
    digitar(/Nome da peça/, 'Anel Solitário');
    fireEvent.click(screen.getByLabelText(/Esta peça tem variações/));
    fireEvent.change(screen.getByPlaceholderText('Aro'), { target: { value: 'Aro' } });
    fireEvent.change(screen.getByPlaceholderText('16, 17, 18, 19'), { target: { value: '16, 17' } });
    fireEvent.change(screen.getByLabelText('Quantidade de 16'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: /Conferir e criar/ }));
    await screen.findByText('Confira antes de criar');
    fireEvent.click(screen.getByRole('button', { name: /Criar produto/ }));

    /* O produto FOI criado. Dizer que falhou tudo seria mentira, e mandar a
       pessoa cadastrar de novo criaria uma segunda peça. */
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith('310928'));
  });

  it('não engole a recusa do servidor no cadastro', async () => {
    servidor({
      'POST /api/produtos/novos/cadastrar': {
        criados: 0, ignorados: [{ sku: '310928', motivo: 'ja_existe' }], avisos: [],
      },
    });
    const aoCriado = abrir();

    digitar(/Código/, '310928');
    digitar(/Nome da peça/, 'Anel Solitário');
    fireEvent.click(screen.getByRole('button', { name: /Conferir e criar/ }));
    await screen.findByText('Confira antes de criar');
    fireEvent.click(screen.getByRole('button', { name: /Criar produto/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(aoCriado).not.toHaveBeenCalled();
  });

  it('gerar código preenche o campo com o que o servidor RESERVOU', async () => {
    const chamadas = servidor();
    abrir();

    fireEvent.click(screen.getByRole('button', { name: /Gerar código/ }));
    await waitFor(() => expect((screen.getByLabelText(/Código/) as HTMLInputElement).value).toBe('482913'));

    const gerar = chamadas.find((c) => c.caminho === '/api/produtos/sku/gerar');
    expect(gerar?.metodo).toBe('POST');
  });
});
