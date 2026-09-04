-- ═══════════════════════════════════════════════════════════════════════════
-- §2 — a recusa de escolher entre homônimas precisa ser DURÁVEL
--
-- O defeito, encontrado no teste de duas "Cliente sem nome":
--
--   Vender para um nome que tem DOIS cadastros já era tratado direito na
--   escrita — `registrarVenda` se recusa a escolher e deixa `cliente_id`
--   nulo, porque nome não é identidade. A venda fica sem dono, o que é a
--   resposta certa.
--
--   Só que "sem dono" era indistinguível de "ainda não amarrada". No dia em
--   que uma das duas homônimas fosse RENOMEADA, o nome passaria a apontar
--   para uma pessoa só — e a venda sem dono, que ninguém nunca atribuiu,
--   entrava inteira na ficha da que sobrou. R$ 199 mudavam de dona por
--   causa de uma edição de cadastro, sem ninguém decidir nada.
--
-- Uma coluna resolve: a recusa fica escrita. `cliente_ambiguo = 1` quer
-- dizer "o sistema olhou e se recusou a escolher" — e isso não deixa de ser
-- verdade porque a população de cadastros mudou depois.
--
-- ADITIVA e sem efeito financeiro: nenhuma soma de faturamento, peças,
-- vendas ou ticket médio olha para esta coluna. Ela só decide de QUEM é a
-- linha nas telas que identificam pessoa.
--
-- IDEMPOTENTE não é possível com ALTER TABLE ADD COLUMN no SQLite: rodar
-- duas vezes devolve "duplicate column name". Esse erro é o sinal de que a
-- migration JÁ ESTÁ aplicada — não é sucesso, e não é dano. O UPDATE abaixo
-- é idempotente e pode rodar sozinho quantas vezes for.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE vendas ADD COLUMN cliente_ambiguo INTEGER NOT NULL DEFAULT 0;

-- O backfill olha a evidência que existe hoje: venda sem dono cujo nome
-- normalizado é dividido por mais de um cadastro. É exatamente a situação
-- em que a escrita teria se recusado a escolher — e é exatamente a que não
-- pode ser resolvida por acidente amanhã.
UPDATE vendas
   SET cliente_ambiguo = 1
 WHERE cliente_id IS NULL
   AND cliente_nome_norm IS NOT NULL
   AND (SELECT COUNT(*) FROM clientes c WHERE c.nome_norm = vendas.cliente_nome_norm) > 1;

CREATE INDEX IF NOT EXISTS idx_vendas_ambiguo ON vendas(cliente_ambiguo, cliente_nome_norm);
