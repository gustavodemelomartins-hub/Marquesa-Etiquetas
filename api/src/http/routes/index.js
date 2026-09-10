/** Tabela de rotas já extraídas do despachante.
 *
 *  A ordem aqui é a ordem de casamento. Enquanto a migração não termina,
 *  o que não está nesta tabela continua sendo respondido pela corrente de
 *  `if` em `api/src/index.js` — e o 404 final continua sendo dela. */
import { rotas as plataforma } from './plataforma.js';
import { rotas as estoque } from './estoque.js';
import { rotas as analytics } from './analytics.js';
import { rotas as catalogo } from './catalogo.js';
import { rotas as comercial } from './comercial.js';
import { rotas as operacao } from './operacao.js';

export const rotas = [
  ...plataforma,
  ...estoque,
  ...catalogo,
  ...comercial,
  ...operacao,
  ...analytics,
];
