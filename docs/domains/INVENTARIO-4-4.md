# Inventário — Fase 4, item 4

**Fonte canônica da Fase 4, item 4.** Desenho aprovado por decisão humana de
**10/09/2026**; **nada aqui foi implementado**.

Vale para o mecanismo, o modelo de dados, o contrato de rotas, o contrato de
UX/API (seção 11) e as pendências S1–S6 (seção 12). Onde documentação anterior
descrever o inventário de outro jeito, **prevalece este documento**, e o texto
antigo passa a ser histórico. Duas exceções, acima dele:
[api/REGRAS.md](../../api/REGRAS.md) para a regra de negócio e
[SECURITY.md](../SECURITY.md) para risco e ambiente.

Entra depois de [HISTORICO-INCOMPLETO-E-INVENTARIO.md](HISTORICO-INCOMPLETO-E-INVENTARIO.md),
que decidiu que o passado não se reconstrói por adivinhação, e ao lado de
[MONTAGEM-MONTE-SEU-COLAR.md](MONTAGEM-MONTE-SEU-COLAR.md), que fechou o item 3.
A regra de negócio continua sendo [api/REGRAS.md](../../api/REGRAS.md); onde este
documento e ele divergirem, o `REGRAS.md` vence e a divergência vira pendência.

---

## 1. O problema que este item resolve

O inventário de hoje conta, compara e ajusta — e faz as três coisas de um jeito
que não sobrevive à operação real da Marquesa:

- **a contagem tem que caber num dia.** Concluir com metade do catálogo
  conferido trata o resto como faltante, e a tela oferece corrigir tudo de uma
  vez. Um inventário interrompido e concluído por engano zera meio catálogo —
  por movimentação registrada, mas zera;
- **não existe "conferi e não tem nenhuma".** `PUT /contagem` descarta
  quantidade zero, então o silêncio e o zero são a mesma coisa;
- **o ajuste sai sem variação.** `movimentar()` aceita `variacao` e
  `variante_id`; o inventário não passa nenhum dos dois. Num código com
  variação, o inventário de hoje **fabrica um movimento incompleto novo** — o
  problema que o documento do histórico existe para impedir. E isso passa
  despercebido, porque `GET /api/estoque/conferir` soma por SKU;
- **a diferença não tem dono.** O vínculo entre o movimento e o inventário é a
  frase do `obs`. A trava contra aplicar duas vezes é um flag lido e escrito no
  mesmo batch, sem índice — duas abas abertas duplicam o ajuste.

Auditoria completa do estado anterior: seção 12.

---

## 2. As decisões humanas de 10/09/2026

| # | Decisão |
|---|---|
| D1 | O inventário é **pausável**. Pode durar vários dias. Retomar preserva tudo o que já foi contado |
| D2 | **Não contado nunca é zero.** Zero exige gesto explícito |
| D3 | Item não conferido **nunca** entra em correção em lote, e não aparece como faltante |
| D4 | SKU com variação cadastrada **exige** identidade de variação. Sem ela, não há movimento |
| D5 | **"Não sei"** é resposta válida. Bloqueia o movimento daquela peça até resolução, e não vira nada |
| D6 | Diferença negativa → `saidas_sem_faturamento`, `tipo='perda'`, `sentido='saida'` |
| D7 | Diferença positiva → **o mesmo mecanismo**, `tipo='perda'`, `sentido='entrada'`. Nenhuma segunda tabela só para a sobra |
| D8 | As duas ficam vinculadas a `inventario_id`, com observação opcional, movimento correspondente e estorno possível |
| D9 | A **origem do movimento continua `inventario`**. O motivo explica que é diferença; a origem diz que o fato nasceu de uma contagem física |
| D10 | Deriva entre contar e fechar: **comparação retroagida** pelos movimentos posteriores à contagem |
| D11 | Movimento posterior sem identidade de variação suficiente → item `nao_comparavel`. **Não inferir** |
| D12 | Correção de erro é **estorno**, nunca um ajuste compensatório solto |
| D13 | Nenhum `UPDATE produtos SET qtd`. Tudo pela razão de estoque |

---

## 3. O que não muda

A convenção de etiqueta permanece: **mesmo SKU, a variação distingue a peça** —
o aro do anel, o comprimento da corrente. Este item não redesenha isso.

`estoque.js › movimentar` continua sendo o único caminho para saldo.
`produtos.qtd` nunca é escrito direto. Os 78 movimentos historicamente
incompletos continuam intactos: o inventário acrescenta o fato novo, não
reescreve o antigo.

E uma descoberta que define a forma da solução:

> **`saidas_sem_faturamento` já foi construída para os dois lados da diferença
> de inventário.** A coluna `sentido` existe, e o `CHECK (sentido = 'saida' OR
> tipo = 'perda')` permite `entrada` **só** para `perda`. Foi feito exatamente
> para a sobra. `saidas.js › registrar` já grava variação, já amarra
> `movimento_id`, já converte saída em movimento `perda` e entrada em `ajuste`
> assinado, e já tem estorno.

Por isso D6 e D7 cabem no mesmo mecanismo, com um relatório só e um caminho de
correção só. Não se cria tabela nova para a sobra.

---

## 4. Modelo de dados

`inventario_itens` tem chave primária `(inventario_id, sku)`. Acrescentar
variação a ela exigiria **reconstruir a tabela** — a mesma operação sensível em
SQLite que mantém a P11 parada. Este desenho não faz isso: três tabelas novas,
duas colunas aditivas, e a tabela antiga vira leitura de inventário histórico.

```sql
-- A contagem VIVA. Existe linha = foi contado. Não existe = não contado.
-- É esta ausência que implementa D2: o silêncio nunca é lido como zero.
CREATE TABLE inventario_contagem (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  -- '' é o SKU sem variação. Coluna NOT NULL com default '' porque ela entra
  -- na chave primária, e NULL em chave primária não compara.
  variacao      TEXT    NOT NULL DEFAULT '',
  variante_id   TEXT,
  contado       INTEGER NOT NULL CHECK (contado >= 0),  -- 0 = conferido, não tem
  contado_em    TEXT    NOT NULL DEFAULT (datetime('now')),
  origem        TEXT,                                   -- bipagem | digitado
  PRIMARY KEY (inventario_id, sku, variacao)
);

-- D5: a quantidade que ela viu e não soube dizer qual variação era.
-- Nunca vira movimento. Só aparece no relatório e bloqueia o SKU.
CREATE TABLE inventario_nao_identificado (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  qtd           INTEGER NOT NULL CHECK (qtd > 0),
  contado_em    TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (inventario_id, sku)
);

-- O retrato CONGELADO no fechamento, por variação. Mesmo motivo do §6.1:
-- inventário que muda de resultado depois de fechado não prova nada.
CREATE TABLE inventario_resultado (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  variacao      TEXT    NOT NULL DEFAULT '',
  variante_id   TEXT,
  contado       INTEGER,                       -- NULL = não conferido (D3)
  esperado      INTEGER NOT NULL,              -- o saldo comparável, já retroagido
  delta_pos     INTEGER NOT NULL DEFAULT 0,    -- movimentos entre contar e fechar
  dif           INTEGER,                       -- NULL quando não comparável
  situacao      TEXT    NOT NULL,              -- ver seção 7
  aplicado_em   TEXT,
  saida_id      INTEGER REFERENCES saidas_sem_faturamento(id),
  PRIMARY KEY (inventario_id, sku, variacao)
);
```

Duas colunas em tabelas existentes, ambas `ALTER TABLE ADD COLUMN` puro —
nenhuma reconstrução:

```sql
ALTER TABLE saidas_sem_faturamento ADD COLUMN inventario_id INTEGER REFERENCES inventarios(id);
ALTER TABLE inventarios            ADD COLUMN pausado_em TEXT;
```

E o índice que faz a idempotência ser do **banco**, não da aplicação:

```sql
CREATE UNIQUE INDEX idx_saida_inventario_unica
  ON saidas_sem_faturamento (inventario_id, sku, COALESCE(variacao, ''))
  WHERE inventario_id IS NOT NULL AND estornada = 0;
```

É a mesma proteção que `movimentos.reconciliacao_item_id` tem hoje, e vale sob
crash-e-retry e sob duas abas abertas — o que o flag `ajustado` não garante.
A cláusula `estornada = 0` é deliberada: uma diferença estornada **pode** ser
lançada de novo, com o valor certo.

---

## 5. Estados

```
aberto ──pausar──▶ pausado ──retomar──▶ aberto
   │                   │
   └──── concluir ─────┴──▶ concluido ──aplicar──▶ concluido
   │                                     (item a item, nunca "todos")
   └──── cancelar ─────────▶ cancelado
```

Pausar é explícito e não muda nada além de `pausado_em`: a contagem já está no
banco desde o primeiro bipe. Isso é o que faz D1 sobreviver a fechar o
navegador, acabar a bateria e trocar de aparelho.

**Um inventário pausado não trava operação nenhuma.** Venda, maleta e acerto
continuam. É isso que cria a deriva da seção 6 — e é por isso que ela é tratada
em vez de escondida. Ver **S6**.

---

## 6. Deriva entre contar e fechar

O caso real: ela conta `748801` na segunda e acha 7. Na quarta vende 2. Fecha o
inventário na sexta. O sistema diz 5, ela contou 7. **Não há divergência
nenhuma** — e o desenho ingênuo registraria uma sobra de 2 e devolveria ao
estoque duas peças que estão com a cliente.

Os movimentos daquele intervalo **estão registrados**, com `criado_em`. Lê-los
não é adivinhar. Decisão D10, o cálculo:

```
esperado_hoje       = produtos.qtd − consignado          (no fechamento)
delta_pos           = SUM(movimentos.qtd)
                        WHERE sku [e variação]
                          AND criado_em > contagem.contado_em
esperado_comparavel = esperado_hoje − delta_pos
dif                 = contado − esperado_comparavel
```

No exemplo: `5 − (−2) = 7`, `dif = 0`. Nenhum movimento é gerado, e a linha
aparece marcada **"mexeu depois que você contou: 2 saídas"** — para ela ver que
a conta foi feita, e por quê.

Duas situações que o desenho **não** engole:

1. **D11.** SKU com variação cadastrada cujos movimentos do intervalo vierem
   sem variação: não dá para saber de qual aro saíram. A retroação não pode ser
   provada, e a linha vai para `nao_comparavel`, sem sugestão, com o motivo
   escrito. É a regra 2 do `CLAUDE.md` aplicada ao intervalo;
2. `delta_pos` só conhece movimento **registrado**. Peça que saiu de casa sem
   lançamento continua aparecendo como falta — que é o comportamento certo: é
   exatamente o que o inventário existe para achar.

As duas alternativas foram consideradas e recusadas: congelar no fechamento
(o comportamento de hoje) erra toda contagem que não seja do mesmo dia;
recontagem obrigatória do item que mexeu é segura, mas na prática obriga contar
tudo de uma vez, matando D1.

---

## 7. Contagem, variação e fechamento

### 7.1 Tri-estado (D2)

| Estado | Representação | Como acontece |
|---|---|---|
| não contado | **sem linha** em `inventario_contagem` | padrão |
| contado, tem N | linha com `contado = N` | bipou N vezes, ou digitou |
| contado, não tem nenhuma | linha com `contado = 0` | gesto explícito na tela |

Ausência de linha nunca é lida como zero — nem no fechamento, nem no relatório,
nem na aplicação.

### 7.2 Variação (D4, D5)

```
bipou 748801  ──▶  o SKU tem variação cadastrada?
                     │
                não  └─▶ conta direto, +1. Fim.
                     │
                sim  └─▶ régua das variações CADASTRADAS do SKU:
                           [ Aro 16 ] [ Aro 17 ] [ Aro 18 ]  [ Não sei ]
                         ela toca uma. +1 naquela variação.
```

- a régua vem de `produto_variacoes`. Nunca texto livre;
- **"Não sei" é botão de primeira classe**, não caminho de erro. Soma em
  `inventario_nao_identificado`, aparece no relatório como contada-sem-identidade
  e **bloqueia a aplicação daquele SKU inteiro**, dizendo por quê;
- SKU com variação cadastrada **não aceita** contagem agregada: a API recusa
  `contado` sem `variacao` com 409 e devolve a lista de variações. Reúso direto
  de `pendencias.js › escolherVariacao`, que já valida nome ou `variante_id`,
  recusa o que não está cadastrado e devolve o cardápio dentro do erro;
- repetir a mesma variação é normal: três peças aro 16 são três bipes.

### 7.3 O fechamento devolve cinco listas (D3)

| Lista | Quem entra | Correção em lote |
|---|---|---|
| Conferido | `dif = 0` | — |
| Faltando | `dif < 0`, comparável | permitida, com confirmação |
| Sobrando | `dif > 0`, comparável | permitida, com confirmação |
| **Não conferido** | sem linha de contagem | **nenhuma.** Sem sugestão, sem seleção, sem botão |
| **Não comparável** | "não sei" pendente, ou deriva sem identidade | **nenhuma.** Só o motivo |

O relatório abre pela cobertura: *"você conferiu 214 de 790 códigos"*. Concluir
com cobertura parcial é permitido e não é erro — é o caso normal de quem parou.
`inventarios.desconhecidos_json` continua como está: código bipado fora do
catálogo é anunciado, não engolido (§22).

Kits e configurações montáveis continuam fora da contagem, pelos motivos já
registrados: kit não tem saldo próprio, e contar uma configuração produziria a
dupla contagem que o modelo do item 3 existe para impedir.

---

## 8. Aplicação da diferença

Um item por chamada, ou lote **só de itens comparáveis explicitamente
nomeados**. Nunca "todos".

O servidor **não aceita quantidade do cliente**. Ele relê `inventario_resultado`,
que está congelado desde o fechamento, e usa a `dif` de lá. Número enviado pelo
cliente é ignorado: ele já foi decidido no fechamento.

Cada item vira uma chamada a `saidas.js › registrar`:

| Sinal | tipo | sentido | movimento | efeito no saldo |
|---|---|---|---|---|
| `dif < 0` | `perda` | `saida` | `perda` | baixa |
| `dif > 0` | `perda` | `entrada` | `ajuste` assinado | soma |

com `sku`, `variacao`, `variante_id`, `qtd = |dif|`,
`motivo = "Diferença de inventário #<id>"`, `observacao` opcional dela,
`inventario_id` preenchido, `estoque_refletido = 1` e **`origem = 'inventario'`
no movimento** (D9 — o motivo diz que é diferença; a origem diz que o fato
nasceu de uma contagem física, e é ela que a tela de histórico da peça mostra).

O rastro fecha nos dois sentidos: `saidas_sem_faturamento.movimento_id` aponta
para o movimento, e `inventario_resultado.saida_id` aponta para a linha. Nenhum
texto livre no caminho.

**Correção de erro é estorno** (D12), que `saidas.js` já implementa: um segundo
movimento devolve a peça e a linha continua no histórico dizendo o que houve.
Nunca um segundo ajuste manual, e o índice único da seção 4 libera o relançamento
depois do estorno.

---

## 9. Contrato de rotas

### Preservadas

As sete rotas atuais continuam existindo com o mesmo caminho e o mesmo formato.
`PUT /api/inventarios/:id/contagem` e `POST /api/inventarios/:id/ajustar`
continuam servindo o dashboard legado.

Duas mudanças de comportamento a declarar na caracterização da Fase 2:

- `POST /ajustar` passa a recusar item **não contado** e item **não comparável**;
- `POST /concluir` passa a devolver as cinco listas da seção 7.3 em vez de duas,
  mantendo `faltando` e `sobrando` com o formato atual para não quebrar a tela
  legada.

### Novas

```
POST   /api/inventarios/:id/itens              upsert de uma linha de contagem
DELETE /api/inventarios/:id/itens/:sku         volta para "não contado"
POST   /api/inventarios/:id/nao-identificado   registra a quantidade sem identidade
POST   /api/inventarios/:id/pausar
POST   /api/inventarios/:id/retomar
GET    /api/inventarios/:id/resultado          o retrato congelado, por variação
POST   /api/inventarios/:id/aplicar            gera saída/sobra dos itens nomeados
```

O contrato de campos está na seção 11, que é a versão para a trilha de produto.

---

## 10. O que a implementação vai ter que provar

1. contagem sobrevive a pausar, fechar o navegador e trocar de aparelho;
2. **não contado nunca vira faltante** — nem no relatório, nem em lote;
3. contado-zero explícito gera diferença; não contado não gera nada;
4. SKU com variação nunca produz movimento sem variação: a rota recusa;
5. "não sei" bloqueia o SKU e não movimenta nada;
6. deriva: contar 7, vender 2, fechar → `dif = 0`, e a linha diz que mexeu;
7. deriva sem identidade de variação → `nao_comparavel`, zero movimento;
8. negativa gera `perda`/saída e positiva gera `ajuste`/entrada, **as duas** com
   `inventario_id` e `origem = 'inventario'`;
9. aplicar duas vezes o mesmo item é recusado **pelo índice**, não pela aplicação;
10. estorno devolve a peça e libera o relançamento;
11. `GET /api/estoque/conferir` vazio antes e depois;
12. **nenhum movimento histórico é reescrito** — os 78 continuam intactos;
13. `produtos.qtd` nunca escrito direto (gate já existente em
    `scripts/razao-estoque.test.mjs`).

### Migration

Classe C, aditiva: três `CREATE TABLE`, dois `ADD COLUMN`, dois índices. Nenhum
`DROP`, nenhuma tabela reconstruída, nenhum backfill, testável nas duas direções.
Rollback é descartar as tabelas novas; o inventário antigo continua legível.

O baseline da Fase 0 **não prova** que `migracao-inventario.sql` está aplicada em
produção. A migration nova precisa verificar isso antes de rodar, e não presumir.

---

## 11. Contrato de UX/API para a trilha de produto

Esta seção é a que vai para quem desenha a tela. Ela descreve **o que a API
oferece**; ela não aprova layout, e material depositado em `docs/ux/` continua
não sendo ordem de implementação.

### Os cinco gestos da tela

| Gesto | Rota | Corpo | Resposta |
|---|---|---|---|
| começar | `POST /api/inventarios` | — | `201 {id, iniciadoEm, status}` · `409` se já houver um aberto |
| contar uma peça | `POST /api/inventarios/:id/itens` | `{sku, variacao?, varianteId?, contado, origem}` | `200 {sku, variacao, contado, contadoEm}` |
| não sei qual é | `POST /api/inventarios/:id/nao-identificado` | `{sku, qtd}` | `200 {sku, qtd}` |
| pausar / retomar | `POST …/pausar` · `POST …/retomar` | — | `200 {status, pausadoEm}` |
| terminar | `POST /api/inventarios/:id/concluir` | — | o relatório abaixo |

Corrigir um engano de contagem: reenviar o mesmo `POST /itens` com o número
certo (é upsert), ou `DELETE /api/inventarios/:id/itens/:sku?variacao=` para
voltar ao estado "não contado".

### Regras que a tela precisa respeitar

1. **Não contado nunca é zero.** A tela nunca manda `contado: 0` por dedução.
   Zero só sai de um gesto explícito, rotulado sem ambiguidade: *"Conferi, não
   tem nenhuma"*;
2. **SKU com variação exige a régua.** Se o SKU tiver variações cadastradas, a
   API recusa contagem agregada com `409` e devolve
   `{erro, variacoes: [{nome, varianteId}]}`. A tela usa essa lista, e não
   inventa nome de variação;
3. **"Não sei" é um botão, não um erro.** Fica ao lado das variações, com o
   mesmo peso visual. Quem toca nele precisa entender que aquela peça foi
   contada e **não** será corrigida enquanto ninguém disser qual é;
4. **A contagem não tem limite.** Bipar mais do que o sistema espera é normal e
   vira sobra. Recusar a peça seria mandar a contagem obedecer ao sistema;
5. **Código fora do catálogo é aviso, não erro.** Volta em `desconhecidos`;
6. **Pausado é um estado visível**, com a cobertura ao lado: *"214 de 790
   códigos conferidos"*.

### O relatório do fechamento

```jsonc
{
  "id": 12, "concluidoEm": "2026-09-14",
  "cobertura": { "conferidos": 214, "total": 790 },
  "conferido": 180,
  "faltando":  [ /* linhas comparáveis, dif < 0 */ ],
  "sobrando":  [ /* linhas comparáveis, dif > 0 */ ],
  "naoConferido":   [ { "sku": "…", "desc": "…", "esperado": 3 } ],
  "naoComparavel":  [ { "sku": "…", "desc": "…", "motivo": "…", "contado": 4 } ],
  "desconhecidos":  [ "777777" ]
}
```

Linha comparável:

```jsonc
{
  "sku": "748801", "desc": "Anel Solitário", "variacao": "Aro 16",
  "contado": 7, "esperado": 5, "dif": 2,
  "deltaPos": -2,
  "aviso": "mexeu depois que você contou: 2 saídas",
  "valor": 318.00, "aplicado": false
}
```

Regras de tela para o relatório:

- **`naoConferido` e `naoComparavel` não têm caixa de seleção, não têm sugestão
  e não entram em nenhum botão de lote.** Não é estilo: é a trava que impede um
  inventário parado pela metade de zerar o catálogo;
- o botão de lote, quando existir, só age sobre linhas de `faltando` e
  `sobrando`, e diz quantas e quais;
- `aviso` aparece na linha sempre que `deltaPos != 0`. É o que explica por que o
  número da tela não é a subtração que ela faria de cabeça;
- `naoComparavel` sempre mostra o motivo por extenso. "Não deu" não é motivo.

### Aplicar

```
POST /api/inventarios/:id/aplicar
  { "itens": [ { "sku": "748801", "variacao": "Aro 16", "observacao": "caiu atrás da gaveta" } ] }
```

A quantidade **não vai no corpo** — o servidor usa a `dif` congelada. A
observação é opcional e livre. A resposta devolve, por item, a linha de saída
criada e o movimento correspondente.

Desfazer: **estorno da linha de saída**, pela tela de Saídas sem Faturamento que
já existe. A tela de inventário não oferece "corrigir de novo".

---

## 12. Pendências para validação com a Sthefany

Nenhuma delas bloqueia o desenho, e **nenhum dado real foi alterado por causa
delas**. Ficam registradas aqui até a conversa acontecer.

| # | Pergunta | O que destrava |
|---|---|---|
| S1 | Quantidade física atual da Veneziana `444032` | cadastro do Monte Seu Colar (item 3, §5) |
| S2 | Realidade física do legado `326660` na maleta 12 | o ajuste do saldo legado, que é decisão de inventário |
| S3 | Quais variações ela diferencia hoje na etiqueta | a régua de variação da tela (7.2) |
| S4 | Como identifica fisicamente cada variação | se a régua basta, ou se precisa de foto/medida ao lado |
| S5 | Quantidades reais dos demais componentes do Monte Seu Colar | cadastro dos 4 SKUs ausentes |
| S6 | Vende e monta maleta enquanto um inventário está pausado? | confirma que a deriva da seção 6 é real, e não teórica |

Sobre **S6**: se a resposta for "ela para tudo enquanto conta", a comparação
retroagida continua correta e simplesmente nunca dispara. **Não vale simplificar
o desenho apostando nessa resposta** — a aposta errada devolve peça vendida ao
estoque.

---

## 13. Estado anterior, para quem for implementar

O que existia antes deste desenho, medido em `496cc0e`:

- `inventarios` e `inventario_itens`, PK `(inventario_id, sku)`, sem variação;
- sete rotas em `api/src/http/routes/operacao.js`;
- `api/src/inventario.js`, 238 linhas: abrir, salvar contagem (substitui tudo,
  descarta `qtd <= 0`), concluir (congela `esperado`, compara), ajustar
  (movimento `ajuste`, `origem='inventario'`, trava por flag `ajustado`),
  cancelar, detalhe, listar, resumo;
- `SQL_ESPERADO` desconta o consignado de maletas `aberta` e `em_acerto`, e
  exclui kits e configurações montáveis;
- tela: modo de bipagem `inventario` no dashboard legado, sem limite;
- teste: um cenário do caminho feliz em `src/e2e.mjs`, nível navegador. Nada
  cobre variação, pausa, deriva ou concorrência.

O que **não** existe e este item não cria: inventário de maleta. A conferência
de devolução do acerto é outro mecanismo — o que não volta vira **venda**, não
diferença de inventário. Os 43 movimentos incompletos ligados a maleta seguem
sendo assunto da Fase 6, não deste item.
