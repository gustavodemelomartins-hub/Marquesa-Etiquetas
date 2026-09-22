/** Geometria do gráfico: a mesma escala representa receitas e estornos reais. */
export function escalaDeVendas(valores: readonly number[]) {
  const finitos = valores.filter(Number.isFinite);
  const maior = Math.max(0, ...finitos);
  const menor = Math.min(0, ...finitos);
  const amplitude = Math.max(1, maior - menor);
  const ordem = 10 ** Math.floor(Math.log10(amplitude / 4));
  const bruto = amplitude / 4 / ordem;
  const passo = (bruto <= 1 ? 1 : bruto <= 2 ? 2 : bruto <= 5 ? 5 : 10) * ordem;
  const teto = maior > 0 ? Math.ceil(maior / passo) * passo : (menor === 0 ? passo : 0);
  const piso = menor < 0 ? Math.floor(menor / passo) * passo : 0;
  const faixa = teto - piso;
  const marcas = Array.from({ length: Math.round(faixa / passo) + 1 }, (_, i) => teto - i * passo);

  return {
    teto,
    piso,
    marcas,
    posicaoZero: (teto / faixa) * 100,
    barra(valor: number) {
      if (!Number.isFinite(valor)) return null;
      return {
        topo: ((teto - Math.max(valor, 0)) / faixa) * 100,
        altura: (Math.abs(valor) / faixa) * 100,
        negativa: valor < 0,
      };
    },
  };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function rotuloDaBarra(chave: string) {
  const mes = /^(\d{4})-(\d{2})$/.exec(chave);
  if (mes) {
    const indice = Number(mes[2]) - 1;
    if (indice >= 0 && indice < 12) return `${MESES[indice] ?? ''} ${(mes[1] ?? '').slice(2)}`;
  }
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chave);
  return dia ? `${dia[3]}/${dia[2]}` : chave;
}

export function rotuloDaEscala(valor: number) {
  return `R$ ${new Intl.NumberFormat('pt-BR', {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(valor)}`;
}
