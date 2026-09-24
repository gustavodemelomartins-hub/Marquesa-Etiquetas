# Correção auditável de custo histórico — desenho proposto

**Pendência:** `P12` ([PENDENTES.md](../decisions/PENDENTES.md)) · **Fase:** 5
**Estado:** proposta de arquitetura. **Nada aqui está implementado, e nada aqui
é autorização para implementar.** Não existe migration, rota, tela ou teste
correspondente.

## O que já estava decidido

A regra de negócio fechou antes deste documento: corrigir custo histórico **sem
sobrescrever o passado**. Toda correção preserva valor anterior, valor novo,
motivo, autor e data/hora. Nenhuma alteração silenciosa de histórico. E custo
**não** é preço de venda.

Este documento só responde *como* isso caberia no banco e na API.

## O ponto de partida: não existe custo nenhum

Verificação de 11/09/2026, e ela muda o desenho:

```
grep -c "custo" api/schema.sql   →  0
produtos                         →  sku, desc, cat, preco, qtd, status, ...
```

`produtos.preco` é **preço de venda**. Não há coluna de custo, nem tabela, nem
evento. Isto é terreno limpo: o trabalho não é corrigir um modelo existente, é
escolher um pela primeira vez — e a escolha errada aqui é barata de evitar e
cara de desfazer.

## Três decisões de modelagem, e por que a terceira é a única que serve

**1. Uma coluna `produtos.custo`.** Simples e errada: guarda um número só, e o
custo de uma peça comprada em março não é o de uma comprada em setembro. Não
tem onde pendurar motivo, autor nem valor anterior. Corrigir é sobrescrever —
exatamente o que a regra proíbe.

**2. Coluna + tabela de auditoria ao lado.** Melhor, mas cria duas fontes: o
valor "atual" mora num lugar e a história noutro, e a primeira escrita que
esquecer de gravar o par as separa para sempre. É o mesmo defeito que
`produtos.qtd` teria sem `movimentos`.

**3. Custo como série temporal de eventos** — a que se propõe. O custo **de uma
peça numa data** é uma consulta, nunca um campo. É o mesmo formato que o
sistema já usa para estoque, onde `movimentos` é a razão e `produtos.qtd` é só
o retrato. Aqui não há sequer necessidade de retrato: nada no sistema lê custo
hoje, então não há desempenho a proteger ainda.

## Esboço de schema

Duas tabelas, nenhuma alteração em tabela existente — o que mantém a migration
aditiva e reversível, sem `DROP TABLE`.

```sql
-- O custo vigente de um SKU a partir de uma data. Nunca se edita uma linha
-- desta tabela: corrigir é inserir outra, e a anterior continua verdadeira
-- para o período em que valeu.
CREATE TABLE produto_custos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sku           TEXT NOT NULL REFERENCES produtos(sku),
  custo         REAL NOT NULL CHECK (custo >= 0),
  vigente_desde TEXT NOT NULL,              -- YYYY-MM-DD, o dia do fato
  origem        TEXT NOT NULL               -- como esta linha nasceu
                CHECK (origem IN ('cadastro', 'importacao', 'correcao')),
  -- Quando origem = 'correcao', esta linha corrige uma anterior e diz qual.
  corrige_id    INTEGER REFERENCES produto_custos(id),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  -- Correção sem predecessora não é correção; e nada se corrige a si mesmo.
  CHECK (origem <> 'correcao' OR corrige_id IS NOT NULL),
  CHECK (corrige_id IS NULL OR corrige_id <> id)
);

CREATE INDEX idx_produto_custos_sku_data
  ON produto_custos(sku, vigente_desde);

-- Por que a correção aconteceu. Separada porque 'cadastro' e 'importacao'
-- não têm motivo nem autor, e uma coluna que só faz sentido em um terço das
-- linhas mente sobre o modelo.
CREATE TABLE produto_custo_correcoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  custo_id       INTEGER NOT NULL REFERENCES produto_custos(id),
  custo_anterior REAL NOT NULL,             -- redundante de propósito: ver abaixo
  custo_novo     REAL NOT NULL,
  motivo         TEXT NOT NULL,             -- obrigatório: correção sem porquê não entra
  autor          TEXT NOT NULL,             -- texto livre até P7 existir
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Por que `custo_anterior` é redundante e fica assim.** Ele é derivável de
`corrige_id`. Guardá-lo mesmo assim torna a linha de auditoria legível sozinha,
sem reconstruir a cadeia — e uma trilha de auditoria que depende de uma junção
para ser lida é uma trilha que ninguém lê na hora em que precisa. É a única
redundância proposta, e é deliberada.

**`autor` é texto livre porque `P7` não existe.** Identidade individual é
roadmap (Master Plan § 46.1). Até lá, quem preenche é a aplicação, com o que
souber. Quando `P7` chegar, o campo vira chave estrangeira para `usuarios` — e
a migration é aditiva, porque o texto antigo continua sendo o registro honesto
do que se sabia na época.

## A consulta que define o modelo

```sql
-- Custo vigente de um SKU numa data: a última linha que começou a valer
-- até aquele dia.
SELECT custo FROM produto_custos
WHERE sku = ?1 AND vigente_desde <= ?2
ORDER BY vigente_desde DESC, id DESC
LIMIT 1;
```

Se esta consulta responder certo depois de uma correção retroativa, o modelo
está certo. É o teste que vale a pena escrever primeiro.

## Superfície de API

Três rotas, nenhuma delas destrutiva.

| Rota | Faz | Não faz |
|---|---|---|
| `GET /api/produtos/:sku/custo?data=` | devolve o custo vigente na data (hoje, se omitida) | não calcula margem |
| `GET /api/produtos/:sku/custo/historico` | a série inteira, com as correções e seus motivos | — |
| `POST /api/produtos/:sku/custo/corrigir` | insere a correção e a linha de auditoria, numa transação | **nunca** faz `UPDATE` nem `DELETE` |

`POST` recusa: correção sem `motivo`, custo negativo, e SKU inexistente. Recusar
é a resposta certa — é o mesmo princípio de "produto sem preço é `NULL`, nunca
R$ 0".

## O que este desenho deliberadamente não faz

- **Não toca em `movimentos` nem em `produtos.qtd`.** Custo é dinheiro, estoque
  é peça. A razão contábil não muda porque alguém corrigiu um custo.
- **Não altera nenhuma tabela existente.** Migration aditiva, sem `DROP TABLE`,
  reversível por `DROP` das duas tabelas novas enquanto ninguém as lê.
- **Não calcula margem, lucro nem CMV.** Isso é a pergunta seguinte, depende de
  ter custo confiável primeiro, e embutir a fórmula agora fixaria uma regra de
  negócio que ninguém pediu.
- **Não importa custo retroativo de lugar nenhum.** De onde viria o custo das
  790 peças já cadastradas é uma pergunta aberta — e é de negócio, não de
  arquitetura.

## O que falta decidir antes de implementar

1. **De onde vem o custo das peças que já existem?** Nota fiscal, planilha,
   estimativa por categoria, ou fica em branco até alguém preencher? Um custo
   inventado é pior que custo ausente, porque parece confiável.
2. **Custo por variação?** Um anel aro 16 e um aro 18 podem ter custos
   diferentes. O esboço acima é por SKU; ampliar para variação depois é
   aditivo, mas decidir depois de ter dados é mais caro.
3. **Quem pode corrigir?** Hoje qualquer um com a chave de API. Depende de `P7`.
