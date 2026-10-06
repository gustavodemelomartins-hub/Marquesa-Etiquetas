// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PainelDeVariacoes } from './PainelDeVariacoes';
import { legendaDaLoja, mensagemParaPessoa, type EstruturaDoProduto } from './variacoes';
import type { Connection } from '../../services/client';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

/** O anel do print (código 391471), como a rota responde DEPOIS da correção:
 *  a variante única da loja ("Banho de Ouro 18K · n°18") é o mesmo aro do
 *  nº18 daqui, então aparece só como "loja online: 2" nele. */
const ANEL: EstruturaDoProduto = {
  sku: '391471', desc: 'Anel Coração Vazado Cravejado Banho de Ouro 18k', cat: 'Anel',
  qtd: 2, preco: 69, status: 'ativo', fonte: 'loja', temVariacao: true,
  atributos: [{ nome: 'Tamanho', valores: ['nº24', 'nº18'] }],
  variacoes: [
    { varianteId: 'local:e3a68e92-50fa-4dbb-b169-bfcaae665988', nome: 'nº24', valores: [], estoqueLoja: null,
      saldo: 0, daLoja: false, mapeada: false, comRevendedoras: 0, lojaOnline: 'nao_publicada' },
    { varianteId: 'local:26336e56-971d-4cbc-b88c-7a31a63ef631', nome: 'nº18', valores: [], estoqueLoja: 2,
      saldo: 0, daLoja: false, mapeada: false, comRevendedoras: 0, lojaOnline: 'equivalente' },
  ],
  saldoSemVariacao: 2, consignado: 0, consignadoSemVariacao: 0, somaLoja: 2,
};

interface Chamada { metodo: string; caminho: string; consulta: string; corpo: unknown }

function servidor(distribuir: { status: number; corpo: unknown } = { status: 200, corpo: { ok: true } }) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const [caminho = '', consulta = ''] = String(url).replace('http://api.local', '').split('?');
    chamadas.push({ metodo, caminho, consulta, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = metodo === 'POST' ? distribuir : { status: 200, corpo: ANEL };
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }));
  return chamadas;
}

const abrir = () => render(
  <PainelDeVariacoes conexao={conexao} sku="391471" aoFechar={() => {}} aoMudarEstoque={() => {}} />,
);

const TECNICO = /\b\d{8,}\b|local:|[0-9a-f]{8}-[0-9a-f]{4}-/i;

describe('Variações da peça — estoque físico não depende da loja', () => {
  it('o print: nº24 e nº18 salvam 1 e 1, sem id da loja no pedido nem na tela', async () => {
    const chamadas = servidor();
    abrir();
    const n24 = await screen.findByLabelText('Quantidade de nº24');
    const n18 = screen.getByLabelText('Quantidade de nº18');
    expect(chamadas[0]?.consulta).toBe('visao=estoque');
    expect(screen.queryByText(/Banho de Ouro 18K · n°18/)).toBeNull();
    expect(screen.getByText('loja online: 2')).toBeTruthy();
    expect(screen.getByText('ainda não está na loja online')).toBeTruthy();

    fireEvent.change(n24, { target: { value: '1' } });
    fireEvent.change(n18, { target: { value: '1' } });
    expect(screen.getByLabelText('Variação ainda não informada').textContent).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));

    await screen.findByText('Variações salvas. O total da peça não mudou.');
    const post = chamadas.find((c) => c.metodo === 'POST');
    expect(post?.caminho).toBe('/api/produtos/391471/variacoes/distribuir');
    expect(post?.corpo).toMatchObject({
      parcial: true,
      distribuicao: [
        { varianteId: 'local:e3a68e92-50fa-4dbb-b169-bfcaae665988', qtd: 1 },
        { varianteId: 'local:26336e56-971d-4cbc-b88c-7a31a63ef631', qtd: 1 },
      ],
    });
    expect(JSON.stringify(post?.corpo)).not.toContain('1509838878');
    expect(document.body.textContent).not.toMatch(TECNICO);
  });

  it('distribuição que não fecha: a diferença fica em "variação ainda não informada"', async () => {
    servidor();
    abrir();
    fireEvent.change(await screen.findByLabelText('Quantidade de nº24'), { target: { value: '1' } });
    expect(screen.getByLabelText('Variação ainda não informada').textContent).toBe('1');
    expect((screen.getByRole('button', { name: 'Salvar variações' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('erro técnico do servidor nunca chega à tela', async () => {
    servidor({ status: 400, corpo: { erro: 'A variante 1509838878 não existe na loja para 391471.' } });
    abrir();
    fireEvent.change(await screen.findByLabelText('Quantidade de nº18'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Não consegui salvar as variações. Feche e abra de novo — nada foi alterado.');
    await waitFor(() => expect(document.body.textContent).not.toMatch(TECNICO));
  });
});

describe('mensagemParaPessoa / legendaDaLoja', () => {
  it('troca id da Nuvemshop, id interno e UUID pela frase humana', () => {
    for (const t of [
      'A variante 1509838878 não existe na loja para 391471.',
      'A variante local:26336e56-971d-4cbc-b88c-7a31a63ef631 veio duas vezes na distribuição.',
      'SQLITE_CONSTRAINT: UNIQUE constraint failed',
    ]) expect(mensagemParaPessoa(t, 'humana')).toBe('humana');
  });

  it('mantém a frase que já é humana, inclusive com o código da peça', () => {
    const t = 'As variações somam 4, e o código tem 3 no total. Para mudar o total, use Ajustar estoque.';
    expect(mensagemParaPessoa(t, 'x')).toBe(t);
    expect(mensagemParaPessoa('Essa variação já existe: nº18.', 'x')).toBe('Essa variação já existe: nº18.');
  });

  it('loja online é informação, não estoque', () => {
    expect(legendaDaLoja({ lojaOnline: 'equivalente', estoqueLoja: 2 })).toBe('loja online: 2');
    expect(legendaDaLoja({ lojaOnline: 'publicada', estoqueLoja: 0 })).toBe('loja online: 0');
    expect(legendaDaLoja({ lojaOnline: 'nao_publicada', estoqueLoja: null })).toBe('ainda não está na loja online');
    expect(legendaDaLoja({ lojaOnline: null, estoqueLoja: null })).toBe('');
  });
});
