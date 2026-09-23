import { describe, it, expect } from 'vitest';
import { precisamDeAtencao } from './estoque';
import type { AppState, Product } from '../types/api';

const produto = (p: Partial<Product>): Product => ({
  sku: '100001', desc: 'Anel', cat: 'Anel', preco: 99, semPreco: false,
  qtd: 3, consignado: 0, disponivel: 3, status: 'ativo', visivel: null,
  ...p,
} as Product);

const estado = (produtos: Product[]) => ({ produtos } as unknown as AppState);

describe('quais produtos precisam de atenção', () => {
  it('peça completa não entra na fila', () => {
    expect(precisamDeAtencao(estado([
      produto({ fotoLojaUrl: 'https://cdn/x.jpg' }),
    ]))).toEqual([]);
  });

  /* A REGRESSÃO que este arquivo existe para não deixar voltar.

     `fotoStatus === 'sem_foto'` diz que não temos os BYTES no R2. Enquanto
     a conta responder 10042 e não houver R2, isso vale para quase todo o
     catálogo — e o KPI marcava 787 de 790 produtos. Um número verdadeiro
     e inútil numa fila de trabalho é o mesmo que um número errado.

     O que interessa é a peça que aparece VAZIA na tela. */
  it('ter só a foto da vitrine NÃO é estar sem foto', () => {
    const r = precisamDeAtencao(estado([
      produto({ fotoStatus: 'sem_foto', fotoLojaUrl: 'https://cdn/x.jpg' }),
    ]));
    expect(r).toEqual([]);
  });

  it('sem imagem nenhuma, entra — e diz que falta foto', () => {
    const r = precisamDeAtencao(estado([produto({ fotoStatus: 'sem_foto' })]));
    expect(r).toHaveLength(1);
    expect(r[0]!.falta).toEqual(['foto']);
  });

  it('sem preço e sem categoria entram, e as faltas se somam', () => {
    const r = precisamDeAtencao(estado([
      produto({ cat: '', preco: null, semPreco: true, fotoUrl: 'https://x/y.jpg' }),
    ]));
    expect(r[0]!.falta).toEqual(['categoria', 'preco']);
  });

  /* Código inativo não está à venda. Cobrar cadastro dele encheria a fila
     com trabalho que ninguém vai fazer. */
  it('produto inativo fica de fora', () => {
    expect(precisamDeAtencao(estado([
      produto({ status: 'inativo', cat: '', preco: null }),
    ]))).toEqual([]);
  });

  it('conta CÓDIGOS, não peças', () => {
    const r = precisamDeAtencao(estado([
      produto({ sku: 'A', qtd: 50, preco: null }),
      produto({ sku: 'B', qtd: 1, preco: null }),
    ]));
    expect(r).toHaveLength(2);
  });
});
