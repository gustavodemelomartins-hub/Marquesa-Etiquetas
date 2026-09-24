// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* O decodificador e o bipe são mockados: o que estas provas investigam é o
   LAÇO — antirrepique, serialização e desligamento —, não a decodificação.
   Decodificar uma etiqueta de verdade é outro teste, e ele precisa de um
   navegador de verdade (ver `src/e2e.mjs`). */
const proximoCodigo = { valor: null as string | null };
const bipes: boolean[] = [];

vi.mock('./leitorDeEtiqueta', () => ({
  temCamera: () => true,
  montarLeitor: async () => async () => proximoCodigo.valor,
  criarBipe: () => (ok: boolean) => { bipes.push(ok); },
}));

import { LeitorDeEtiquetas } from './LeitorDeEtiquetas';

/** Uma câmera de mentira que sabe dizer se foi desligada. */
function camaraFalsa() {
  const parou = vi.fn();
  const track = { stop: parou, kind: 'video' };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  });
  return { parou, stream };
}

beforeEach(() => {
  proximoCodigo.valor = null;
  bipes.length = 0;
  /* jsdom não implementa nada disto, e sem os dois o laço nunca acha que
     tem um quadro para ler. */
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 640 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 480 });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('o leitor de etiquetas', () => {
  it('entrega cada leitura ao consumidor, com o código cru', async () => {
    camaraFalsa();
    const lidos: string[] = [];
    render(
      <LeitorDeEtiquetas
        aoLer={async (c) => { lidos.push(c); return { ok: true, texto: `contei ${c}` }; }}
        aoFechar={() => {}}
      />,
    );

    proximoCodigo.valor = '230076';
    await waitFor(() => expect(lidos).toContain('230076'), { timeout: 3000 });
    expect(await screen.findByText('contei 230076')).toBeTruthy();
    /* O som é a confirmação de quem não está olhando a tela. */
    expect(bipes).toContain(true);
  });

  it('NÃO conta dezenas de vezes a etiqueta parada na frente da lente', async () => {
    camaraFalsa();
    const lidos: string[] = [];
    render(
      <LeitorDeEtiquetas
        aoLer={async (c) => { lidos.push(c); return { ok: true, texto: 'ok' }; }}
        aoFechar={() => {}}
        intervaloRepetidoMs={5000}
      />,
    );

    /* A câmera vê o MESMO código em todos os quadros, sem parar. */
    proximoCodigo.valor = '230076';
    await waitFor(() => expect(lidos.length).toBe(1), { timeout: 3000 });
    /* Tempo de sobra para uns dez quadros passarem. */
    await new Promise((r) => setTimeout(r, 900));
    expect(lidos.length).toBe(1);
  });

  it('deixa contar a segunda unidade depois da janela passar', async () => {
    camaraFalsa();
    const lidos: string[] = [];
    render(
      <LeitorDeEtiquetas
        aoLer={async (c) => { lidos.push(c); return { ok: true, texto: 'ok' }; }}
        aoFechar={() => {}}
        /* Janela curta: a prova é que ela EXPIRA, não quanto ela dura. */
        intervaloRepetidoMs={120}
      />,
    );

    proximoCodigo.valor = '230076';
    await waitFor(() => expect(lidos.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    expect(lidos.every((c) => c === '230076')).toBe(true);
  });

  it('conta duas peças diferentes em sequência, sem esperar a janela', async () => {
    camaraFalsa();
    const lidos: string[] = [];
    render(
      <LeitorDeEtiquetas
        aoLer={async (c) => { lidos.push(c); return { ok: true, texto: 'ok' }; }}
        aoFechar={() => {}}
        intervaloRepetidoMs={60000}
      />,
    );

    proximoCodigo.valor = '230076';
    await waitFor(() => expect(lidos).toEqual(['230076']), { timeout: 3000 });
    /* Código DIFERENTE passa na hora: bipar duas peças em sequência rápida
       é o caso normal, e é o oposto do repique. */
    proximoCodigo.valor = '347801';
    await waitFor(() => expect(lidos).toEqual(['230076', '347801']), { timeout: 3000 });
  });

  it('não lê um quadro novo enquanto o anterior não respondeu', async () => {
    camaraFalsa();
    let emVoo = 0, maximo = 0;
    render(
      <LeitorDeEtiquetas
        aoLer={async () => {
          emVoo += 1; maximo = Math.max(maximo, emVoo);
          await new Promise((r) => setTimeout(r, 300));
          emVoo -= 1;
          return { ok: true, texto: 'ok' };
        }}
        aoFechar={() => {}}
        intervaloRepetidoMs={1}
      />,
    );

    proximoCodigo.valor = '230076';
    await new Promise((r) => setTimeout(r, 1200));
    /* Uma de cada vez. Sem isto, uma peça vira uma fila de gravações
       concorrentes sobre a mesma linha. */
    expect(maximo).toBe(1);
  });

  it('mostra a recusa do consumidor sem parar de ler', async () => {
    camaraFalsa();
    const lidos: string[] = [];
    render(
      <LeitorDeEtiquetas
        aoLer={async (c) => {
          lidos.push(c);
          return { ok: false, texto: `${c} não está no catálogo` };
        }}
        aoFechar={() => {}}
        intervaloRepetidoMs={100}
      />,
    );

    proximoCodigo.valor = '999999';
    expect(await screen.findByText('999999 não está no catálogo', {}, { timeout: 3000 })).toBeTruthy();
    expect(bipes).toContain(false);
    /* Código desconhecido é AVISO, não parada: a próxima peça continua
       sendo lida. */
    proximoCodigo.valor = '230076';
    await waitFor(() => expect(lidos).toContain('230076'), { timeout: 3000 });
  });

  it('não engole um erro lançado pelo consumidor', async () => {
    camaraFalsa();
    render(
      <LeitorDeEtiquetas
        aoLer={async () => { throw new Error('a rede caiu'); }}
        aoFechar={() => {}}
      />,
    );
    proximoCodigo.valor = '230076';
    expect(await screen.findByText('a rede caiu', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('para de ler quando pausado, e volta sem reabrir a câmera', async () => {
    const { parou } = camaraFalsa();
    const lidos: string[] = [];
    const props = {
      aoLer: async (c: string) => { lidos.push(c); return { ok: true, texto: 'ok' }; },
      aoFechar: () => {},
      intervaloRepetidoMs: 1,
    };
    const { rerender } = render(<LeitorDeEtiquetas {...props} pausado />);

    proximoCodigo.valor = '230076';
    await new Promise((r) => setTimeout(r, 700));
    expect(lidos.length).toBe(0);

    rerender(<LeitorDeEtiquetas {...props} pausado={false} />);
    await waitFor(() => expect(lidos.length).toBeGreaterThan(0), { timeout: 3000 });
    /* Pausar NÃO desliga a câmera — é isso que faz a retomada ser
       instantânea em vez de pedir permissão de novo. */
    expect(parou).not.toHaveBeenCalled();
  });

  it('DESLIGA a câmera de verdade ao fechar', async () => {
    const { parou } = camaraFalsa();
    const fechou = vi.fn();
    render(
      <LeitorDeEtiquetas
        aoLer={async () => ({ ok: true, texto: 'ok' })}
        aoFechar={fechou}
      />,
    );
    await screen.findByRole('button', { name: /Desligar a câmera/ });

    fireEvent.click(screen.getByRole('button', { name: /Desligar a câmera/ }));
    /* `stop()` em cada trilha é o que apaga a luz da câmera. Soltar só a
       referência deixaria a lente ligada. */
    expect(parou).toHaveBeenCalled();
    expect(fechou).toHaveBeenCalled();
  });

  it('DESLIGA a câmera quando a tela é desmontada sem passar pelo botão', async () => {
    const { parou } = camaraFalsa();
    const { unmount } = render(
      <LeitorDeEtiquetas aoLer={async () => ({ ok: true, texto: 'ok' })} aoFechar={() => {}} />,
    );
    await screen.findByRole('button', { name: /Desligar a câmera/ });
    unmount();
    await waitFor(() => expect(parou).toHaveBeenCalled());
  });

  it('a entrada manual usa o MESMO caminho da câmera', async () => {
    camaraFalsa();
    const lidos: string[] = [];
    render(
      <LeitorDeEtiquetas
        aoLer={async (c) => { lidos.push(c); return { ok: true, texto: `contei ${c}` }; }}
        aoFechar={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Código da etiqueta'), { target: { value: ' 230076 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Contar' }));
    await waitFor(() => expect(lidos).toEqual(['230076']));
    expect(await screen.findByText('contei 230076')).toBeTruthy();
    /* O campo esvazia para a próxima peça — quem digita cem códigos não
       deveria apagar o anterior cem vezes. */
    expect((screen.getByLabelText('Código da etiqueta') as HTMLInputElement).value).toBe('');
  });

  it('a entrada manual NÃO é freada pelo antirrepique', async () => {
    camaraFalsa();
    const lidos: string[] = [];
    render(
      <LeitorDeEtiquetas
        aoLer={async (c) => { lidos.push(c); return { ok: true, texto: 'ok' }; }}
        aoFechar={() => {}}
        intervaloRepetidoMs={60000}
      />,
    );

    const campo = screen.getByLabelText('Código da etiqueta');
    for (let i = 0; i < 3; i += 1) {
      fireEvent.change(campo, { target: { value: '230076' } });
      fireEvent.click(screen.getByRole('button', { name: 'Contar' }));
      await waitFor(() => expect(lidos.length).toBe(i + 1));
    }
    /* Quem digitou o mesmo código três vezes quis contar três unidades. O
       antirrepique existe contra a lente parada, não contra a pessoa. */
    expect(lidos).toEqual(['230076', '230076', '230076']);
  });

  it('explica a permissão negada em vez de ficar abrindo para sempre', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          const e = new Error('denied');
          e.name = 'NotAllowedError';
          throw e;
        }),
      },
    });
    render(
      <LeitorDeEtiquetas aoLer={async () => ({ ok: true, texto: 'ok' })} aoFechar={() => {}} />,
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/permissão da câmera/)).toBeTruthy();
    /* E a digitação continua disponível: sem câmera o trabalho não para. */
    expect(screen.getByLabelText('Código da etiqueta')).toBeTruthy();
  });
});
