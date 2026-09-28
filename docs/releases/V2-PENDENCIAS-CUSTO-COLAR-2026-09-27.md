# V2 · Pendências na linha, custo da peça e Monte seu Colar — 27/09/2026

Pedido do Gustavo depois de testar a navegação nova no celular: resolver
tudo dentro de Pendências, pôr custo nas peças que saíram sem faturar e ver
quanto se perdeu, e fazer o Monte seu Colar funcionar.

## O que está no ar

| | valor |
|---|---|
| Commit | `35a1977` (`develop`) |
| Migration | `api/migracao-custo.sql` — aplicada em `marquesa-db-prod` antes do deploy |
| Worker PROD | `marquesa-api` · versão `07982397-927c-49a4-abe1-9525128b37dc` |
| Worker anterior (rollback) | `963cd6dc-657d-4493-aa36-17232e418311` |
| Pages PROD | projeto `marquesa` · deployment `53e44728` |
| Pages anterior (rollback) | `06bac417-3876-4f85-8843-08bf5cf7a740` |
| Flag | `PERSONALIZACAO_ATIVA = "true"` (era `"false"`) |
| Backup antes da migration | `wrangler d1 export` completo (4,4 MB) + bookmark `0000013a-00000000-000050f4-21db0d4290b938d31852783a15102125` |

## O que mudou

**Pendências (`#/home/pendencias`).** Cada linha tem Resolver e Revisar
depois. O formulário abre na própria linha, usando a rota que já existia no
servidor:

| caso | resolve com |
|---|---|
| cadastro incompleto | preço/categoria na linha + foto (subir da galeria ou tirar na hora) |
| variação da venda | escolher entre as variações cadastradas (`/api/pendencias/variacao/venda`) |
| variação da maleta | quantas de cada (`/api/pendencias/variacao/maleta`) |
| estoque sem repartição | quantas de cada, soma fechando (`/variacoes/distribuir`) |
| aviso de variação vindo da maleta | leva à pendência da maleta do mesmo código |
| venda que não chegou à loja | Tentar de novo, com a trava de segurança visível |
| produto novo da fila | Cadastrar a peça / Descartar |
| foto da loja sem dono | digitar o código certo |
| vínculo de cliente | É a mesma pessoa / São pessoas diferentes |
| operação da planilha em revisão | conferir (seco) e confirmar como venda |
| troca de garantia sem crédito | abre Garantias |

Busca na lista, grupo "Revisar depois" com volta, e um botão que copia as
fotos da loja em lotes de 40 (`importar-da-loja` ganhou `limite`, `ignorar`
e `restantes`; sem `limite` o comportamento antigo não muda).

**Custo (REGRAS §46).** `produtos.custo` + `produtos_custo_historico`.
Editável na ficha da peça e direto na linha de Financeiro › Saiu sem
faturar, que agora mostra **Perdido (a preço de custo)** e **Deixou de
vender**. Linha sem custo é contada à parte, nunca como zero.

**Monte seu Colar (REGRAS §47).** O modelo nasce na venda: escolhe os
pingentes (251551, 251552, 329494, 263236, 273470); se a combinação não tem
modelo, cadastra ali — código do catálogo (sugestão: Colar Casal/Filhos/
Filhas) ou código novo, nome e preço. A corrente 444032 sai sozinha.

**Defeito antigo corrigido.** A consulta do vínculo de cliente na central
pedia colunas que a tabela nunca teve (`nome_arquivo`, `cliente_id`); o
`.catch` engolia o erro e essa pendência nunca aparecia. Hoje há 0 casos em
PROD, então o sino não muda.

## Provas

- `src/montagem-na-venda-test.mjs` (novo, schema real): cardápio, modelo na
  venda, duplicatas recusadas, código novo com estoque 0, venda baixando só
  corrente e pingentes, custo com histórico, saídas em dinheiro, vínculo de
  cliente aparecendo. Razão fechada em cada passo.
- `montagem-saldo`, `montagem-venda`, `montagem-integracao`,
  `montagem-estorno`, `fotos-storage`: ok.
- Painel clássico: `pendencias-nuvemshop-test`, `editar-peca-test`,
  `fotos-catalogo-test` (com R2 simulado): tudo passou.
- Frontend: 437/437 (16 novos em `PendenciasArea.test.tsx` e
  `MonteSeuColar.test.tsx`), typecheck e build ok. `v2-paridade-e2e` 66/66.
- Roteiro "como gente" sobre a cópia de PROD de 27/09 22:12, notebook e
  390px: **53/53** — resolveu maleta, venda e cadastro (preço + foto),
  adiou e trouxe de volta, informou custo e viu o total subir, vendeu dois
  colares (um cadastrando o modelo, outro já com modelo), razão fechada
  depois de cada escrita.
- Migration ensaiada na cópia antes: contagens iguais, razão fechada, e rodar
  de novo é recusado (`duplicate column name`).
- Pós-deploy: migration conferida em PROD (987 produtos, 2.535 movimentos,
  19 vendas, iguais ao backup; coluna `custo` presente; razão fechada),
  `/api/health` ok, rotas novas 401 sem chave, CORS do upload ok, bundle
  publicado com as telas novas, `v2-publicado-smoke` 6/7 (a sétima é a
  trava de DEV).

## Defeitos que o teste pegou antes de publicar

- consulta do vínculo usava `c.telefone` (a coluna é `tel`);
- formulário do colar congelava a sugestão da primeira combinação;
- custo salvo em Saiu sem faturar não recarregava o estado (a ficha mostrava
  o valor velho);
- cartão do pingente colava código e disponível ("2632365 disponíveis").

## O que NÃO está resolvido — e é anunciado

| o quê | por quê |
|---|---|
| **Subir foto em PRODUÇÃO** | a conta Cloudflare não tem R2 habilitado (erro 10042, conferido hoje com `wrangler r2 bucket list`). O botão existe e responde com a mensagem do servidor. Habilitar é no painel da Cloudflare (R2 → ativar); depois disso: `wrangler r2 bucket create marquesa-fotos`, o bloco `[[r2_buckets]]` no `wrangler.toml` e deploy |
| Copiar fotos da loja | também grava no R2. E das 350 peças sem foto, só 2 estão na loja — as outras precisam de foto nova |
| Correntes 444032 | o sistema tem 2; em 11/09 foram declaradas 18 em casa. Sem corrente o colar não vende — a tela diz isso. Entrada pela operação |
| `qtd 1` dos códigos comerciais | 326660, 364945, 314161, 378852, 366066, 399872 seguem com 1 no cadastro. A venda ignora; o patrimônio ainda soma. Zerar é inventário (MONTAGEM §5.4) |
| Compras, fornecedores, margem real, fotos em massa | registrados como IF-010 e IF-011 em `docs/ux/06-backlog/functional-ideas.md` |

## Como voltar

| camada | comando |
|---|---|
| Worker | `cd api && npx wrangler rollback 963cd6dc-657d-4493-aa36-17232e418311` |
| frontend | painel Pages `marquesa` → deployment `06bac417` → *Rollback* |
| flag do colar | `PERSONALIZACAO_ATIVA = "false"` no `wrangler.toml` e deploy — não mexe em dado |
| banco | a coluna `custo` e a tabela de histórico são aditivas; o Worker anterior não as lê. Restaurar o banco inteiro só em último caso: `wrangler d1 time-travel restore DB --bookmark=0000013a-00000000-000050f4-21db0d4290b938d31852783a15102125` |
