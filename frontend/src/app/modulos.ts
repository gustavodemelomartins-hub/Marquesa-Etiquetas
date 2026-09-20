import type { NomeIcone } from '../components/Icone';

/** Os treze módulos do Sistema Marquesa, na ordem e nos grupos da
 *  arquitetura de navegação V2 (`docs/ux/07-mapping/navigation-architecture-v2.md`).
 *
 *  A regra que o agrupamento serve: a usuária tem que saber, sem pensar,
 *  ONDE ESTOU, O QUE POSSO FAZER AQUI e PARA ONDE POSSO IR. Os grupos são
 *  o "para onde posso ir" — quatro blocos curtos batem uma lista de treze
 *  nomes, porque treze nomes viram uma parede que ninguém lê.
 *
 *    Operação  o dia acontecendo: o que vendeu, para quem, e quanto entrou.
 *    Produto   a peça e o patrimônio: onde está, como se chama, onde é publicada.
 *    Rede      quem carrega peça nossa e o que volta de lá.
 *    Sistema   o que o sistema avisa e o que a casa configura.
 */
export type ModuloId =
  | 'home' | 'vendas' | 'clientes' | 'financeiro'
  | 'estoque' | 'catalogo' | 'etiquetas' | 'nuvemshop'
  | 'revendedoras' | 'garantias'
  | 'agenda' | 'notificacoes' | 'configuracoes';

export interface Modulo {
  id: ModuloId;
  rotulo: string;
  icone: NomeIcone;
  /** O módulo já existe em React, ou ainda vive no painel clássico?
   *
   *  Um módulo pendente CONTINUA no trilho, e de propósito: esconder o que
   *  falta deixa o produto parecendo menor do que é e faz a usuária procurar
   *  em outro lugar o que ela sabe que existe. Ele aparece apagado, diz que
   *  ainda não migrou, e leva para onde a tarefa se resolve hoje. O que não
   *  se faz é desenhar uma tela vazia e chamar de pronta. */
  pendente?: boolean;
  /** A pergunta que o módulo responde. É o subtítulo da tela pendente e a
   *  régua do que entra nela quando ela for construída de verdade. */
  pergunta?: string;
}

export interface GrupoModulos {
  titulo: string;
  modulos: Modulo[];
}

export const GRUPOS: GrupoModulos[] = [
  {
    titulo: 'Operação',
    modulos: [
      { id: 'home', rotulo: 'Home', icone: 'home',
        pergunta: 'Como está a operação hoje?' },
      { id: 'vendas', rotulo: 'Vendas', icone: 'sale',
        pergunta: 'O que foi vendido, para quem, e o que ainda falta receber?' },
      { id: 'clientes', rotulo: 'Clientes', icone: 'people',
        pergunta: 'Como está a relação com esta cliente?' },
      { id: 'financeiro', rotulo: 'Financeiro', icone: 'money',
        pergunta: 'Quanto entrou e quanto ainda falta receber?' },
    ],
  },
  {
    titulo: 'Produto',
    modulos: [
      { id: 'estoque', rotulo: 'Estoque', icone: 'box',
        pergunta: 'Onde está o patrimônio e o que precisa de atenção?' },
      { id: 'catalogo', rotulo: 'Catálogo', icone: 'tag',
        pergunta: 'Como a peça se chama, quanto custa e onde ela aparece?' },
      { id: 'etiquetas', rotulo: 'Etiquetas', icone: 'label', pendente: true,
        pergunta: 'O que precisa ser impresso agora?' },
      { id: 'nuvemshop', rotulo: 'Nuvemshop', icone: 'cloud',
        pergunta: 'O que está pronto para publicar e o que travou?' },
    ],
  },
  {
    titulo: 'Rede',
    modulos: [
      { id: 'revendedoras', rotulo: 'Revendedoras', icone: 'bag',
        pergunta: 'O que está circulando, com quem, e desde quando?' },
      { id: 'garantias', rotulo: 'Garantias e reparos', icone: 'shield',
        pergunta: 'O que está em andamento e o que espera uma ação nossa?' },
    ],
  },
  {
    titulo: 'Sistema',
    modulos: [
      { id: 'agenda', rotulo: 'Agenda', icone: 'calendar', pendente: true,
        pergunta: 'O que vence, acerta ou fecha nos próximos dias?' },
      { id: 'notificacoes', rotulo: 'Notificações', icone: 'bell', pendente: true,
        pergunta: 'O que o sistema precisa me contar?' },
      { id: 'configuracoes', rotulo: 'Configurações', icone: 'settings',
        pergunta: 'Como a casa está configurada?' },
    ],
  },
];

export const MODULOS: Modulo[] = GRUPOS.flatMap((g) => g.modulos);

export function acharModulo(id: ModuloId): Modulo {
  const m = MODULOS.find((x) => x.id === id);
  if (!m) throw new Error(`Módulo desconhecido: ${id}`);
  return m;
}

export function grupoDe(id: ModuloId): string {
  const g = GRUPOS.find((x) => x.modulos.some((m) => m.id === id));
  return g ? g.titulo : '';
}

/** No telefone cabem quatro destinos e o menu — e são os quatro que a
 *  usuária abre todo dia, não os quatro primeiros da lista. */
export const NO_TELEFONE: ModuloId[] = ['home', 'vendas', 'clientes', 'estoque'];

/** Onde a tarefa de um módulo pendente se resolve hoje. O painel clássico
 *  continua sendo o sistema de verdade enquanto a migração não termina, e
 *  mandar a usuária para lá é mais honesto do que uma tela vazia. */
export const NO_PAINEL_CLASSICO = '../../dashboard.html';
