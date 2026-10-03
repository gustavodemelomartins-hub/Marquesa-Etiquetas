import { describe, expect, it } from 'vitest';
import {
  comRetentativa, estadoDe, interpretarLeitura, resumoDaConferencia, type Conferida,
} from './conferencia';

const linha = (extra: Partial<Conferida>): Conferida => ({
  sku: '100001', variacao: '', faltando: 0, contado: 6, esperado: 6, gravacao: 'salvo', ...extra,
});

describe('a conferência "bipou e marcha"', () => {
  it('um bipe sem falta é conferido; falta dita é "com falta"; ninguém bipou é "não conferido"', () => {
    expect(estadoDe(linha({}))).toBe('conferido');
    expect(estadoDe(linha({ faltando: 2, contado: 4 }))).toBe('com_falta');
    expect(estadoDe(undefined)).toBe('nao_conferido');
    expect(estadoDe(linha({ faltando: null, contado: 1, esperado: 0 }))).toBe('sobra');
  });

  it('o resumo conta referências, não unidades, e o não bipado é pendente — nunca falta', () => {
    const r = resumoDaConferencia(
      [{ sku: '100001' }, { sku: '100002' }, { sku: '100003' }, { sku: '200001' }],
      [
        linha({}),
        linha({ sku: '100002', faltando: 2, contado: 4 }),
        linha({ sku: '200001', variacao: 'Aro 16', faltando: 0, contado: 2, esperado: 2 }),
        linha({ sku: '200001', variacao: 'Aro 18', faltando: 1, contado: 0, esperado: 1, gravacao: 'salvando' }),
      ],
    );
    expect(r).toMatchObject({ conferidos: 1, comFalta: 2, pendentes: 1, pecasFaltando: 3, naoSalvos: 1 });
  });

  it('número de até três dígitos no leitor é a falta; etiqueta é código', () => {
    expect(interpretarLeitura(' 2 ')).toEqual({ tipo: 'falta', quantidade: 2 });
    expect(interpretarLeitura('263571')).toEqual({ tipo: 'codigo', codigo: '263571' });
    expect(interpretarLeitura('')).toEqual({ tipo: 'vazio' });
  });

  it('retentativa: rede e 5xx tentam de novo; recusa (4xx) volta na hora', async () => {
    let n = 0;
    const dormir = async () => {};
    expect(await comRetentativa(async () => { n += 1; if (n < 3) throw Object.assign(new Error('x'), { status: 0 }); return 'ok'; }, { dormir })).toBe('ok');
    expect(n).toBe(3);
    let m = 0;
    await expect(comRetentativa(async () => { m += 1; throw Object.assign(new Error('não'), { status: 409 }); }, { dormir })).rejects.toThrow('não');
    expect(m).toBe(1);
  });
});
