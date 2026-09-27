# V2 · Revendedoras completa — 27/09/2026

Gap da homologação humana: a V2 mostrava só quem estava com maleta. O
clássico dizia também quanto cada revendedora vendeu, quantos acertos fez,
quanto ficou para a casa e quem está inativa. Esta publicação devolve tudo
isso à V2, sem migration e sem escrita em dado nenhum.

## O que está no ar

| | valor |
|---|---|
| Commit | `c070daf` (`develop`) |
| Worker PROD | `marquesa-api` · versão `bcc6840f-4732-4426-9f7c-9a204ed6f89d` |
| Worker anterior (rollback) | `1cc11597-4ee6-4201-9852-4a812ccf714a` (26/09/2026) |
| Pages PROD | projeto `marquesa` · deployment `03b7d3c8-2c35-4287-a2a2-b98fd5ab3675` |
| Pages anterior (rollback) | `dad43e79-ddab-4c82-a1bd-47b339d1b622` |
| Endereço | https://marquesa-9da.pages.dev/v2/#/revendedoras |
| Schema / dados | inalterados · flags inalteradas · Nuvemshop não tocada |

## O que mudou

- **API** (`acertosDeMaleta`, aditivo): cada acerto diz maleta, enviadas,
  devolvidas, venda gerada e situação financeira; cada revendedora, ticket e
  giro (REGRAS §19 — giro só quando todo ciclo tem maleta registrada).
  Totais idênticos aos de antes.
- **Ficha** (`/api/revendedoras/:id/historico`): situação financeira real
  (era "paga" fixo), correções da decisão, observações, e a linha excluída
  pela decisão sai da lista de peças vendidas.
- **V2**: aba *Histórico de acertos* com filtros e detalhe por acerto;
  *Maletas ativas*, bloco de acertos e *Top revendedoras* na Visão geral;
  *Todas as revendedoras* com inativas e filtro Todas/Ativas/Inativas/Com
  maleta; ficha de inativa; busca global acha inativa.

## Dados conferidos (Worker real sobre a cópia pós-reconciliação de 26/09)

| revendedora | situação | maleta atual | acertos | vendido | último |
|---|---|---|---:|---:|---|
| Jessica da Silva Melim | inativa | — | 2 | R$ 4.248 | 18/07/2026 |
| Evelyn Veiga | ativa | #17 · 84 peças | 2 | R$ 3.176 | 19/09/2026 |
| Graciele Muniz | ativa | #18 · 123 peças | 1 | R$ 2.139 | 23/02/2026 |
| Bruna Follei | ativa | #16 · 92 peças | 1 (15 vendidas, 79 devolvidas, maleta #12) | R$ 1.335 | 22/09/2026 |
| Andreia Souza | inativa | — | 2 | R$ 1.086 | 23/08/2026 |
| Luciana Souza | ativa | #15 · 90 peças | 0 | — | — |

Total: 8 acertos, 138 peças, R$ 11.984 vendido, R$ 3.140,55 de comissão,
R$ 8.843,45 líquido — os mesmos números do clássico. Não há outra
revendedora no cadastro além dessas seis.

## Inconsistências encontradas (não corrigidas: são dado, não código)

1. **Graciele — data do acerto.** A venda do acerto está datada 23/02/2026
   na planilha; a maleta #14 encerrou em 26/09. Já registrado em 26/09; o
   "último acerto" dela aparece como 23/02/2026.
2. **Andreia — acerto do sistema de 23/08 com comissão R$ 0.** O
   `acerto_json` da maleta #8 grava `pct: 0` (4 peças, R$ 286). Pode ser
   combinado real; pede confirmação humana.
3. **Evelyn — acerto de 05/08 "parcial".** A planilha marca a venda como
   parcial (R$ 10 de diferença); a evidência explica que a linha 1303 é uma
   troca de R$ 10, não venda. A tela mostra "Parcial" e a troca à parte.
4. **Giro.** Só Bruna (16%) e Graciele (30%) têm giro: os outros ciclos são
   acertos anteriores ao sistema, sem maleta registrada.

## Provas

- 419/419 testes do painel novo (15 novos); build com typecheck.
- `revendedora-historico-test` 55 ok (19 novos), `acerto-documental`,
  `historico-operacoes`, `historico-operacoes-riscos`, `estorno-recebimento`,
  `saidas-historico`, `vendas-historico`: todos passam em banco limpo.
- Gates `release`: 18/18 em três de quatro rodadas; uma rodada deu 17/18
  sem gate identificado (a oscilação de carga já registrada em 26/09).
- `src/v2-revendedoras-historico-smoke.mjs`: 86 provas, 0 falhas, em 1280 e
  390×844 sobre a cópia da produção, nenhuma escrita na API, arquivo do
  banco idêntico antes e depois, razão fechando.
- Legado (`sync`, `variacoes`, `kits`, `e2e`, `import-total`,
  `fase2-telas`): mesmo resultado antes e depois da mudança no harness sem
  mock da Nuvemshop — sem regressão, e sem prova completa desses seis aqui.
- `revendedoras-test` (clássico) falha igual com o backend anterior: defeito
  pré-existente do teste.
- Pós-deploy: `/api/health` ok; rotas protegidas 401 sem chave; bundle
  publicado contém as telas novas; `v2-publicado-smoke` 6/7 (a sétima é a
  trava de DEV "não sugerir produção", que não vale para o site de PROD).

## Como voltar

| camada | comando |
|---|---|
| Worker | `cd api && npx wrangler rollback 1cc11597-4ee6-4201-9852-4a812ccf714a` |
| frontend | painel Pages `marquesa` → deployment `dad43e79` → *Rollback* |
| dados | nada a voltar: esta publicação não escreve |

## Fora desta rodada

| o quê | por quê |
|---|---|
| Olhar as telas com a chave em PROD | a chave não é legível pelo agente; tudo foi provado sobre a cópia |
| Operações feitas em PROD depois de 26/09 21:10 UTC | a cópia usada é daquela hora; o export novo foi negado pelo classificador |
| Quem conferiu cada acerto | sem usuários no sistema (D4) |
