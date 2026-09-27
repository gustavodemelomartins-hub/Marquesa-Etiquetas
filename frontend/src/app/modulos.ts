import type { NomeIcone } from '../components/Icone';

/** Os módulos do Sistema Marquesa, e o menu que a usuária vê.
 *
 *  A regra que o menu serve: a usuária tem que saber, sem pensar, ONDE
 *  ESTOU, O QUE POSSO FAZER AQUI e PARA ONDE POSSO IR. Em 27/09/2026 a
 *  Sthefany achou o sistema confuso, e a auditoria mostrou por quê: eram
 *  treze itens, três deles levavam a uma tela "Em desenvolvimento", e
 *  Estoque, Catálogo e Nuvemshop se misturavam em abas que pulavam de um
 *  módulo para outro.
 *
 *  O menu agora é organizado pelo que ela FAZ, e cada coisa mora num lugar
 *  só:
 *
 *    Dia a dia  vender, a cliente, o dinheiro.
 *    Peças      a peça (estoque e cadastro juntos) e a loja online.
 *    Rede       quem leva peça nossa e o que volta de lá.
 *    Sistema    como a casa está configurada.
 *
 *  Os módulos FORA_DO_MENU continuam respondendo pelo endereço — link
 *  antigo não quebra —, mas não aparecem no menu: Catálogo virou parte de
 *  Peças, Notificações virou a lista de pendências do Início, Agenda já
 *  existe dentro de Revendedoras, e Etiquetas é um botão dentro de Peças.
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
  /** O módulo ainda não tem tela própria em React. Só vale para quem está
   *  FORA do menu: um item de menu que leva a "Em desenvolvimento" foi
   *  exatamente o que deixou o sistema confuso. */
  pendente?: boolean;
  /** A pergunta que o módulo responde. */
  pergunta?: string;
}

export interface GrupoModulos {
  titulo: string;
  modulos: Modulo[];
}

export const GRUPOS: GrupoModulos[] = [
  {
    titulo: 'Dia a dia',
    modulos: [
      { id: 'home', rotulo: 'Início', icone: 'home',
        pergunta: 'O que precisa de mim hoje?' },
      { id: 'vendas', rotulo: 'Vendas', icone: 'sale',
        pergunta: 'O que foi vendido, e para quem?' },
      { id: 'clientes', rotulo: 'Clientes', icone: 'people',
        pergunta: 'Como está a relação com esta cliente?' },
      { id: 'financeiro', rotulo: 'Financeiro', icone: 'money',
        pergunta: 'Quanto entrou e quanto ainda falta receber?' },
    ],
  },
  {
    titulo: 'Peças',
    modulos: [
      { id: 'estoque', rotulo: 'Peças', icone: 'box',
        pergunta: 'Onde está cada peça, quanto custa e como ela se chama?' },
      { id: 'nuvemshop', rotulo: 'Loja online', icone: 'cloud',
        pergunta: 'O que a loja mostra e o que falta publicar?' },
    ],
  },
  {
    titulo: 'Rede',
    modulos: [
      { id: 'revendedoras', rotulo: 'Revendedoras', icone: 'bag',
        pergunta: 'O que está circulando, com quem, e desde quando?' },
      { id: 'garantias', rotulo: 'Garantias', icone: 'shield',
        pergunta: 'O que está em andamento e o que espera uma ação nossa?' },
    ],
  },
  {
    titulo: 'Sistema',
    modulos: [
      { id: 'configuracoes', rotulo: 'Configurações', icone: 'settings',
        pergunta: 'Como a casa está configurada?' },
    ],
  },
];

/** Endereços que continuam valendo, mas que não são porta no menu. O
 *  `App` redireciona cada um para a tela que o substituiu. */
export const FORA_DO_MENU: Modulo[] = [
  { id: 'catalogo', rotulo: 'Peças', icone: 'tag' },
  { id: 'etiquetas', rotulo: 'Etiquetas', icone: 'label', pendente: true,
    pergunta: 'O que precisa ser impresso agora?' },
  { id: 'agenda', rotulo: 'Agenda', icone: 'calendar' },
  { id: 'notificacoes', rotulo: 'Pendências', icone: 'bell' },
];

export const MODULOS: Modulo[] = [...GRUPOS.flatMap((g) => g.modulos), ...FORA_DO_MENU];

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

/** O painel clássico, para o que ainda só existe lá (etiquetas e a
 *  resolução de algumas pendências). */
export const NO_PAINEL_CLASSICO = '../../dashboard.html';
