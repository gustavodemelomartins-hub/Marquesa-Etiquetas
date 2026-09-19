# Nuvemshop — lista operacional e publicação

**19/09/2026 · READY FOR GUSTAVO REVIEW**

- [Publicar na Nuvemshop](publicar.html): entrada operacional, preparação, revisão e publicação simulada.
- [Produtos na loja](master.html): busca, presença observada, saldo em casa/loja e próxima ação.
- [Pendências](master.html#pending): lista, filtros e diagnóstico.
- [Sincronização](master.html#analysis): comparação demonstrativa sem aplicação real.

## Referências e decisões

Referência de Gustavo: `exemplo publicar na nuvem shop.png`, recebida em 16/09.
Referências históricas: `docs/releases/baselines/pacote0-2026-09-07/fase2/B-nuvemshop.png`
e `B-pendencias-publicar.png`. São evidências de desenho, não aprovação da implementação.

As listas são o centro da operação. A fila mantém foto/produto, SKU/categoria,
data, quantidade, preço, etapa, falta de imagem/categoria/preço e próxima ação.
Os seis filtros de etapa permanecem visíveis no desktop e no celular; contadores
são derivados dos cinco exemplos. Nenhum KPI ou gráfico ocupa o topo.

A revisão reúne Conteúdo/Fotos/Prévia, categoria/preço editáveis, título, descrição,
resumo, SEO, múltiplas fotos, imagem principal e ordenação. As fotos iniciais são
ilustrações identificadas; uploads locais permitem testar fotos reais.

## Fluxo demonstrativo

Preparar → Revisar → Aprovar e publicar → Publicando → Publicado.
A última aprovação humana inicia o envio demonstrativo. Falha técnica preserva
aprovação válida e permite repetir sem confirmação redundante. O controle
**Simular falha técnica** permite exercitar esse caminho.

Dados incompletos bloqueiam a aprovação e explicam os campos ausentes.
Editar título, conteúdo, preço, categoria ou fotos após aprovação devolve o
produto à revisão. A presença observada e o último conteúdo publicado ficam
separados do rascunho editado. Fechar a página durante um envio faz a simulação
retomar como falha recuperável na próxima visita.

A publicação usa `MarquesaDemo.ready/get/set`, chave `publication.products`.
Dados e fotos ficam no IndexedDB do navegador por meio do provedor compartilhado;
fotos são data URLs, nunca URLs temporárias de Blob. Em indisponibilidade de
armazenamento, a interface avisa que as alterações duram somente a sessão.
Restaurar demonstração usa a ação compartilhada do protótipo.

Produtos na loja incorpora publicações demonstrativas salvas, preservando o
último snapshot publicado quando o usuário volta a editar o rascunho. As listas
de divergências e análise apresentam diagnósticos fictícios fixos; não consultam
a loja e não oferecem aplicação real. Os totais da análise correspondem às três
linhas mostradas: uma possibilidade de atualização e dois bloqueios humanos.

## Limites e integração futura

Tratamento de imagem permanece FUTURE e desabilitado. Publicação e análise são
simulações, sem agente externo, Nuvemshop, R2, Worker, banco ou requests de API.
Aprovação de publicação de um exemplo não é aprovação visual da tela.
Os comandos reais dependem de CC-002 a CC-005 no
[handoff](../../07-mapping/ui-api-handoff-v2.md) e do UI DATA CONTRACT da entrega DEV.

Base visual compartilhada: Vendas e `prototype/system.css`/`system.js`.
URLs públicas são geradas pelo manifesto; fontes preservam links relativos.

## Verificação

`node docs/ux/03-screens/nuvemshop/verify-master.mjs` exercita 130 asserções em
320, 390, 768, 1024 e 1440 px: filtros, estados vazios, diagnóstico, fragmento
profundo, ausência de overflow, campos obrigatórios, edição, principal de fotos,
falha/retry sem nova aprovação, reload/persistência, invalidação da aprovação,
presença observada separada, último snapshot publicado preservado e ausência de chamadas à API/escritas externas.

Para o pacote publicado, definir `PROTOTYPE_BASE_URL` com a raiz `/prototype/`.
Capturas são geradas apenas em `.tmp/nuvemshop-v2/`; não entram no pacote público.
