/** MATRIZ PROTÓTIPO → V2
 *  ===========================================================================
 *
 *  O protótipo em `docs/ux/prototype/` é referência visual; o contrato real governa comportamento e dados. Esta folha diz,
 *  capacidade a capacidade, o que a V2 real faz com ela — e `paridade.test.ts`
 *  CONFERE cada linha contra o código, para que a matriz não vire um documento
 *  que envelhece sozinho.
 *
 *  POR QUE CAPACIDADE E NÃO ROTA. Uma matriz de rotas dá 13 de 13 com Vendas
 *  sendo uma tabela: a rota existe, e o Painel, os Lançamentos, o Monte seu
 *  Colar e a Saída não. O que a usuária reconhece é o que ela CONSEGUE FAZER,
 *  então é isso que a matriz conta.
 *
 *  OS QUATRO ESTADOS, e a diferença entre eles importa:
 *
 *    pronta        existe na V2, sobre contrato real, e a prova aponta onde.
 *    parcial       existe, e falta uma parte nomeada. `porque` diz qual.
 *    pendente      o protótipo tem, o backend tem, a V2 ainda não construiu.
 *    indisponivel  o backend NÃO sustenta. `porque` diz o que falta lá, e a
 *                  tela diz isso à usuária em vez de simular.
 *
 *  `indisponivel` nunca é vergonha e nunca é desculpa: é a regra 9 do
 *  CLAUDE.md — o que o sistema decide não fazer é anunciado, nunca engolido.
 *  Uma capacidade só sai de `indisponivel` quando o BACKEND muda, nunca
 *  porque a tela aprendeu a fingir.
 *
 *  A PROVA. Cada capacidade `pronta` ou `parcial` aponta um arquivo e um
 *  trecho que tem de existir nele. Não é um teste de comportamento — esses
 *  moram nos arquivos de cada feature — é uma âncora: se alguém apagar o
 *  Painel de Vendas, a matriz para de dizer que ele existe.
 */

export type EstadoDaCapacidade = 'pronta' | 'parcial' | 'pendente' | 'indisponivel';

export interface Capacidade {
  id: string;
  rotulo: string;
  estado: EstadoDaCapacidade;
  /** Obrigatório em tudo que não é `pronta`. Diz o que falta, e onde. */
  porque?: string;
  /** Onde está, e o trecho que prova. Obrigatório em `pronta` e `parcial`. */
  prova?: { arquivo: string; contem: string };
  /** A rota da V2 em que a capacidade vive. */
  rota?: string;
}

export interface ModuloDeParidade {
  id: string;
  rotulo: string;
  /** A tela do protótipo usada como referência visual desta linha. */
  prototipo: string;
  capacidades: Capacidade[];
}

const F = 'frontend/src';

export const PARIDADE: ModuloDeParidade[] = [
  /* ═══════════════════════════════════════════════════════════════ VENDAS */
  {
    id: 'vendas',
    rotulo: 'Vendas',
    prototipo: '/prototype/vendas/',
    capacidades: [
      {
        id: 'vendas.painel', rotulo: 'Painel de vendas', estado: 'pronta', rota: '#/vendas',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'Painel de vendas' },
      },
      {
        id: 'vendas.periodo', rotulo: 'Filtro de período e intervalo livre', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'FiltroPeriodo' },
      },
      {
        id: 'vendas.faturamento', rotulo: 'Faturamento do período', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'Faturamento recebido no período' },
      },
      {
        id: 'vendas.neste-mes', rotulo: 'Neste mês', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'Neste mês' },
      },
      {
        id: 'vendas.a-receber', rotulo: 'A receber no mês', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'A receber em' },
      },
      {
        id: 'vendas.reparos', rotulo: 'Alerta de reparos ativos', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'aoAbrirReparos' },
      },
      {
        id: 'vendas.evolucao', rotulo: 'Evolução por mês, clicável', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'GraficoDeEvolucao' },
      },
      {
        id: 'vendas.analise', rotulo: 'Análise detalhada: produtos, categorias, origem', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'AnaliseDetalhada' },
      },
      {
        id: 'vendas.mes', rotulo: 'Resumo do mês selecionado', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'EvolucaoPorMes' },
      },
      {
        id: 'vendas.tendencia', rotulo: 'Variação contra o período anterior', estado: 'indisponivel',
        porque: '§19 — `analytics.js › painel()` não calcula o período anterior, e '
          + 'recusa explicitamente inventar um percentual. A tela diz isso no rodapé '
          + 'do cartão de faturamento em vez de desenhar uma seta.',
        prova: { arquivo: `${F}/features/vendas/PainelVendas.tsx`, contem: 'SEM_TENDENCIA' },
      },
      {
        id: 'vendas.lancamentos',
        rotulo: 'Lançamentos: as três portas, na mesma tela', estado: 'pronta',
        rota: '#/vendas/lancamentos',
        prova: { arquivo: `${F}/features/vendas/Lancamentos.tsx`, contem: 'Novo lançamento' },
      },
      {
        id: 'vendas.seletor',
        rotulo: 'Trocar de modo sem sair da tela', estado: 'pronta',
        prova: {
          arquivo: `${F}/features/vendas/Lancamentos.tsx`,
          contem: 'export function SeletorDeLancamento',
        },
      },
      {
        id: 'vendas.normal', rotulo: 'Venda normal', estado: 'pronta', rota: '#/vendas/nova',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Itens da venda' },
      },
      {
        id: 'vendas.passos', rotulo: 'Itens → Cliente → Pagamento, em passos', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'PainelDoPasso' },
      },
      {
        id: 'vendas.busca-produto', rotulo: 'Busca de produto por nome e SKU', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Buscar peça' },
      },
      {
        id: 'vendas.camera', rotulo: 'Leitura da etiqueta pela câmera', estado: 'pendente',
        porque: 'O protótipo abre a câmera traseira para ler o código. Não há '
          + 'decodificador de código de barras no bundle da V2, e o campo de busca '
          + 'já aceita o código bipado por leitor físico — que é como a operação '
          + 'funciona hoje.',
      },
      {
        id: 'vendas.desconto', rotulo: 'Preço cobrado e motivo do desconto', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Motivo do preço diferente' },
      },
      {
        id: 'vendas.cliente-busca', rotulo: 'Busca de cliente na venda', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Buscar cliente' },
      },
      {
        id: 'vendas.cadastro-rapido', rotulo: 'Cadastro rápido de cliente', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'CadastroRapido' },
      },
      {
        id: 'vendas.data-venda', rotulo: 'Data da venda, separada', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Data da venda' },
      },
      {
        id: 'vendas.data-pagamento', rotulo: 'Data efetiva do pagamento, separada', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Data efetiva do pagamento' },
      },
      {
        id: 'vendas.tres-datas', rotulo: 'Venda ≠ pagamento ≠ registro, na revisão', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'hoje — guardado pelo servidor' },
      },
      {
        id: 'vendas.canal', rotulo: 'Local ou canal da venda', estado: 'indisponivel',
        porque: '`INSERT INTO vendas` em `vendas-comandos.js` grava '
          + "`origem = 'balcao'` fixo, e `registrarVenda` não aceita canal nem "
          + 'origem. O canal que aparece no histórico vem da planilha importada. '
          + 'A tela diz isso no passo do cliente.',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Local ou canal' },
      },
      {
        id: 'vendas.pagamentos-multiplos', rotulo: 'Vários recebimentos numa venda', estado: 'indisponivel',
        porque: '§29 — a quitação é INTEGRAL: `POST /api/vendas/:id/pagamento` '
          + 'quita a venda inteira. Recebimento em partes é a decisão D2, que '
          + 'continua fechada. A tela mostra um recebimento e explica a limitação.',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Um recebimento, não vários' },
      },
      {
        id: 'vendas.revisao', rotulo: 'Revisão antes de confirmar', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/NovaVenda.tsx`, contem: 'Confira antes de confirmar' },
      },
      {
        id: 'vendas.colar', rotulo: 'Monte seu Colar', estado: 'pronta', rota: '#/vendas/colar',
        prova: { arquivo: `${F}/features/vendas/MonteSeuColar.tsx`, contem: 'Monte seu Colar' },
      },
      {
        id: 'vendas.colar-composicao', rotulo: 'Composição por grupo, com corrente fixa', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/MonteSeuColar.tsx`, contem: 'Corrente incluída automaticamente' },
      },
      {
        id: 'vendas.colar-desligado', rotulo: 'Colar bloqueado quando a feature está desligada', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/colar.ts`, contem: 'PERSONALIZACAO_DESATIVADA' },
      },
      {
        id: 'vendas.colar-preco', rotulo: 'Preço final editável no colar', estado: 'indisponivel',
        porque: 'O servidor recusa: `prepararPersonalizacoes` compara o preço '
          + 'pedido com o da configuração e devolve 409 com o valor certo na '
          + 'mensagem. Um campo que sempre volta recusado é pior que campo nenhum, '
          + 'então ele não existe — e a tela diz por quê.',
        prova: { arquivo: `${F}/features/vendas/MonteSeuColar.tsx`, contem: 'preço é da configuração' },
      },
      {
        id: 'vendas.saida', rotulo: 'Saída sem faturamento, dentro de Lançamentos', estado: 'pronta',
        rota: '#/vendas/saida',
        prova: { arquivo: `${F}/features/vendas/VendasArea.tsx`, contem: "atual === 'saida'" },
      },
      {
        id: 'vendas.historico', rotulo: 'Histórico de vendas', estado: 'pronta', rota: '#/vendas/historico',
        prova: { arquivo: `${F}/features/vendas/HistoricoVendas.tsx`, contem: 'Histórico de vendas' },
      },
      {
        id: 'vendas.historico-itens', rotulo: 'Abrir os itens de uma venda', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/HistoricoVendas.tsx`, contem: 'ver itens' },
      },
      {
        id: 'vendas.receber', rotulo: 'Marcar recebida com a data efetiva', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/HistoricoVendas.tsx`, contem: 'Em que dia o dinheiro entrou' },
      },
      {
        id: 'vendas.cancelar', rotulo: 'Cancelar venda, devolvendo a peça', estado: 'pronta',
        prova: { arquivo: `${F}/features/vendas/HistoricoVendas.tsx`, contem: 'cancelarVenda' },
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════ CLIENTES */
  {
    id: 'clientes',
    rotulo: 'Clientes',
    prototipo: '/prototype/clientes/',
    capacidades: [
      {
        id: 'clientes.lista', rotulo: 'Lista com busca no servidor', estado: 'pronta', rota: '#/clientes',
        prova: { arquivo: `${F}/features/clientes/ListaClientes.tsx`, contem: 'export function ListaClientes' },
      },
      {
        id: 'clientes.cadastro', rotulo: 'Cadastro e edição', estado: 'pronta',
        prova: { arquivo: `${F}/features/clientes/FormCliente.tsx`, contem: 'export function FormCliente' },
      },
      {
        id: 'clientes.perfil', rotulo: 'Ficha da cliente', estado: 'pronta', rota: '#/clientes/<id>',
        prova: { arquivo: `${F}/features/clientes/PerfilCliente.tsx`, contem: 'Ficha da cliente' },
      },
      {
        id: 'clientes.tres-numeros', rotulo: 'Comprou · Pago · Em aberto', estado: 'pronta',
        prova: { arquivo: `${F}/features/clientes/PerfilCliente.tsx`, contem: 'Os três números' },
      },
      {
        id: 'clientes.tres-datas', rotulo: 'Três datas, três significados', estado: 'pronta',
        prova: { arquivo: `${F}/features/clientes/PerfilCliente.tsx`, contem: 'Três datas, três significados' },
      },
      {
        id: 'clientes.financeiro', rotulo: 'O que falta receber', estado: 'pronta',
        prova: { arquivo: `${F}/features/clientes/PerfilCliente.tsx`, contem: 'O que falta receber' },
      },
      {
        id: 'clientes.credito', rotulo: 'Saldo e extrato de crédito', estado: 'pronta',
        prova: { arquivo: `${F}/features/clientes/PerfilCliente.tsx`, contem: 'Extrato' },
      },
      {
        id: 'clientes.garantias', rotulo: 'Garantias, trocas e reparos da cliente', estado: 'pronta',
        prova: { arquivo: `${F}/features/clientes/PerfilCliente.tsx`, contem: 'Nenhuma garantia registrada' },
      },
      {
        id: 'clientes.atividade', rotulo: 'Linha do tempo de tudo o que aconteceu', estado: 'pronta',
        prova: { arquivo: `${F}/features/clientes/PerfilCliente.tsx`, contem: 'Tudo o que aconteceu' },
      },
      {
        id: 'clientes.nova-venda', rotulo: 'Nova venda para esta cliente', estado: 'pronta',
        prova: { arquivo: `${F}/app/App.tsx`, contem: 'aoNovaVenda' },
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════ FINANCEIRO */
  {
    id: 'financeiro',
    rotulo: 'Financeiro',
    prototipo: '/prototype/financeiro/',
    capacidades: [
      {
        id: 'financeiro.resumo', rotulo: 'Resumo do período', estado: 'pronta', rota: '#/financeiro',
        prova: { arquivo: `${F}/features/financeiro/FinanceiroArea.tsx`, contem: "id: 'resumo'" },
      },
      {
        id: 'financeiro.periodo', rotulo: 'Período e intervalo livre, no endereço', estado: 'pronta',
        prova: { arquivo: `${F}/features/financeiro/FinanceiroArea.tsx`, contem: 'subDoRecorte' },
      },
      {
        id: 'financeiro.a-receber', rotulo: 'A receber, com vencimento', estado: 'pronta',
        prova: { arquivo: `${F}/features/financeiro/AReceber.tsx`, contem: 'export function AReceber' },
      },
      {
        id: 'financeiro.receber', rotulo: 'Receber com a data efetiva', estado: 'pronta',
        prova: { arquivo: `${F}/features/financeiro/api.ts`, contem: 'receberConta' },
      },
      {
        id: 'financeiro.prazo', rotulo: 'Definir vencimento', estado: 'pronta',
        prova: { arquivo: `${F}/features/financeiro/api.ts`, contem: 'definirPrazo' },
      },
      {
        id: 'financeiro.desfazer', rotulo: 'Desfazer pagamento, com motivo', estado: 'pronta',
        prova: { arquivo: `${F}/features/financeiro/api.ts`, contem: 'desfazerPagamento' },
      },
      {
        id: 'financeiro.saidas', rotulo: 'Saiu sem faturar', estado: 'pronta',
        prova: { arquivo: `${F}/features/financeiro/FinanceiroArea.tsx`, contem: 'SaiuSemFaturar' },
      },
      {
        id: 'financeiro.conferencia', rotulo: 'Conferência da razão do dinheiro', estado: 'pronta',
        prova: { arquivo: `${F}/features/financeiro/api.ts`, contem: 'conferirFinanceiro' },
      },
      {
        id: 'financeiro.recebimento-parcial', rotulo: 'Recebimento parcial de uma conta', estado: 'indisponivel',
        porque: 'O backend quita a conta INTEIRA (`marcarContaPaga`). Parcial é a '
          + 'decisão D2, ainda fechada. Está dito no próprio adaptador.',
        prova: { arquivo: `${F}/features/financeiro/api.ts`, contem: 'Não existe recebimento PARCIAL' },
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════════ ESTOQUE */
  {
    id: 'estoque',
    rotulo: 'Estoque',
    prototipo: '/prototype/estoque/',
    capacidades: [
      {
        id: 'estoque.painel', rotulo: 'Painel do estoque', estado: 'pronta', rota: '#/estoque',
        prova: { arquivo: `${F}/features/estoque-total/PainelEstoque.tsx`, contem: 'export function PainelEstoque' },
      },
      {
        id: 'estoque.total-casa-rua', rotulo: 'Total · em casa · com revendedoras', estado: 'pronta',
        prova: { arquivo: `${F}/features/estoque-total/PainelEstoque.tsx`, contem: 'Com revendedoras' },
      },
      {
        id: 'estoque.patrimonio', rotulo: 'Onde está o patrimônio: casa · revendedoras · loja',
        estado: 'pronta',
        prova: { arquivo: `${F}/features/estoque-total/PainelEstoque.tsx`, contem: 'Onde está o patrimônio' },
      },
      {
        id: 'estoque.categorias', rotulo: 'Principais categorias, por quantidade', estado: 'pronta',
        prova: { arquivo: `${F}/features/estoque-total/PainelEstoque.tsx`, contem: 'Principais categorias' },
      },
      {
        id: 'estoque.atencao', rotulo: 'Precisam de atenção: sem foto, categoria ou preço',
        estado: 'pronta',
        prova: { arquivo: `${F}/domain/estoque.ts`, contem: 'export function precisamDeAtencao' },
      },
      {
        id: 'estoque.pecas', rotulo: 'Peças, com filtro', estado: 'pronta', rota: '#/estoque/pecas',
        prova: { arquivo: `${F}/features/estoque/PecasArea.tsx`, contem: 'export function PecasArea' },
      },
      {
        id: 'estoque.movimentos', rotulo: 'A razão de uma peça, movimento a movimento', estado: 'pronta',
        prova: { arquivo: `${F}/features/estoque/PecasArea.tsx`, contem: '/movimentos' },
      },
      {
        id: 'estoque.planilha', rotulo: 'Atualizar Estoque Total por planilha, com diff', estado: 'pronta',
        prova: { arquivo: `${F}/features/estoque-total/EstoqueTotalPage.tsx`, contem: 'export function EstoqueTotalPage' },
      },
      {
        id: 'estoque.saidas', rotulo: 'Saiu sem faturar', estado: 'pronta', rota: '#/estoque/saidas',
        prova: { arquivo: `${F}/features/saidas/SaidasArea.tsx`, contem: 'Saiu sem faturar' },
      },
      {
        id: 'estoque.custo', rotulo: 'Custo e margem da peça', estado: 'indisponivel',
        porque: 'D6 — não há coluna de custo em `produtos`, e nenhuma rota devolve '
          + 'uma. Um valor de estoque calculado sobre preço de VENDA não é '
          + 'patrimônio, e chamá-lo assim seria inventar um número de balanço.',
      },
      {
        id: 'estoque.saude', rotulo: 'Indicador de saúde do estoque', estado: 'indisponivel',
        porque: 'D8 — "saúde" exigiria giro, cobertura e ponto de reposição, e '
          + 'nenhum dos três é calculado pelo servidor. Um semáforo verde sem conta '
          + 'atrás é pior que semáforo nenhum.',
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════ INVENTÁRIO */
  {
    id: 'inventario',
    rotulo: 'Inventário',
    prototipo: '/prototype/estoque/#inventario',
    capacidades: [
      {
        id: 'inventario.abrir', rotulo: 'Abrir contagem', estado: 'pronta', rota: '#/estoque/inventario',
        prova: { arquivo: `${F}/features/inventario/InventarioArea.tsx`, contem: "'POST', '/api/inventarios'" },
      },
      {
        id: 'inventario.contar', rotulo: 'Contar peça a peça', estado: 'pronta',
        prova: { arquivo: `${F}/features/inventario/InventarioArea.tsx`, contem: '/itens' },
      },
      {
        id: 'inventario.desfazer', rotulo: 'Desfazer contagem — voltar a não contado', estado: 'pronta',
        prova: { arquivo: `${F}/features/inventario/InventarioArea.tsx`, contem: 'não contado' },
      },
      {
        id: 'inventario.pausar', rotulo: 'Pausar e continuar', estado: 'pronta',
        prova: { arquivo: `${F}/features/inventario/InventarioArea.tsx`, contem: 'pausar' },
      },
      {
        id: 'inventario.concluir', rotulo: 'Concluir e congelar o retrato', estado: 'pronta',
        prova: { arquivo: `${F}/features/inventario/InventarioArea.tsx`, contem: 'concluir' },
      },
      {
        id: 'inventario.resultado', rotulo: 'Resultado: faltando, sobrando, não conferido, não comparável',
        estado: 'pronta',
        prova: { arquivo: `${F}/features/inventario/resultado.ts`, contem: 'naoComparavel' },
      },
      {
        id: 'inventario.ajustar', rotulo: 'Aplicar os ajustes escolhidos', estado: 'pronta',
        prova: { arquivo: `${F}/features/inventario/resultado.ts`, contem: 'aplicarAjustes' },
      },
      {
        id: 'inventario.zero-explicito', rotulo: 'Zero explícito ≠ não contado', estado: 'pronta',
        prova: { arquivo: `${F}/features/inventario/resultado.ts`, contem: 'não contado não é zero' },
      },
      {
        id: 'inventario.historico', rotulo: 'Histórico de contagens', estado: 'pronta',
        prova: { arquivo: `${F}/features/inventario/InventarioArea.tsx`, contem: "'GET', '/api/inventarios'" },
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════ CATÁLOGO */
  {
    id: 'catalogo',
    rotulo: 'Catálogo',
    prototipo: '/prototype/catalogo/',
    capacidades: [
      {
        id: 'catalogo.lista', rotulo: 'Produtos com busca e filtro', estado: 'pronta', rota: '#/catalogo',
        prova: { arquivo: `${F}/features/catalogo/CatalogoArea.tsx`, contem: 'Buscar no catálogo' },
      },
      {
        id: 'catalogo.editar', rotulo: 'Editar nome, preço, categoria e situação', estado: 'pronta',
        prova: { arquivo: `${F}/features/catalogo/CatalogoArea.tsx`, contem: 'Editar peça' },
      },
      {
        id: 'catalogo.fotos', rotulo: 'Galeria de fotos da peça', estado: 'indisponivel',
        porque: 'As rotas de gerir a galeria existem (`GET/POST '
          + '/api/produtos/:sku/galeria`, ordem, principal, aprovar), mas NENHUMA '
          + 'ROTA SERVE OS BYTES dela: `/api/produtos/:sku/foto/:versao` lê '
          + '`produtos.foto_original_key`/`foto_tratada_key`, e as fotos da galeria '
          + 'moram em `produto_fotos.original_key`/`preparada_key`, sem link '
          + 'assinado que um `<img>` possa abrir. Uma galeria que lista e não '
          + 'mostra imagem é pior que nenhuma. Destravar isto é uma rota nova no '
          + 'servidor, não uma tela.',
      },
      {
        id: 'catalogo.variacoes', rotulo: 'Variações da peça, com o saldo de cada uma',
        estado: 'pronta',
        prova: { arquivo: `${F}/features/catalogo/PainelDeVariacoes.tsx`, contem: 'Variações da peça' },
      },
      {
        id: 'catalogo.variacoes-distribuir', rotulo: 'Distribuir o saldo entre variações',
        estado: 'pronta',
        prova: { arquivo: `${F}/features/catalogo/variacoes.ts`, contem: 'distribuir' },
      },
      {
        id: 'catalogo.variacoes-estrutura', rotulo: 'Redefinir a estrutura de variações',
        estado: 'pendente',
        porque: '`PUT /api/produtos/:sku/variacoes` existe e REESCREVE saldo: uma '
          + 'variação que deixa de existir devolve o saldo dela para "sem '
          + 'variação", e desvincular da Nuvemshop para a sincronização da peça '
          + 'inteira. É Classe C com efeito em peça física, e a V2 mostra a '
          + 'estrutura sem oferecer o botão que a reescreve.',
      },
      {
        id: 'catalogo.publicacao', rotulo: 'Preparar → revisar → aprovar', estado: 'pronta',
        rota: '#/nuvemshop/publicacao',
        prova: { arquivo: `${F}/features/publicacao/FilaArea.tsx`, contem: 'Fila de publicação' },
      },
      {
        id: 'catalogo.lote', rotulo: 'Operações em lote', estado: 'pendente',
        porque: '`POST /api/fotos/lotes` (subir várias fotos e casá-las por nome) '
          + 'existe e a tela ainda não. A outra rota de lote, '
          + '`POST /api/catalogo/publicacao/rodada`, ESCREVE na loja real e '
          + 'continua fora desta trilha por decisão, não por falta de tela.',
      },
    ],
  },

  /* ════════════════════════════════════════════════ REVENDEDORAS E MALETAS */
  {
    id: 'revendedoras',
    rotulo: 'Revendedoras e maletas',
    prototipo: '/prototype/revendedoras/',
    capacidades: [
      {
        id: 'revendedoras.visao', rotulo: 'Visão geral', estado: 'pronta', rota: '#/revendedoras',
        prova: { arquivo: `${F}/features/revendedoras/VisaoGeralRevendedoras.tsx`, contem: 'export function VisaoGeralRevendedoras' },
      },
      {
        id: 'revendedoras.ficha', rotulo: 'Ficha da revendedora', estado: 'pronta', rota: '#/revendedoras/<id>',
        prova: { arquivo: `${F}/features/revendedoras/RevendedoraPage.tsx`, contem: 'export function RevendedoraPage' },
      },
      {
        id: 'revendedoras.subrota', rotulo: 'A ficha sobrevive a recarregar e ao voltar', estado: 'pronta',
        prova: { arquivo: `${F}/app/App.tsx`, contem: 'A aba da revendedora mora no ENDEREÇO' },
      },
      {
        id: 'revendedoras.cadastro', rotulo: 'Cadastrar revendedora', estado: 'pronta',
        prova: { arquivo: `${F}/features/revendedoras/NovaRevendedora.tsx`, contem: 'export function NovaRevendedora' },
      },
      {
        id: 'maletas.criar', rotulo: 'Montar maleta', estado: 'pronta',
        prova: { arquivo: `${F}/features/maletas/CriarMaletaFluxo.tsx`, contem: 'export function CriarMaletaFluxo' },
      },
      {
        id: 'maletas.sugestoes', rotulo: 'Sugestão de peças para a maleta', estado: 'pronta',
        prova: { arquivo: `${F}/features/maletas/SugestoesDrawer.tsx`, contem: 'export function SugestoesDrawer' },
      },
      {
        id: 'maletas.capacidade', rotulo: 'Capacidade e planejamento', estado: 'pronta',
        prova: { arquivo: `${F}/features/maletas/CapacidadeMaletas.tsx`, contem: 'export function CapacidadeMaletas' },
      },
      {
        id: 'maletas.acerto', rotulo: 'Acerto da maleta', estado: 'parcial',
        porque: '`POST /api/maletas/:id/acerto` está no adaptador e o cálculo de '
          + 'comissão é do servidor. Falta a tela de conferência item a item que o '
          + 'protótipo desenha — hoje o acerto é fechado pelo painel clássico.',
        prova: { arquivo: `${F}/features/maletas/api.ts`, contem: 'acerto' },
      },
    ],
  },

  /* ═════════════════════════════════════════════════ GARANTIAS E REPAROS */
  {
    id: 'garantias',
    rotulo: 'Garantias, reparos e trocas',
    prototipo: '/prototype/garantias/',
    capacidades: [
      {
        id: 'garantias.lista', rotulo: 'Casos, com filtro por status', estado: 'pronta', rota: '#/garantias',
        prova: { arquivo: `${F}/features/garantias/tipos.ts`, contem: 'em_reparo' },
      },
      {
        id: 'garantias.abrir', rotulo: 'Abrir garantia, a partir da compra', estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/AbrirGarantia.tsx`, contem: 'A peça voltou' },
      },
      {
        id: 'garantias.ambiguidade', rotulo: 'Duas peças iguais na compra: a tela pergunta', estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/AbrirGarantia.tsx`, contem: 'Qual peça voltou?' },
      },
      {
        id: 'garantias.status', rotulo: 'Mudar status, com observação', estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/GarantiasArea.tsx`, contem: '/status' },
      },
      {
        id: 'garantias.prazo', rotulo: 'Prazo em dias úteis', estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/GarantiasArea.tsx`, contem: 'prazo' },
      },
      {
        id: 'garantias.troca', rotulo: 'Registrar a troca', estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/PainelDaTroca.tsx`, contem: 'Registrar troca' },
      },
      {
        id: 'garantias.diferenca', rotulo: 'Receber a diferença, com a data efetiva', estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/PainelDaTroca.tsx`, contem: 'Recebi a diferença' },
      },
      {
        id: 'garantias.credito', rotulo: 'Peça mais barata vira crédito, não cobrança', estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/PainelDaTroca.tsx`, contem: 'crédito <b>da cliente</b>' },
      },
      {
        id: 'garantias.estorno', rotulo: 'Estornar a troca, com motivo', estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/PainelDaTroca.tsx`, contem: 'Estornar troca' },
      },
      {
        id: 'garantias.vinculo', rotulo: 'Vínculo com o item da venda', estado: 'parcial',
        porque: 'O caso ABRE amarrado à linha da compra, e a tela diz quando o '
          + 'vínculo é `ambiguo` ou `sem_match`. Falta a tela de MUTIRÃO — '
          + '`GET /api/garantias/vinculos` lista os casos antigos sem ponteiro, e '
          + 'resolvê-los em lote ainda é trabalho do painel clássico.',
        prova: { arquivo: `${F}/features/garantias/api.ts`, contem: 'buscarVinculos' },
      },
      {
        id: 'garantias.credito-destino', rotulo: 'Lançar o crédito da troca na conta da cliente',
        estado: 'pronta',
        prova: { arquivo: `${F}/features/garantias/PainelDaTroca.tsx`, contem: 'já lançado no extrato da ficha da cliente' },
      },
    ],
  },

  /* ═════════════════════════════════════════════════════════════ NUVEMSHOP */
  {
    id: 'nuvemshop',
    rotulo: 'Nuvemshop',
    prototipo: '/prototype/nuvemshop/',
    capacidades: [
      {
        id: 'nuvemshop.panorama', rotulo: 'Visão geral da loja', estado: 'pronta', rota: '#/nuvemshop',
        prova: { arquivo: `${F}/features/nuvemshop/NuvemshopPage.tsx`, contem: 'Visão geral' },
      },
      {
        id: 'nuvemshop.pendencias', rotulo: 'Pendências', estado: 'pronta',
        prova: { arquivo: `${F}/features/nuvemshop/PendenciasList.tsx`, contem: 'export function PendenciasList' },
      },
      {
        id: 'nuvemshop.sincronizacao', rotulo: 'Análise da sincronização e divergências', estado: 'pronta',
        prova: { arquivo: `${F}/features/nuvemshop/NuvemshopPage.tsx`, contem: 'Análise da sincronização' },
      },
      {
        id: 'nuvemshop.saude', rotulo: 'Saúde da conexão e das falhas', estado: 'pronta',
        prova: { arquivo: `${F}/features/nuvemshop/saude.ts`, contem: 'export' },
      },
      {
        id: 'nuvemshop.fila', rotulo: 'Fila de publicação: preparar → revisar → aprovar → publicado',
        estado: 'pronta', rota: '#/nuvemshop/publicacao',
        prova: { arquivo: `${F}/features/publicacao/FilaArea.tsx`, contem: 'Fila de publicação' },
      },
      {
        id: 'nuvemshop.funil', rotulo: 'O funil é o filtro: cada degrau é uma fila de trabalho',
        estado: 'pronta',
        prova: { arquivo: `${F}/features/publicacao/tipos.ts`, contem: 'degrauDoEstado' },
      },
      {
        id: 'nuvemshop.falta-vs-bloqueio', rotulo: 'O que falta na peça ≠ o que o servidor não faz',
        estado: 'pronta',
        prova: { arquivo: `${F}/features/publicacao/FilaArea.tsx`, contem: 'Bloqueio do ambiente' },
      },
      {
        id: 'nuvemshop.previa', rotulo: 'Revisar e salvar a prévia do site', estado: 'pronta',
        prova: { arquivo: `${F}/features/publicacao/FilaArea.tsx`, contem: 'O texto do site' },
      },
      {
        id: 'nuvemshop.aprovar', rotulo: 'Aprovar, reabrir e repetir', estado: 'pronta',
        prova: { arquivo: `${F}/features/publicacao/api.ts`, contem: 'aprovarPublicacao' },
      },
      {
        id: 'nuvemshop.publicar', rotulo: 'Publicar na loja real', estado: 'indisponivel',
        porque: 'ESCRITA NA LOJA REAL CONTINUA PROIBIDA nesta trilha. '
          + '`POST /api/catalogo/publicacao/:sku/publicar` existe e NÃO é chamado '
          + 'pela V2. A análise usa `POST /api/sync {"seco": true}`, que lê tudo e '
          + 'não escreve.',
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════════ HOME */
  {
    id: 'home',
    rotulo: 'Home',
    prototipo: '/prototype/',
    capacidades: [
      {
        id: 'home.atencao', rotulo: 'Precisa da sua atenção', estado: 'pronta', rota: '#/home',
        prova: { arquivo: `${F}/features/home/HomeArea.tsx`, contem: 'Precisa da sua atenção' },
      },
      {
        id: 'home.entrou', rotulo: 'Entrou por mês', estado: 'pronta',
        prova: { arquivo: `${F}/features/home/HomeArea.tsx`, contem: 'Entrou por mês' },
      },
      {
        id: 'home.clientes', rotulo: 'Quem mais trouxe', estado: 'pronta',
        prova: { arquivo: `${F}/features/home/HomeArea.tsx`, contem: 'Quem mais trouxe' },
      },
      {
        id: 'home.reparos', rotulo: 'Peças em reparo', estado: 'pronta',
        prova: { arquivo: `${F}/features/home/HomeArea.tsx`, contem: 'Peças em reparo' },
      },
      {
        id: 'home.atalhos', rotulo: 'Atalhos do dia', estado: 'pronta',
        prova: { arquivo: `${F}/features/home/HomeArea.tsx`, contem: 'Atalhos' },
      },
    ],
  },

  /* ═════════════════════════════════════════════════════════════ ETIQUETAS */
  {
    id: 'etiquetas',
    rotulo: 'Etiquetas',
    prototipo: '/prototype/etiquetas/',
    capacidades: [
      {
        id: 'etiquetas.impressao', rotulo: 'Preparar, imprimir e reimprimir', estado: 'indisponivel',
        porque: 'NÃO EXISTE ROTA DE ETIQUETAS no Worker — nenhuma, em nenhum dos 17 '
          + 'módulos de rota. A operação de hoje é local: folha Pimaco 7×18, '
          + 'calibração de 0,5 mm e a chave `marquesa_etiquetas_v1` no localStorage '
          + 'do painel clássico. Construir a tela na V2 sem backend faria a fila de '
          + 'impressão viver num navegador e sumir no outro.',
      },
    ],
  },

  /* ═══════════════════════════════════════════════════ AGENDA E NOTIFICAÇÕES */
  {
    id: 'agenda',
    rotulo: 'Agenda e notificações',
    prototipo: '/prototype/agenda/',
    capacidades: [
      {
        id: 'agenda.eventos', rotulo: 'O que vence, acerta ou fecha', estado: 'indisponivel',
        porque: 'Não há rota de agenda nem de notificação no Worker. Os prazos que '
          + 'existem — vencimento de conta, prazo de garantia, acerto de maleta — '
          + 'moram cada um no módulo dele, e juntá-los numa agenda é uma view que '
          + 'ainda não foi escrita no servidor.',
        prova: { arquivo: `${F}/app/AreaPendente.tsx`, contem: 'Em desenvolvimento' },
      },
      {
        id: 'notificacoes.lista', rotulo: 'O que o sistema precisa me contar', estado: 'indisponivel',
        porque: 'Idem: não há rota de notificação no Worker, e nada no schema '
          + 'guarda "lida" ou "descartada". A tela existe no trilho, marcada, e diz '
          + '"em desenvolvimento" em vez de desenhar caixas vazias com números '
          + 'falsos — fingir persistência aqui perderia o que alguém marcasse.',
        prova: { arquivo: `${F}/app/AreaPendente.tsx`, contem: 'Em desenvolvimento' },
      },
    ],
  },

  /* ════════════════════════════════════════════════════════ CONFIGURAÇÕES */
  {
    id: 'configuracoes',
    rotulo: 'Configurações',
    prototipo: '/prototype/configuracoes/',
    capacidades: [
      {
        id: 'config.operacao', rotulo: 'Parâmetros da operação', estado: 'pronta', rota: '#/configuracoes',
        prova: { arquivo: `${F}/features/configuracoes/ConfiguracoesArea.tsx`, contem: 'Operação' },
      },
      {
        id: 'config.comissao', rotulo: 'Faixas de comissão', estado: 'pronta',
        prova: { arquivo: `${F}/features/configuracoes/ConfiguracoesArea.tsx`, contem: 'Faixas de comissão' },
      },
      {
        id: 'config.corte', rotulo: 'Corte do go-live', estado: 'pronta',
        prova: { arquivo: `${F}/features/configuracoes/ConfiguracoesArea.tsx`, contem: 'Corte do go-live' },
      },
      {
        id: 'config.perfis', rotulo: 'Perfis e permissões', estado: 'indisponivel',
        porque: 'Não há usuários no sistema: a autenticação é UMA chave Bearer '
          + 'compartilhada (`auth.js › checarChave`). Perfil por pessoa exigiria '
          + 'tabela de usuários e sessão, que não existem. A tela diz isso.',
        prova: { arquivo: `${F}/features/configuracoes/ConfiguracoesArea.tsx`, contem: 'Perfis e permissões' },
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════ CASCO E MARCA */
  {
    id: 'casco',
    rotulo: 'Casco, marca e navegação',
    prototipo: '/prototype/design-system/',
    capacidades: [
      {
        id: 'casco.unico', rotulo: 'Um AppShell, nenhuma tela com cabeçalho próprio', estado: 'pronta',
        prova: { arquivo: `${F}/app/AppShell.tsx`, contem: 'a única implementação de cabeçalho global' },
      },
      {
        id: 'casco.logo', rotulo: 'Logo oficial, de um asset só', estado: 'pronta',
        prova: { arquivo: `${F}/components/LogoMarquesa.tsx`, contem: "brand/logo.webp" },
      },
      {
        id: 'casco.tokens', rotulo: 'Os mesmos tokens do protótipo', estado: 'pronta',
        prova: { arquivo: `${F}/styles/marquesa.css`, contem: '--mq-wine-600' },
      },
      {
        id: 'casco.fontes', rotulo: 'Cormorant e Jost', estado: 'pronta',
        prova: { arquivo: `${F}/styles/fonts.css`, contem: 'Cormorant' },
      },
      {
        id: 'casco.tabulares', rotulo: 'Números tabulares', estado: 'pronta',
        prova: { arquivo: `${F}/styles/marquesa.css`, contem: 'font-variant-numeric:tabular-nums' },
      },
      {
        id: 'casco.modulos', rotulo: 'Os treze módulos, em quatro grupos', estado: 'pronta',
        prova: { arquivo: `${F}/app/modulos.ts`, contem: 'Os treze módulos' },
      },
      {
        id: 'casco.deeplink', rotulo: 'Deep-link, reload e voltar/avançar', estado: 'pronta',
        prova: { arquivo: `${F}/app/rota.ts`, contem: 'useRota' },
      },
      {
        id: 'casco.telefone', rotulo: 'Gaveta e barra inferior no telefone', estado: 'pronta',
        prova: { arquivo: `${F}/styles/shell.css`, contem: 'mq-bottomnav' },
      },
      {
        id: 'casco.busca-telefone', rotulo: 'A busca existe NO TELEFONE', estado: 'pronta',
        prova: { arquivo: `${F}/styles/shell.css`, contem: 'mq-topbar__search.is-aberta' },
      },
      {
        id: 'casco.alvo-do-dedo', rotulo: 'Alvo de toque de 36px na barra', estado: 'pronta',
        prova: { arquivo: `${F}/styles/shell.css`, contem: '.mq-iconbtn {' },
      },
      {
        id: 'casco.busca', rotulo: 'Busca global que não sai da V2', estado: 'parcial',
        porque: 'Cliente, venda, peça e revendedora entram, todas por contrato '
          + 'existente. Garantia, maleta, inventário e conta a receber NÃO têm rota '
          + 'de busca por termo no servidor, e a lista diz isso em vez de deixar '
          + 'alguém procurar em silêncio.',
        prova: { arquivo: `${F}/app/BuscaGlobal.tsx`, contem: 'Nunca para o painel clássico' },
      },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────── contagem */

export interface Placar {
  total: number;
  pronta: number;
  parcial: number;
  pendente: number;
  indisponivel: number;
  /** Das capacidades que o backend SUSTENTA, quantas a V2 já entrega.
   *  É a régua honesta: `indisponivel` não conta contra o frontend, porque
   *  construí-la exigiria mentir. */
  suportadas: number;
  entregues: number;
}

export function placar(modulos: ModuloDeParidade[] = PARIDADE): Placar {
  const todas = modulos.flatMap((m) => m.capacidades);
  const conta = (e: EstadoDaCapacidade) => todas.filter((c) => c.estado === e).length;
  const suportadas = todas.filter((c) => c.estado !== 'indisponivel').length;
  return {
    total: todas.length,
    pronta: conta('pronta'),
    parcial: conta('parcial'),
    pendente: conta('pendente'),
    indisponivel: conta('indisponivel'),
    suportadas,
    entregues: conta('pronta'),
  };
}

export function placarDoModulo(m: ModuloDeParidade): Placar {
  return placar([m]);
}
