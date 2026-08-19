import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { linhasDoArquivo, parseLinhas, parsePlanilha } from './parsePlanilha';

describe('parseLinhas — reconhecimento de cabeçalho e coluna', () => {
  it('acha SKU/Descrição/Quantidade/Preço por qualquer um dos apelidos conhecidos', () => {
    const linhas = [
      ['Id Produto', 'Nome Produto', 'Estoque Atual', 'Valor de Venda'],
      ['43821', 'Brinco Argola', '4', '89,90'],
    ];
    const r = parseLinhas(linhas, 'planilha.xlsx');
    expect(r.semColunaSku).toBe(false);
    expect(r.produtos).toEqual([
      { sku: '43821', desc: 'Brinco Argola', cat: 'Brinco', preco: 89.9, qtd: 4 },
    ]);
  });

  it('sem coluna reconhecível de SKU, marca semColunaSku e não produz nada', () => {
    const linhas = [
      ['Coluna A', 'Coluna B'],
      ['x', 'y'],
    ];
    const r = parseLinhas(linhas, 'estranho.xlsx');
    expect(r.semColunaSku).toBe(true);
    expect(r.produtos).toEqual([]);
  });

  it('cabeçalho pode não estar na primeira linha', () => {
    const linhas = [
      ['Planilha Agosto'],
      [],
      ['SKU', 'Descrição', 'Qtd', 'Preço'],
      ['100', 'Colar Simples', '2', '50'],
    ];
    const r = parseLinhas(linhas, 'planilha.xlsx');
    expect(r.produtos).toEqual([{ sku: '100', desc: 'Colar Simples', cat: 'Colar', preco: 50, qtd: 2 }]);
  });
});

describe('parseLinhas — consolidação de sufixo de remessa', () => {
  it('soma "120029" e "120029-2" no código base', () => {
    const linhas = [
      ['SKU', 'Descrição', 'Qtd'],
      ['120029', 'Anel Solitário', '3'],
      ['120029-2', 'Anel Solitário', '2'],
    ];
    const r = parseLinhas(linhas, 'p.xlsx');
    expect(r.produtos).toEqual([{ sku: '120029', desc: 'Anel Solitário', cat: 'Anel', preco: 0, qtd: 5 }]);
    expect(r.sufixosSomados).toEqual(['120029-2']);
  });

  it('descrição divergente entre sufixo e base vira conflito reportado, mas soma assim mesmo', () => {
    const linhas = [
      ['SKU', 'Descrição', 'Qtd'],
      ['200', 'Pulseira Fina', '1'],
      ['200-2', 'Pulseira Grossa', '1'],
    ];
    const r = parseLinhas(linhas, 'p.xlsx');
    expect(r.produtos).toEqual([{ sku: '200', desc: 'Pulseira Fina', cat: 'Pulseira', preco: 0, qtd: 2 }]);
    expect(r.conflitosDescricao).toEqual([
      { sku: '200', descricaoBase: 'Pulseira Fina', descricaoLinha: 'Pulseira Grossa', bruto: '200-2' },
    ]);
  });

  it('linha com SKU vazio é ignorada, não vira produto', () => {
    const linhas = [
      ['SKU', 'Descrição', 'Qtd'],
      ['', 'Sem código', '1'],
      ['300', 'Berloque Estrela', '1'],
    ];
    const r = parseLinhas(linhas, 'p.xlsx');
    expect(r.produtos).toEqual([{ sku: '300', desc: 'Berloque Estrela', cat: 'Berloque', preco: 0, qtd: 1 }]);
  });
});

describe('parseLinhas — categorização automática', () => {
  it.each([
    ['Colar Veneziano', 'Colar'],
    ['Brinco Argola Pequena', 'Brinco'],
    ['Argola Grande', 'Argola'],
    ['Pulseira Riviera', 'Pulseira'],
    ['Berloque Coração', 'Berloque'],
    ['Anel Solitário', 'Anel'],
    ['Pingente Cruz', 'Pingente'],
    ['Conjunto Casamento', 'Conjunto'],
    ['Chaveiro Estranho', 'Outros'],
  ])('"%s" → %s', (desc, catEsperada) => {
    const linhas = [
      ['SKU', 'Descrição', 'Qtd'],
      ['1', desc, '1'],
    ];
    const r = parseLinhas(linhas, 'p.xlsx');
    expect(r.produtos[0]?.cat).toBe(catEsperada);
  });
});

describe('parseLinhas — números em formato brasileiro', () => {
  it('preço com milhar e centavo', () => {
    const linhas = [
      ['SKU', 'Descrição', 'Qtd', 'Preço'],
      ['1', 'Colar Caro', '1', '1.250,90'],
    ];
    const r = parseLinhas(linhas, 'p.xlsx');
    expect(r.produtos[0]?.preco).toBeCloseTo(1250.9);
  });

  it('quantidade com lixo textual ainda extrai o número', () => {
    const linhas = [
      ['SKU', 'Descrição', 'Qtd'],
      ['1', 'Colar', '7 un'],
    ];
    const r = parseLinhas(linhas, 'p.xlsx');
    expect(r.produtos[0]?.qtd).toBe(7);
  });
});

describe('parsePlanilha / linhasDoArquivo — integração real com XLSX', () => {
  it('lê um arquivo .xlsx de verdade, gerado com a mesma lib', async () => {
    const wb = XLSX.utils.book_new();
    const aba = XLSX.utils.aoa_to_sheet([
      ['SKU', 'Descrição', 'Qtd', 'Preço'],
      ['500', 'Colar Teste', '9', '120'],
    ]);
    XLSX.utils.book_append_sheet(wb, aba, 'Estoque');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

    const linhas = linhasDoArquivo(buf, 'estoque.xlsx');
    const r = parseLinhas(linhas, 'estoque.xlsx');
    expect(r.produtos).toEqual([{ sku: '500', desc: 'Colar Teste', cat: 'Colar', preco: 120, qtd: 9 }]);

    const arquivo = new File([buf], 'estoque.xlsx');
    const r2 = await parsePlanilha(arquivo);
    expect(r2.produtos).toEqual(r.produtos);
  });

  it('lê CSV com separador ; (export comum da Nuvemshop)', async () => {
    const csv = 'SKU;Descrição;Qtd\n700;Anel CSV;5\n';
    const buf = new TextEncoder().encode(csv).buffer;
    const linhas = linhasDoArquivo(buf, 'export.csv');
    const r = parseLinhas(linhas, 'export.csv');
    expect(r.produtos).toEqual([{ sku: '700', desc: 'Anel CSV', cat: 'Anel', preco: 0, qtd: 5 }]);
  });
});
