import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PARIDADE, placar, type Capacidade } from './paridade';

/** A MATRIZ SE CONFERE SOZINHA.
 *
 *  Uma matriz de paridade escrita à mão vale até a primeira semana: alguém
 *  apaga um componente, ou marca uma linha como pronta porque "está quase", e
 *  o documento passa a mentir com a cara de quem está certo. Este arquivo
 *  impede as duas coisas:
 *
 *   1. toda capacidade `pronta` ou `parcial` aponta um arquivo QUE EXISTE e
 *      um trecho QUE ESTÁ LÁ. Apagar o Painel de Vendas quebra o teste;
 *   2. toda capacidade que NÃO é `pronta` explica por quê, em frase — e a
 *      frase de uma `indisponivel` tem de dizer o que falta no BACKEND, não
 *      o que falta de vontade.
 *
 *  O que ele deliberadamente NÃO faz é provar comportamento. Isso é dos
 *  testes de cada feature; aqui o que se prova é que a matriz corresponde ao
 *  repositório.
 */

const raiz = fileURLToPath(new URL('../../../', import.meta.url));

const todas: Capacidade[] = PARIDADE.flatMap((m) => m.capacidades);

describe('a matriz prototype → V2', () => {
  it('não tem id repetido — dois ids iguais escondem uma capacidade', () => {
    const ids = todas.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo módulo aponta a tela do protótipo que o governa', () => {
    for (const m of PARIDADE) {
      expect(m.prototipo, m.id).toMatch(/^\/prototype\//);
      expect(m.capacidades.length, `${m.id} sem capacidade nenhuma`).toBeGreaterThan(0);
    }
  });

  /* A âncora. Sem ela, "pronta" é opinião. */
  it('toda capacidade pronta ou parcial aponta código que existe', () => {
    const comProva = todas.filter((c) => c.estado === 'pronta' || c.estado === 'parcial');
    expect(comProva.length).toBeGreaterThan(40);

    for (const c of comProva) {
      expect(c.prova, `${c.id} diz "${c.estado}" e não aponta prova nenhuma`).toBeDefined();
      const caminho = raiz + (c.prova as { arquivo: string }).arquivo;
      expect(existsSync(caminho), `${c.id}: ${c.prova?.arquivo} não existe`).toBe(true);
      const fonte = readFileSync(caminho, 'utf8');
      expect(
        fonte.includes((c.prova as { contem: string }).contem),
        `${c.id}: "${c.prova?.contem}" não está em ${c.prova?.arquivo}`,
      ).toBe(true);
    }
  });

  /* Regra 9 do CLAUDE.md: o que o sistema decide não fazer é anunciado. */
  it('tudo que não está pronto diz por quê, com frase de gente', () => {
    for (const c of todas.filter((x) => x.estado !== 'pronta')) {
      expect(c.porque, `${c.id} não é "pronta" e não explica`).toBeTruthy();
      expect((c.porque as string).length, `${c.id}: explicação curta demais`)
        .toBeGreaterThan(40);
    }
  });

  /* Uma `indisponivel` é uma afirmação sobre o SERVIDOR. Se ela não citar
     nada do servidor, ela provavelmente é uma `pendente` disfarçada — e a
     diferença entre as duas é quem tem trabalho a fazer. */
  it('cada indisponível nomeia o que falta no backend', () => {
    const marcasDeBackend = [
      '/api/', 'backend', 'servidor', 'Worker', 'rota', 'INSERT', 'coluna',
      'schema', 'tabela', 'auth.js', 'D2', 'D6', 'D8', '§',
    ];
    for (const c of todas.filter((x) => x.estado === 'indisponivel')) {
      const texto = c.porque as string;
      expect(
        marcasDeBackend.some((m) => texto.includes(m)),
        `${c.id}: "indisponivel" sem citar o que falta no servidor`,
      ).toBe(true);
    }
  });

  /* A promessa que não pode ser quebrada sem decisão humana explícita. */
  it('publicar na loja real continua proibido, e a matriz o registra', () => {
    const publicar = todas.find((c) => c.id === 'nuvemshop.publicar');
    expect(publicar?.estado).toBe('indisponivel');
    expect(publicar?.porque).toContain('PROIBIDA');
  });

  /* Vendas é a prioridade declarada: as cinco superfícies do protótipo têm
     de estar presentes, não só a rota do módulo. */
  it('Vendas tem painel, lançamentos e os três lançamentos', () => {
    const vendas = PARIDADE.find((m) => m.id === 'vendas');
    const prontas = new Set(
      (vendas?.capacidades ?? []).filter((c) => c.estado === 'pronta').map((c) => c.id),
    );
    for (const id of [
      'vendas.painel', 'vendas.lancamentos',
      'vendas.normal', 'vendas.colar', 'vendas.saida',
      'vendas.historico', 'vendas.data-venda', 'vendas.data-pagamento',
      'vendas.revisao', 'vendas.desconto',
    ]) {
      expect(prontas.has(id), `Vendas sem "${id}" pronta`).toBe(true);
    }
  });

  it('o placar conta o que a régua honesta manda contar', () => {
    const p = placar();
    expect(p.total).toBe(todas.length);
    expect(p.pronta + p.parcial + p.pendente + p.indisponivel).toBe(p.total);
    /* `indisponivel` não conta contra o frontend: construí-la exigiria
       simular uma capacidade que o servidor não tem. */
    expect(p.suportadas).toBe(p.total - p.indisponivel);
    expect(p.entregues).toBe(p.pronta);
  });
});
