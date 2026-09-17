# Nuvemshop — lista operacional e publicação

**16/09/2026 · READY FOR GUSTAVO REVIEW**

- [Produtos na loja](master.html): busca, situação, saldo em casa/loja e próxima ação.
- [Publicar na Nuvemshop](publicar.html): fila, preparação, revisão e aprovação final.
- [Pendências](master.html#pending): filtros e diagnóstico.
- [Análise segura](master.html#analysis): plano demonstrativo sem aplicação real.

## Comparação explícita com as referências

Referência atual de Gustavo: `exemplo publicar na nuvem shop.png`, recebida em
16/09. Referência histórica: `docs/releases/baselines/pacote0-2026-09-07/fase2/B-nuvemshop.png`
e `B-pendencias-publicar.png`. Estas referências são evidência de desenho, não
aprovação da implementação atual.

O protótipo anterior usava métricas, donut e histórico como centro da Nuvemshop;
a referência prioriza linhas operacionais e acompanhamento por produto. O
panorama foi substituído por lista com comparação de saldos. A publicação ganhou
fila própria, sem KPI ou gráfico no topo, com etapas Cadastro → Agente → Revisão
→ Publicado, mensagem contextual e ação por estado.

Preservado da referência: foto/produto, SKU/categoria, cadastro, quantidade,
preço, status, progresso e ações. Melhorado: contadores derivados dos exemplos,
filtro de falha, vazio recuperável, revisão em Conteúdo/Fotos/Prévia, edição de
SEO, múltiplas fotos, principal e ordenação. No mobile a linha é reorganizada,
sem esconder dados nem comprimir a linha do tempo. Fotos iniciais são
ilustrações vetoriais identificadas; uploads locais permitem testar fotos reais.

A linha em revisão abre a ação **Aprovar e publicar**. Ela é a última autorização
humana e inicia o envio demonstrativo automaticamente. Estado de falha preserva
a aprovação; tentativa posterior não exige confirmação redundante. Alteração
no conteúdo invalida a aprovação no exemplo, respeitando o contrato futuro.

## Interações e limites

Busca por nome/SKU; filtros e contadores; preparação demonstrativa com avanço
explícito; edição de título/descrição/resumo/SEO; upload local JPG/PNG/WebP em
lote para um SKU; principal, reordenação e remoção; prévia; salvar; aprovar e
publicar; envio e conclusão; falha e tentar novamente. Alterações duram a sessão.
Publicação já concluída abre prévia demonstrativa, não um anúncio real.

Tratamento de imagem é FUTURE e fica desabilitado. Datas/preços/quantidades são
exemplos. Não há integração com agente, Nuvemshop, R2 ou backend. Não há push ou
deploy. Os comandos e campos reais dependem de CC-002 a CC-005 no
[handoff](../../07-mapping/ui-api-handoff-v2.md).

Componentes: base Vendas + `prototype/system.css`/`system.js`; fila e diálogo
em `publicar.css`/`publicar.js`, sem paleta/fonte duplicada. Acesso pelo menu
Mais, Estoque, Catálogo, Nuvemshop e hub. Versões anteriores permanecem no Git.

Verificação: `prototype/verify-global-closure.mjs` e `verify-master.mjs`.
