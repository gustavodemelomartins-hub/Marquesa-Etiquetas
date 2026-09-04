---
name: safe-d1-change
description: OBRIGATÓRIA antes de qualquer mudança no banco — schema, migration, tabela, coluna, índice, ALTER, DROP, D1, SQLite. Sete etapas em ordem, sem pular nenhuma. Migration destrutiva nunca é executada automaticamente.
---

# Mudança segura no D1

Este banco guarda **estoque real e vendas reais**. Não existe versionamento
de migrations (elas são aplicadas à mão) e o `wrangler d1 execute --remote`
não pede confirmação. As duas coisas juntas fazem desta a área de maior
risco do projeto.

> **Nenhuma migration é executada automaticamente. Nunca.**
> Nem em produção, nem "só um `ALTER TABLE`, é seguro".
> Você **propõe**; uma pessoa executa.

## As sete etapas, em ordem

### 1. Entender o schema atual

Leia [api/schema.sql](../../../api/schema.sql) — é a fonte da verdade, e é
comentado. O porquê de cada tabela está em
[docs/DATA_MODEL.md](../../../docs/DATA_MODEL.md).

Descubra também o que **produção** realmente tem. Não é a mesma pergunta:

```bash
npx wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

> **Endereçe pelo binding `DB`, nunca pelo nome.** Sem `--env`, o
> `api/wrangler.toml` resolve `DB` para **`marquesa-db-prod`**
> (`51dd629b-…`), que é a produção desde o go-live de 2026-08-22. O nome
> `marquesa-db` ainda resolve — e aponta para a cópia **congelada de
> rollback** (`089153a9-…`), a única volta que o projeto tem. Ver
> [api/DEPLOY.md](../../../api/DEPLOY.md).

Só leitura, mas **`--remote` sempre pede confirmação humana**. Não rode
sozinho.

Sem controle de migrations, `schema.sql` é o que *deveria* estar lá. Um
`ALTER TABLE` esquecido só aparece quando uma query quebra em produção.

### 2. Identificar o impacto

Responda por escrito, antes de escrever SQL:

- [ ] A invariante `produtos.qtd == SUM(movimentos.qtd)` continua valendo?
- [ ] Alguma chave estrangeira aponta para o que você vai mexer? O D1 força
      FK em toda query e **não aceita `PRAGMA foreign_keys`**.
- [ ] Algum índice único some? `idx_vendas_externo` é a idempotência dos
      pedidos: **removê-lo faz o cron cobrar a mesma venda duas vezes**.
- [ ] Que rotas leem essa tabela? (`state.js` monta o payload inteiro do
      dashboard.)
- [ ] O front espera algum campo que vai mudar de nome ou de tipo?
- [ ] Qual o volume de linhas afetadas?
- [ ] Dá para fazer aditivo? Coluna nova com `DEFAULT`, tabela nova,
      preenchimento depois. **Aditivo é sempre preferível.**

### 3. Verificar o backup

```bash
npx wrangler d1 export DB --remote \
  --output ../backups/d1/<AAAA-MM-DD_HH-mm>/marquesa-db-prod.sql
```

Depois **confira** que o arquivo presta — tamanho, `CREATE TABLE`, `INSERT`,
e a razão fechando. O procedimento está em
[docs/BACKUP_RECOVERY.md](../../../docs/BACKUP_RECOVERY.md).

Anote também o bookmark de Time Travel:

```bash
npx wrangler d1 time-travel info marquesa-db-prod
```

**Sem backup conferido, a etapa 7 não acontece.** Não é formalidade: é a
única coisa que transforma um erro em contratempo.

### 4. Elaborar a migration

Um arquivo novo, `api/migracao-<assunto>.sql`, seguindo o padrão dos que já
existem.

Regras:

- **Idempotente onde der**: `CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`.
- **`ALTER TABLE ADD COLUMN` não é idempotente** — falha se a coluna já
  existe. Escreva no comentário que esse erro significa "já foi aplicada",
  como faz `api/migracao-variacoes.sql`.
- **SQLite não tem `DROP COLUMN` nem `ALTER COLUMN`** em toda versão. Mudar
  o tipo ou tirar coluna exige tabela nova, copiar, apagar, renomear — e aí
  é migration destrutiva: ver a regra no fim.
- **Sem `PRAGMA foreign_keys`**: o D1 não aceita.
- Comente **por que**, não o que. O `schema.sql` já diz o quê.
- Atualize o `schema.sql` na mesma mudança — ele é a fonte da verdade para
  quem cria o banco do zero.
- Se o `schema.sql` mudou, regere o derivado:
  `node api/gerar-schema-console.mjs`.

### 5. Testar localmente

```bash
cd api
rm -rf .wrangler/state                                   # pare o wrangler dev antes
npx wrangler d1 execute DB --local --file=schema.sql
npx wrangler d1 execute DB --local --file=migracao-<assunto>.sql
npx wrangler dev --local --port 8787
```

Teste **os dois caminhos**:

- banco do zero (`schema.sql` novo) — o caminho de quem cria o banco;
- banco antigo + migration — o caminho de produção. Se der para simular o
  schema anterior, melhor ainda.

E rode a suíte, com banco limpo entre cada teste:

```bash
node src/sync-test.mjs && node src/variacoes-test.mjs && node src/kits-test.mjs
```

Ver [docs/TESTING.md](../../../docs/TESTING.md) para o passo a passo no
Windows.

### 6. Validar os dados

```sql
-- a invariante
SELECT COUNT(*) FROM produtos p
  LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m
    ON m.sku = p.sku
 WHERE p.qtd <> COALESCE(m.soma, 0);          -- tem de ser 0

-- nenhum registro perdido
SELECT (SELECT COUNT(*) FROM produtos)   AS produtos,
       (SELECT COUNT(*) FROM movimentos) AS movimentos,
       (SELECT COUNT(*) FROM vendas)     AS vendas;

-- os índices críticos continuam lá
SELECT name FROM sqlite_master WHERE type='index' AND name IN
  ('idx_vendas_externo','idx_mov_sku','idx_variacoes_sku');
```

E, com o Worker no ar: `GET /api/state` responde e `GET /api/estoque/conferir`
volta vazio.

### 7. Só então propor produção

Entregue à pessoa, por escrito:

- [ ] o arquivo da migration;
- [ ] o que ela muda, em uma frase;
- [ ] o resultado do teste local (as duas direções);
- [ ] a confirmação do backup: caminho do arquivo e o bookmark;
- [ ] o **comando exato** que ela vai rodar;
- [ ] o **plano de rollback**, escrito antes;
- [ ] quanto tempo o banco fica inconsistente, se ficar.

```bash
# quem roda isto é uma pessoa, nunca o agente
npx wrangler d1 execute marquesa-db --remote --file=migracao-<assunto>.sql
```

## Migration destrutiva

`DROP TABLE`, `DROP COLUMN` (via recriação), `DELETE` em massa, mudança de
tipo, remoção de índice único.

**Nunca automaticamente. Nunca sem uma frase humana que diga exatamente o
que vai ser apagado.** E, ainda assim:

1. export conferido, imediatamente antes;
2. bookmark de Time Travel anotado;
3. o dado antigo preservado em outro lugar quando possível — coluna nova em
   vez de substituição, tabela `_antiga` em vez de `DROP`;
4. §28 do negócio: **não apagar histórico**. Revendedora arquiva, maleta
   cancela, venda estorna. Uma migration que apaga histórico contraria uma
   regra de negócio, não só uma boa prática.

## Erros específicos do D1 que já custaram tempo

| Sintoma | Causa |
|---|---|
| `Requests without any query are not supported` | O console do painel divide por `;` e um pedaço só com comentário vira query vazia. Use `api/schema-console.sql` |
| `duplicate column name` | `ALTER TABLE ADD COLUMN` já aplicado. Significa "já foi", pode ignorar |
| FK violando sem `PRAGMA` | O D1 força FK sempre e não aceita `PRAGMA foreign_keys` |
| `Device or resource busy` ao apagar `.wrangler/state` | O `wrangler dev` segura o SQLite. Pare o processo primeiro |

## Melhoria estrutural pendente

`wrangler d1 migrations` existe nesta versão e resolveria a ausência de
controle de versão — mas adotá-lo exige mapear o estado real de produção
primeiro. Registrado em [docs/TECH_DEBT.md](../../../docs/TECH_DEBT.md),
item 1.
