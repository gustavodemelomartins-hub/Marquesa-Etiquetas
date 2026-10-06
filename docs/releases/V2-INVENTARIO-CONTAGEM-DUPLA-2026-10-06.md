# V2 — inventário: a mesma peça nunca é contada duas vezes em silêncio (06/10/2026)

REGRAS §59. Commit `b33bcf3`. Painel clássico intocado.

## O defeito

A Sthefany usou o inventário novo em PROD (Inventário #1, id 13) e achou
dois jeitos de contar a mesma peça duas vezes sem perceber:

1. **Bipar o mesmo código de novo.** A trava (`ehRepeticaoAcidental`) só
   perguntava se a segunda leitura viesse em menos de 4 s. Ela bipa, olha
   a ficha e bipa de novo — 6, 10, 20 s depois — e a segunda leitura somava
   em silêncio, com som de sucesso. Um toque em + ou − também zerava a
   trava.
2. **Digitar a quantidade da planilha por cima do que bipou.** Numa peça
   sem variação o número digitado já substituía (o `definir` do servidor é
   absoluto), mas sem perguntar. Numa peça com variação, o bipe fica em
   "não informada" e o número digitado no aro era gravado ao lado: 2
   bipados + "5" no nº23 = **7**. O teste do servidor reproduz os 7 com o
   pedido antigo.

A idempotência por `leituraId` (retry, rede ruim, aba recarregada) já
estava certa e continua igual.

## A regra adotada

- **Scanner**: o mesmo código de novo, sem outro código no meio, numa
  peça já conferida, não soma. Aviso "Essa peça já foi conferida." com a
  peça e a quantidade já conferida; **Contar outra unidade** soma 1, **Foi
  engano** não muda nada. Sem prazo — a janela de 4 s só muda a frase.
  A → B → A conta normal; peça desfeita ou em zero conta no primeiro bipe.
- **Enquanto pergunta**: tom de atenção (não o de sucesso), nenhum "✓",
  câmera pausada. Outro código bipado com o aviso aberto fecha o aviso sem
  contar o repetido e conta o novo. O foco nunca cai num botão que grava
  (o Enter do leitor USB não confirma nada).
- **Recarregar a página** não esquece a última leitura (guardada no
  aparelho, por inventário).
- **Digitação = total conferido da linha**: sobre contagem existente,
  "Substituir a quantidade conferida? 2 → 5" (Substituir por 5 / Cancelar);
  mesmo número não grava nada (servidor responde `inalterada`, sem
  evento); número menor pergunta e substitui; linha não conferida define
  direto.
- **Variação com bipes "não informada"**: digitar no aro pergunta se as
  bipadas sem variação são daquele aro — Sim (passam para o aro: total 5),
  Não (ficam à parte: total 7, dito por ela) ou Cancelar. No servidor:
  `definir` com `naoInformadas: true`, no mesmo lote.
- **Aviso no telefone**: folha presa embaixo, por cima da barra de
  navegação (z 58 > 45), área segura do iPhone, botões de 52 px.

## Provas

- `src/inventario-v2-duplicado-test.mjs` — 12 provas de servidor (Worker
  real em processo): reenvio do mesmo evento 3× não soma; 2 + definir 5 =
  5; mesmo valor sem evento; nº23 2 → 3; com/sem `naoInformadas` (5 × 7);
  parcial; razão fechada; estoque intocado.
- Suítes de inventário: reconstrução 25, bipou-e-marcha 14, descartar 8,
  conciliação 17, ajuste 13, 4.4 23, variações locais 16 — verdes.
- `frontend` — 607 testes (15 novos em `conferencia.test.tsx`, 15 puros em
  `contagem-dupla.test.ts`), build ok. Os testes novos falham no código de
  `ee52b3b` (11 falhas: o caso dos 20 s mostra "2 de 4 em casa").
- `src/v2-inventario-duplicado-qa.mjs` (390 px e 1280 px, número conferido
  no servidor a cada passo): 60/60 no build local, no bundle publicado do
  DEV e no bundle publicado de PROD (API do bundle encaminhada ao Worker
  real local, sem chave de PROD).
- `src/v2-inventario-reconstrucao-qa.mjs` (ajustado ao aviso novo): 103/103
  local e no bundle publicado de PROD.
- As seis suítes clássicas do pre-deploy-check NÃO rodaram: a mudança de
  servidor é só o gesto `definir` de `POST /api/inventarios/:id/leituras`,
  que nenhuma delas usa (o clássico usa `/itens`, intocado).

## Publicação

| | agora | rollback |
|---|---|---|
| Worker PROD `marquesa-api` | `2803f2d0-8a9a-4320-a7ab-ee313dd1f806` | `2dce067e-fb23-4cae-80cb-e519545c2a36` |
| Pages PROD `marquesa` | `e86ce998` | `836bf4c1` |
| Worker DEV `marquesa-api-staging-v2` | `60a882bf-500a-4d23-8511-8d65dc42769c` | — |
| Pages DEV `marquesa-dev` | `b4c0893d` | — |
| D1 | sem migration, nada escrito | |

Ordem: Worker antes do site (o site novo manda `naoInformadas`; o Worker
novo aceita o site antigo). Publicado à mão, de um worktree limpo em
`b33bcf3`, repetindo `deploy-dev.yml` e `deploy-prod.yml` (o CI do DEV
segue sem permissão de D1).

## PROD depois (só leitura)

- Razão: 0 códigos com `produtos.qtd ≠ SUM(movimentos.qtd)`.
- Inventário #1 (id 13) aberto, 582 leituras, intacto.
- Bipes do mesmo código em sequência, já gravados no #1: só 2 — 161731
  (6 s) e 120029 (7 s). Os dois já foram corrigidos por ela na tela (hoje
  1 e 0). Nenhum código com variação misturando "não informada" e aro.
  Nada a corrigir no banco.
