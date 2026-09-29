# V2 operacional — 29/09/2026

Monte seu Colar com as configurações oficiais, saída sem faturamento com
valor e auditoria, R2 ligado em produção, dinheiro num formato só, e um
defeito do inventário por câmera que perdia peça. Publicado em produção.

## O que está no ar

| | valor |
|---|---|
| Commit | `3ec4c70` (`develop`) |
| Worker PROD | `marquesa-api` · versão `6a7b4f3b-5f7d-40db-9ce9-6e8f98213956` |
| Worker anterior (rollback) | `341e04b5-522f-49a7-855c-9ab38c4d8398` |
| Pages PROD | projeto `marquesa` · deployment `085b5130` (anterior `af5bb60d`) |
| D1 | `marquesa-db-prod` · bookmark antes da migração `0000014c-00000000-000050f5-b90378d61c78b2f5083d11b4ddeac84b` |
| R2 | bucket `marquesa-fotos` (PROD, criado hoje) · DEV segue em `marquesa-fotos-dev` |
| Cron | `[]` — a sincronização automática com a Nuvemshop continua desligada |

## Mudanças

1. **Monte seu Colar** (`api/REGRAS.md` §47). Decisão do Gustavo: linha
   Zircônia; a Cravejado (640509, 718221, 222908, 649597) não é componente.
   As cinco configurações oficiais têm código e preço impostos pelo
   servidor — antes a tela adivinhava pelo nome e "Dois Meninos" caía no
   314161 (três pingentes, R$ 159). O 311066 nasce com estoque 0 na
   primeira venda. A venda baixa só a corrente e os pingentes.
2. **Saída sem faturamento** (§46). Botão no topo, gaveta com variação e
   valor antes de registrar. A saída grava preço e custo do momento
   (`migracao-saida-valor.sql`, aditiva). Histórico antigo: 11 de 12 saídas
   ganharam o preço que a planilha registrou (R$ 909,00); 1 fica "valor não
   informado". `PATCH /api/saidas/:id/valor` completa com motivo, auditado
   em `saidas_valor_historico`.
3. **Financeiro › Saiu sem faturar**: período, peças, deixou de vender,
   perdido a custo, falta completar, resumo por motivo.
4. **Dinheiro**: `Intl` pt-BR com centavos em todo o sistema (`money`,
   `moneyNumero`, `qtdTexto`, `pct` em `frontend/src/domain/formato.ts`).
5. **Inventário por câmera**: bipar a segunda unidade antes da releitura do
   servidor mandava "1" de novo. Agora as bipadas entram em fila.
6. **R2**: binding `FOTOS` → `marquesa-fotos`, sem credencial no Git.

## Provas

| | resultado |
|---|---|
| Gates release (`node scripts/run-baseline-tests.mjs release`) | 18/18 |
| Frontend (Vitest) | 457 testes, build + `tsc` ok |
| Paridade V2 (`src/v2-paridade-e2e.mjs`) | 66/66 |
| Monte seu Colar com dados reais (cópia de PROD) | 27/27 |
| Saída sem faturamento com dados reais, pela tela | 19/19 |
| Regressão do QA de 28/09 (venda, variação, datas, acerto) | 19/19 |
| Suíte worker-local (44 arquivos) | idêntica ao código anterior arquivo a arquivo: 20 passam, 24 falham igual antes (libuv no Windows e dependências de ambiente) |
| R2 real | upload → objeto no bucket → link assinado 200 `image/png` com os mesmos bytes → assinatura falsa 401 → tipo errado recusado → limpeza |
| Migração em PROD | 11 preços da planilha, 1 NULL, razão fechada |
| Smoke online | health 200; rotas novas 401 sem chave; CORS só do painel; bundle com as telas novas; `.map` não servido; sem erro de JS em 390 e 1280 px |

`scripts/v2-local/e2e-completo.mjs` falha igual no código anterior: o
roteiro espera a venda em gaveta dentro da ficha da cliente, fluxo que mudou
antes desta rodada.

## Como voltar

- Worker: `npx wrangler rollback 341e04b5-522f-49a7-855c-9ab38c4d8398` (em `api/`).
- Site: promover o deployment `af5bb60d` no painel do Pages.
- Banco: a migração só acrescenta colunas e uma tabela; o código anterior as
  ignora. Voltar o dado inteiro: `wrangler d1 time-travel restore DB
  --bookmark=0000014c-00000000-000050f5-b90378d61c78b2f5083d11b4ddeac84b`.

## Pendências humanas

- Nenhum teste autenticado foi feito no endereço publicado: o agente não tem
  a API_KEY. A primeira venda, a primeira foto e a primeira saída da
  Sthefany são a prova final.
- Importar as fotos da loja para o R2: botão "Procurar fotos na loja online"
  na V2 (usa o token da Nuvemshop que só o Worker tem).
