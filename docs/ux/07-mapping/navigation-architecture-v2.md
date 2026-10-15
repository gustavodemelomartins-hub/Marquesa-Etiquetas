# Arquitetura de navegação — Sistema Marquesa V2

**Tarefa:** `ARQ-009` · **Estado:** `READY FOR GUSTAVO REVIEW`
**Data:** 16/09/2026 · **Escopo:** protótipo e handoff; não implementa React.

## Princípio

A navegação principal representa **lugares de trabalho recorrentes**. Uma
capacidade não ganha aba global só porque possui uma tela. Subáreas permanecem
dentro do domínio que responde por elas; utilidades e conta ficam fora da barra
principal.

## Navegação implementada no protótipo

| Posição | Módulo | Responde | Subáreas |
|---|---|---|---|
| 1 | Home | Como está a operação agora? | Hoje, Agenda, prioridades e atividade |
| 2 | Vendas | O que foi vendido e o que preciso lançar? | Lançamentos, Painel, Histórico e Saídas sem faturamento |
| 3 | Clientes | Qual é a situação desta cliente? | Lista, perfil, compras, financeiro e pós-venda |
| 4 | Estoque | Onde está o patrimônio? | Visão geral, Produtos, Inventário e Catálogo |
| 5 | Revendedoras | O que está circulando e precisa de acerto? | Revendedoras, Maletas, Agenda e Acertos |
| 6 | Mais | Áreas menos frequentes ou especializadas | Financeiro, Garantias, Etiquetas e Nuvemshop |

Elementos globais:

- **sino:** Central de Notificações;
- **avatar:** Meu perfil, Preferências e Conexão (autenticação real fora do protótipo);
- **busca futura:** busca transversal somente quando houver contrato unificado;
- **Hub do protótipo:** inventário e revisão, não navegação final do produto.

## Desktop e mobile

No desktop, os cinco módulos principais e `Mais` cabem no cabeçalho. No mobile,
a barra inferior mantém **Home, Vendas, Estoque, Revendedoras e Mais**. Clientes
fica no primeiro nível de `Mais` e continua acessível diretamente por Vendas,
busca de cliente e Home. Essa redução evita seis itens comprimidos na barra.

## Relações entre domínios

- **Clientes ↔ Financeiro:** o perfil mostra o resumo e abre o lançamento em
  Financeiro; corrigir/estornar recebimento pertence a Financeiro.
- **Clientes ↔ Garantias:** o perfil lista casos da cliente; conduzir conserto,
  troca e prazo pertence a Garantias.
- **Estoque ↔ Catálogo:** Produto é a entidade comum. Estoque governa saldo e
  razão; Catálogo governa descrição, categoria, mídia e publicação.
- **Estoque ↔ Inventário:** Inventário é uma subárea operacional de Estoque e
  nunca uma correção automática de saldo.
- **Catálogo ↔ Nuvemshop:** Catálogo mantém o cadastro e a mídia; Publicar na Nuvemshop
  concentra preparação, revisão, aprovação final e publicação. Nuvemshop também
  mostra a loja, sincronização e divergências.
- **Home ↔ Agenda:** compromissos manuais convivem com datas derivadas do
  sistema, mantendo origem e destino visíveis.

## Atalhos da Home

Permanecem apenas ações de alta frequência: registrar venda, preparar etiquetas
e criar maleta. Prioridades levam a Financeiro, Estoque, Catálogo, Garantias ou
Revendedoras. A Home resume; não replica formulários de cada domínio.

## Decisões humanas ainda abertas

1. Confirmar se **Clientes** permanece na barra desktop e em `Mais` no mobile.
2. Confirmar se **Financeiro** deve subir para a barra principal após uso real.
3. Confirmar a posição final de **Catálogo**: subárea de Estoque é a recomendação.
4. Fechar matriz de permissões para ações críticas e dados de custo.


## Implementação e entradas diretas

`prototype/system.js` monta o mesmo cabeçalho e o menu Mais em todas as páginas.
A navegação usa links reais; Escape fecha o menu e devolve o foco ao botão.
O menu expõe as 19 entradas: Home, Vendas, Clientes, Estoque, Revendedoras,
Financeiro, Inventário, Produtos/Catálogo, Maletas e acertos, Garantias/reparos/
trocas, Etiquetas, Nuvemshop, Publicar na Nuvemshop, Monte seu Colar, Saída sem
faturamento, Agenda, Notificações, Perfil e Configurações.

Publicação tem rota própria `nuvemshop/publicar.html`, acessível por Mais,
Nuvemshop, Estoque e pelos antigos acessos de Conteúdo/Publicação do Catálogo.
O perfil da cliente abre a conta correspondente em Financeiro. Nova venda
preserva a cliente selecionada. O hub é uma entrada de revisão adicional.
