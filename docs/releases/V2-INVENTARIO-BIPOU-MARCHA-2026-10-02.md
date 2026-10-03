# V2 — Inventário "bipou e marcha", Saiu sem faturar por motivo, acerto da Evelyn (02/10/2026)

> **Situação (02/10/2026, 22h50):** código, migration, Worker e Pages EM
> PRODUÇÃO. O SQL de dados (`docs/migracao-nao-venda/rodada-inventario-2026-10-02.sql`)
> foi gerado, ensaiado e commitado, mas **não foi aplicado**: a trava de
> segurança do ambiente do agente negou o `d1 execute` dele. Ver "Publicação".

## Por que

Nos dois vídeos de 02/10 a Sthefany mostra por que o Excel é mais rápido: lá o
sistema já sabe quanto deveria ter (Estoque − Revendedora = Físico), ela bipa a
referência e só escreve na coluna Falta quando falta. Na V2 ela tinha de
digitar a quantidade inteira em cada linha, e o campo de cima só filtrava a
tabela: o leitor digitava "263571", o bipe seguinte virava "263571421089" e ela
apagava à mão.

## O que mudou

**Inventário — bipou e marcha** (`api/REGRAS.md` §49)

- O leitor é a tela: campo grande, com foco desde a abertura, que limpa a cada
  leitura. Tecla que cai fora de um campo volta para ele.
- Um bipe confere a referência: o servidor grava `contado = esperado em casa −
  faltando` com o esperado lido na hora (`faltando: 0`). Nunca "+1".
- Só a falta é digitada — campo Faltando, ou "2 + Enter" no próprio leitor.
- Mesma referência de novo: "Já conferido", nada gravado.
- Esperado em casa mostra com quem está o resto ("Evelyn 1 · Luciana 1").
- Variação: o bipe confere o código inteiro; escolher um aro troca a
  conferência pelo aro; "+ Adicionar variação" cria a variação pela mesma
  `definirVariacoes` de Peças, sem sair do inventário, e fica registrada.
- Gravação em fila com retentativa; o que não salvar fica marcado e trava o
  encerramento. Resumo Conferidos · Com falta · Pendentes; últimas leituras;
  lista completa recolhida.

**Saiu sem faturar por motivo** — a tela principal mostra só os motivos
(somando saídas e registros antigos); clicar abre as peças daquele motivo.

**Classe corrigível com trilha** (§50) — `POST /api/historico/reclassificar/:item/corrigir`.

**Acerto de maleta** (§51) — situação pelo próprio acerto (recebido ≥ líquido).

## Dados (PROD)

### Inventários de teste

#1–#7, todos `cancelado` (o #7 é o da gravação de hoje). Nenhum tinha
resultado, ajuste, saída, evento ou movimento de inventário; só #6 (1 linha,
0 peças) e #7 (3 linhas, 5 peças) tinham contagem. Apagados com as 4 linhas de
contagem. Estoque idêntico.

### Planilha "Saiu sem faturar.xlsx"

9 uso próprio (já certos), 26 brinde, 3 inventário (já certos). Corrigidas 14:

| SKU | Data | Peça | Antes | Depois | Observação | Custo |
|---|---|---|---|---|---|---:|
| 431593 | — | Colar Canga Quatro Crianças | uso próprio | brinde | Presente Vó - Dia das Mães | 81,00 |
| 295623 | — | Pulseira Coração com Crianças | uso próprio | brinde | Presente Mãe - Dia das Mães | 73,00 |
| 944768 | 07/11/2024 | Berloque Patas Zircônias | uso próprio | brinde | Não lembro o custo e nem para quem dei | — |
| 524730 | 30/11/2024 | Pulseira Lisa Lap Cruz | uso próprio | brinde | Presente Vitória | 46,62 |
| 178464 | 10/05/2025 | Brinco Flor Pétalas Verde | **sorteio** | brinde | Brinde Feira Franceschini - Dia das Mães | 11,73 |
| 198242 | — | Brinco Coração Pendurado Infantil | uso próprio | brinde | Presente Ester | 2,56 |
| 104777 | — | Brinco Ponto de Luz 7mm | uso próprio | brinde | Presente Gustavo | 13,50 |
| 569425 | — | Chaveiro Fotografação | uso próprio | brinde | Presente Gledson | 45,00 |
| 603122 | 20/09/2025 | Pulseira Folhas | uso próprio | brinde | Presente Taina | 31,20 |
| 152177 | 28/12/2025 | Brinco Esfera Lisa e Fosca | uso próprio | brinde | Presente Angela | 8,59 |
| 113626 | 09/01/2026 | Brinco Três Linhas | uso próprio | brinde | Presente Carmen | 14,52 |
| 361240 | 31/12/2025 | Colar Elos Cadeado | uso próprio | brinde | Presente Gisele | 18,22 |
| 162655 | 27/06/2026 | Brinco Três Zircônias | uso próprio | brinde | Presente Emilly | 7,66 |
| 397728 | 27/06/2026 | Pulseira Fita e Zircônias | uso próprio | brinde | Presente Emilly | 11,00 |

As outras 23 linhas da planilha ganharam a observação e o custo, sem mudar a
classe. Os 3 de inventário: custo "não informado" (a coluna tem `#NAME?`; o
catálogo não tem custo). Saídas fora da planilha não mudaram.

**821920 — Pulseira Zircônias Retangulares (27/09, "Presente Ana JS") não tem
registro nenhum no sistema** — nem linha da planilha de vendas, nem saída.
Lançar seria uma baixa nova (estoque 2 → 1), e esta rodada não mexe em
estoque. A Sthefany lança em Vendas › Saída sem faturamento (Brinde) se a
peça saiu mesmo; o inventário vai mostrar a falta se ela não estiver em casa.

| Por motivo | Antes | Depois |
|---|---:|---:|
| Brinde | 13 | **27** |
| Uso próprio | 22 | **9** |
| Diferença de inventário | 3 | 3 |
| Sorteio | 1 | **0** |
| Estoque (peças / movimentos) | 2.231 / 2.733 | **2.231 / 2.733** |
| Saídas com baixa | 0 | 0 |
| Vendas feitas · faturamento | 701 · R$ 127.603,61 | **iguais** |

### Evelyn Veiga

- **Por que "Parcial":** o acerto de 05/08/2026 (26 peças, R$ 2.079, comissão
  R$ 605,90, líquido R$ 1.473,10) foi **pago inteiro** — as 26 linhas PAGO
  somam o líquido. O badge lia o status da venda da planilha daquela data,
  que tem uma 27ª linha: "Troca (anel de cruz)", R$ 10, NÃO PAGO, que o
  acerto exclui. Esses R$ 10 já são uma conta própria em A receber
  ("Diferença de troca/garantia"). Agora: **Pago**. Nenhum outro acerto mudou.
- **Maletas:** #13 (encerrada 19/09: 96 enviadas, 83 devolvidas, 13 vendidas,
  R$ 1.097 → líquido R$ 822,75, pago) e **#17 aberta**: 84 peças, R$ 7.904 —
  idêntica, código a código e preço a preço, ao "Anexo I do contrato -
  Evelyn" anexado (que já estava em `pastatemporaria/` desde 26/09). O
  acerto de 05/08 é da "Maleta 1", anterior ao sistema: não há maleta
  registrada dele (enviadas/devolvidas desconhecidas, não estimadas).
- **Nenhuma fonte faltando** para a maleta atual.

### Casa × revendedoras (prova sobre PROD)

`scripts/reconciliacao/provar-casa-revendedoras.mjs`: 987 códigos, **2.231 =
1.842 em casa + 389 com revendedoras** (Luciana 90, Evelyn 84, Graciele 123,
Bruna 92); nenhum código com consignado maior que o total; todo item de
maleta aberta tem o movimento de consignação; as 4 maletas encerradas fecham
(enviadas = vendidas + devolvidas). Exemplos: 263571 = 5 casa + Luciana 1 +
Graciele 1; 421089 = 3 casa + Luciana 1 + Evelyn 1; 377105 = 2 casa + Evelyn 1.

**Variações:** 27 códigos com variação cadastrada; nenhum tem a razão
identificada por aro (o saldo veio sem aro). O esperado por aro não existe — o
inventário confere esses anéis pelo código inteiro, e uma falta neles fica
registrada sem virar movimento até alguém dizer de qual aro é.

## Provas

- `src/inventario-bipou-marcha-test.mjs` 14 (A–L) · `src/saidas-planilha-correcao-test.mjs` 10
- frontend 520/520 (bipagem 16, conferência 4, Saiu por motivo 3) · build com typecheck
- suítes do inventário (4.4 23, conciliação 17, descartar 8, travas 9), reclassificação 10, clientes 10
- clássicas e do assunto idênticas ao commit em PROD (`31013de`)
- navegador local: `v2-inventario-bipou-marcha-qa` (30 leituras seguidas, 1280 e
  390px, mediana ~107 ms, foco 0 perdas, campo 0 sujo, 0 modais), paridade 66,
  descartar 40, conciliação 22, ações de clientes 38
- gates `fast` 11/11

## Publicação

| | Novo | Rollback |
|---|---|---|
| Commits | `650c7c7` (código) · `eeabd94` (dados) | `31013de` |
| Migration | `api/migracao-inventario-conferencia.sql` — **aplicada** | aditiva; o código anterior a ignora |
| Worker `marquesa-api` | `ef2f32da-f324-4f1a-a4e0-c22e4e0ff5f2` | `5d1791e4-44e7-4949-9beb-bcd62e5969e0` |
| Pages `marquesa` | `60f22ceb` | `f4ba0dd4` |
| D1 antes | bookmark `00000194-00000000-000050f9-0a966a2dff4c018ee7bad3de263dffac` | backup `../Marquesa-Etiquetas-backups/d1/2026-10-02_rodada-inventario/` |
| **Dados** | `docs/migracao-nao-venda/rodada-inventario-2026-10-02.sql` — **NÃO aplicado** | — |

O SQL de dados foi ensaiado sobre o export de PROD (idêntico byte a byte ao
auditado): aplica igual ao "depois" e recusa a segunda aplicação. Para aplicar:

```bash
cd api && ./node_modules/.bin/wrangler d1 execute DB --remote --file=../docs/migracao-nao-venda/rodada-inventario-2026-10-02.sql
```

Se PROD mudar antes (venda, saída, maleta), a precondição falha e nada é
escrito: regerar com `scripts/reconciliacao/rodada-inventario-2026-10-02.mjs`
sobre um export novo.

QA de produção (site publicado + Worker do commit publicado sobre cópia do
estado atual de PROD, escritas só na cópia), 1280 e 390px: 25 peças reais
bipadas em sequência por largura, foco perdido 0, campo sujo 0, modais 0,
mediana ~120 ms; contado = esperado em casa em todas; 421089 mostra 3 em casa
· Evelyn 1 · Luciana 1, "1 + Enter" → falta 1; 263571 conferido pelo código
inteiro; repetição "Já conferido"; Saiu sem faturar por motivo; acerto da
Evelyn de 05/08 **Pago**; Elizama 1 venda R$ 504,00; estoque idêntico.
