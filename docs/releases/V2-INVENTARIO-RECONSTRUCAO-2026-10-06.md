# Inventário da V2 reconstruído — 06/10/2026

Pedido: a Sthefany largou no meio o primeiro inventário real (id 12, pausado
em 05/10 com 125 leituras / 205 peças). A V2 foi refeita a partir da planilha
dela (`Layout_Inventario.xlsx`). Regra de negócio: `api/REGRAS.md` §57.

## O que mudou

- Um bipe = uma unidade. Bipe repetido em < 4 s pergunta ("Contar outra
  unidade" · "Foi engano"). "Estão todas aqui", "Não achei nenhuma",
  "Desfazer conferência".
- Ficha da peça na conferência: estoque total, com revendedoras, em casa,
  conferido, faltando/sobrando. Variações com contador próprio (nº23 → 2),
  peça sem variação fica "não informada", criar variação sem sair da tela,
  "N23" reconhecido como nº23, revendedora com aro desconhecido +
  "Identificar variação".
- Busca por código, nome ou variação; andamento por categoria; lista no
  formato da planilha (tabela no computador, cartões no celular).
- Leituras com id próprio (`inventario_leituras`) e fila guardada no
  aparelho: recarregar não perde nem duplica.
- Balanço antes de finalizar (não conferidas, faltando, sobrando, tudo certo,
  impacto); motivo padrão "Contagem física"; nada vira perda sozinho;
  variações contadas podem ser guardadas no cadastro.
- Número visível do inventário (`inventarios.numero`): o id 12 é o #1.
- Variações da peça (Peças): total / com revendedoras / em casa,
  distribuição conhecida com "variação ainda não informada", adicionar
  variação na V2.
- Histórico da peça em palavras de gente; "painel clássico" fora da V2
  (o botão de imprimir etiquetas continua levando à tela de impressão).

## Commits

`9fece3b` (servidor) · `810ec8b` (tela) · `330c63a` (schema do console),
em `origin/develop`.

## Banco

Migration `api/migracao-inventario-v2.sql` (aditiva; rollback
`api/migracao-inventario-v2-rollback.sql`).

| | DEV (`marquesa-db-staging-v2`) | PROD (`marquesa-db-prod`) |
|---|---|---|
| aplicada | 06/10/2026, 21 inventários numerados 1–21 | 06/10/2026, id 12 → #1 |
| bookmark antes | — | `000001dc-00000000-000050fc-4709c959760a82de261268c377c766bb` |
| antes = depois | — | 987 produtos · 2822 movimentos · 2088 peças · 24 vendas · 125 leituras / 205 peças do #1 · razão fechada |

Cópia lógica do inventário 12 antes da migration (1 inventário, 125
leituras, 26 variações criadas) ficou no scratchpad da sessão.

## Publicação

| | Nova | Rollback |
|---|---|---|
| Worker PROD `marquesa-api` | `9d213d30-3510-4152-a0ba-24b84465cb49` | `0e3b0766-4e71-4db7-8c90-0f7532ca7ef2` |
| Pages PROD `marquesa` | `d19bdb05` | `02817234` |
| Worker DEV `marquesa-api-staging-v2` | `3d1c2360-ce4b-4284-bee0-7d9c7f2eaae6` | — |
| Pages DEV `marquesa-dev` | `12adc53f` | — |

O CI do DEV continua parando em `d1-migracoes` com 7403: o
`CLOUDFLARE_API_TOKEN` do GitHub ainda não tem "D1: Edit" e "Workers
Scripts: Edit". DEV e PROD foram publicados à mão, de um worktree limpo no
commit `330c63a`, repetindo os passos de `deploy-dev.yml` e
`deploy-prod.yml`.

## Provas

- `src/inventario-v2-reconstrucao-test.mjs` — 25 provas de servidor.
- `frontend` — 572 testes (Vitest), build com `tsc`.
- Baseline `release` — 29/29 gates.
- Seis suítes clássicas — iguais ao commit de PROD (`b7bd1a4`): sync 71/1,
  variações 58, kits 20, import-total 13, fase2-telas 3 (para cedo),
  e2e 93/14 — mesmas falhas antes e depois.
- `src/v2-inventario-reconstrucao-qa.mjs` (1280px e 390px): 103 provas no
  build local, 101 no bundle publicado do DEV e 103 no bundle publicado de
  PROD (API do bundle encaminhada ao Worker real local, sem chave).
- `src/v2-paridade-e2e.mjs` — 66/66. `src/v2-publicado-smoke.mjs` em PROD —
  6/7 (a falha é a prova "não sugerir o endereço de produção", escrita para
  o DEV).

## Pendências

- O token do GitHub (CI do DEV).
- Sem a `API_KEY` de PROD, nenhuma chamada autenticada ao Worker publicado
  foi feita pelo agente: a prova de PROD é o banco lido por consulta e o
  bundle publicado contra o mesmo código rodando localmente.
- Imprimir etiquetas continua fora da V2.
