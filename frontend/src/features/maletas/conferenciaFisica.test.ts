import { describe, expect, it } from 'vitest';
import { registrarConferenciaFisica } from './conferenciaFisica';

describe('conferência física do acerto', () => {
  it('conta duas unidades físicas do mesmo SKU em dois bipes intencionais', () => {
    const primeira = registrarConferenciaFisica({ '326660': 3 }, {}, '326660');
    const segunda = registrarConferenciaFisica({ '326660': 3 }, primeira.conferidos, '326660');

    expect(primeira).toMatchObject({ tipo: 'conferida', quantidade: 1, enviadas: 3 });
    expect(segunda).toMatchObject({ tipo: 'conferida', quantidade: 2, enviadas: 3 });
  });

  it('não ultrapassa a quantidade enviada', () => {
    const resultado = registrarConferenciaFisica({ '326660': 2 }, { '326660': 2 }, '326660');
    expect(resultado).toMatchObject({ tipo: 'completa', quantidade: 2, enviadas: 2 });
    expect(resultado.conferidos).toEqual({ '326660': 2 });
  });

  it('recusa SKU fora da maleta sem alterar a conferência', () => {
    const atual = { '326660': 1 };
    const resultado = registrarConferenciaFisica({ '326660': 3 }, atual, '999999');
    expect(resultado).toMatchObject({ tipo: 'fora_da_maleta', sku: '999999' });
    expect(resultado.conferidos).toBe(atual);
  });
});
