# V2 — Detalhe único do reparo, miniatura da peça e "Buscar foto" (05/10/2026)

V2 apenas; o painel clássico não mudou. Nenhuma regra de negócio mudou: o
detalhe do reparo manda o mesmo `POST /api/garantias/:id/status` de antes, e
o servidor continua recusando o que recusava.

## Publicado

| | Novo | Rollback |
|---|---|---|
| Commit (`develop`) | `ff36b0b` | `b9d3da2` (código igual a `64018f0` + avatar) |
| Worker `marquesa-api` | `0e3b0766-4e71-4db7-8c90-0f7532ca7ef2` | `69be6f4d-b320-4031-a98f-d010f4a8c8d6` |
| Pages `marquesa` | `02817234` | `45def4ec` |
| D1 `marquesa-db-prod` bookmark antes | `000001cd-00000000-000050fb-27454993fb93bd173e14c571c95a2f96` | — |
| Migration | `api/migracao-cliente-avatar.sql` (3 tabelas novas, aditiva) | `api/migracao-cliente-avatar-rollback.sql` |

Contagens de PROD antes e depois da migration, iguais: 355 clientes, 987
produtos, 2088 peças = soma dos 2820 movimentos, 24 vendas, 22 garantias.
As três tabelas do avatar nasceram vazias.

DEV (`staging-v2`): sem migration pendente; Worker `11ed97b0` e Pages
`marquesa-dev` `52a86356`, do checkout limpo de `develop` `ff36b0b`, com os
passos do `deploy-dev.yml` repetidos à mão — o CI oficial parou em
"Migrations pendentes" com `7403` (token do GitHub sem D1: pendência do dono).

## O que mudou

- **Um detalhe só** (`frontend/src/features/garantias/CasoDeReparo.tsx`),
  aberto por `CasosDeReparoProvider` no App. Início › Peças em reparo, ficha
  da cliente › Garantias e trocas e a lista de Garantias abrem o MESMO
  componente; fechar volta para a tela de origem; mudar o caso relê a lista.
- **Ficha do caso**: peça + cliente + status; Entrada / Prazo / Faltam no
  bloco de números de "A receber"; Informações; Ações (uma principal,
  secundárias em lista, "Cancelar caso" destrutivo e separado), cada uma com
  confirmação e observação opcional no lugar do `prompt()`; Histórico com
  rótulos humanos. Painel da troca só quando é o assunto.
- **Sem enum na tela**: saiu o chip "vínculo nao_se_aplica"; `ambiguo` e
  `sem_match` continuam como aviso em português; "§36" saiu da troca.
- **Miniatura real da peça** (galeria/R2 ou a foto que o cadastro já
  conhece, via `GET /api/state`); sem foto, o ícone de sempre.
- **Avatar**: sempre tocável na ficha; sem sugestão explica a busca e
  oferece "Buscar foto" (`POST /api/clientes/:id/avatar/buscar` põe a
  cliente no começo da fila). Script: `--testar-sessao`, `--cliente`, `--seco`
  com prévia pontuada pelo servidor, sem escrita.

## Provas

- `frontend`: 592/592 (novo `CasoDeReparo.test.tsx`, 18 casos).
- `src/cliente-avatar-test.mjs` 104/104; `test_sync_avatares.py` 14/14;
  contratos HTTP 208; `npm test` (release) 28/28.
- `src/v2-reparos-qa.mjs` 72/72 em 390 e 1280px — no build local e no
  **bundle publicado em PROD** (`MQ_ROTEAR_DE`, API desviada para o Worker
  local, sem chave real). Smoke sem chave: DEV 7/7; PROD 6/7, sendo a única
  "falha" a prova própria do DEV (endereço sugerido ≠ produção).
- API publicada: `/api/health` ok; rotas protegidas respondem 401 (inclusive
  a nova `avatar/buscar`); CORS só para `marquesa-9da.pages.dev`.

## Fica de fora

- Instagram real: sem sessão nem chave da API nesta máquina — fluxo pronto
  em `docs/CLIENTE_AVATAR.md` (sessão → `--testar-sessao` → `--seco
  --limite 5`). Nenhuma busca foi feita.
- `src/cliente-avatar-ui-test.mjs` não rodou (precisa de `wrangler dev`
  local com o D1 de staging); os estados do avatar estão cobertos pelo
  `v2-reparos-qa.mjs` e pelos testes de unidade.
- `scripts/v2-local/semear.mjs` já estava quebrado (venda de `100301`, que
  tem variação) — anterior a esta rodada.
