/** A tabela de rotas do Worker: os 142 contratos, todos aqui.
 *
 *  A ordem é a ordem de casamento, e é a mesma em que a corrente de `if` do
 *  despachante casava — o primeiro que bate responde. Rota pública é
 *  separada por `auth: 'sem-bearer'` e despachada antes da porta da chave;
 *  ver api/src/index.js.
 *
 *  Estes módulos são transporte. Regra de negócio mora no domínio, e nenhum
 *  handler daqui decide nada sozinho. */
import { rotas as publicas } from './publicas.js';
import { rotas as plataforma } from './plataforma.js';
import { rotas as estoque } from './estoque.js';
import { rotas as analytics } from './analytics.js';
import { rotas as catalogo } from './catalogo.js';
import { rotas as catalogoComandos } from './catalogo-comandos.js';
import { rotas as fotos } from './fotos.js';
import { rotas as galeria } from './galeria.js';
import { rotas as catalogoImportacao } from './catalogo-importacao.js';
import { rotas as maletas } from './maletas.js';
import { rotas as comercial } from './comercial.js';
import { rotas as operacao } from './operacao.js';
import { rotas as sincronizacao } from './sincronizacao.js';
import { rotas as vendas } from './vendas.js';

export const rotas = [
  ...publicas,
  ...plataforma,
  ...estoque,
  ...catalogo,
  ...catalogoComandos,
  ...fotos,
  ...galeria,
  ...catalogoImportacao,
  ...maletas,
  ...comercial,
  ...operacao,
  ...sincronizacao,
  ...vendas,
  ...analytics,
];
