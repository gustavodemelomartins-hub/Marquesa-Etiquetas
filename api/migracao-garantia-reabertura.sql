-- ═══════════════════════════════════════════════════════════════════════
--  Fase 5.4e — o novo atendimento é um caso NOVO, ligado ao anterior
-- ═══════════════════════════════════════════════════════════════════════
--
--  A REGRA (Sthefany, 12/09/2026)
--
--  Uma nova troca da mesma peça só acontece dentro de 7 DIAS ÚTEIS e com a
--  ETIQUETA ainda na peça. E o histórico do atendimento anterior tem de
--  continuar visível: ele existiu, terminou, e isso não se apaga.
--
--  O QUE ESTAVA ERRADO
--
--  Reabrir era `UPDATE garantias SET status='em_reparo', encerrada_em=NULL`.
--  A data em que a peça foi entregue sumia da linha, os dois ciclos viravam
--  um só, e a pergunta "quantas vezes esta peça voltou?" deixava de ter
--  resposta. §28: cancela, não apaga — e aqui nem cancelava.
--
--  O MODELO
--
--  O caso anterior PERMANECE ENCERRADO, com o `encerrada_em` dele e os
--  eventos dele. O novo atendimento é uma linha nova em `garantias`,
--  apontando para a mesma unidade física (`venda_item_id`) e ligada à
--  anterior por `garantia_anterior_id`. Cada ciclo tem o próprio prazo, os
--  próprios eventos e a própria troca.
--
--  É a menor solução que preserva as seis coisas exigidas: caso original,
--  encerramento original, eventos originais, nova abertura, vínculo entre os
--  ciclos e rastreabilidade. Nada é reescrito; só se acrescenta.
--
--  A ETIQUETA
--
--  O sistema não tinha — e continua não tendo — como SABER se a etiqueta
--  está na peça: isso é alguém olhando a peça no balcão. A coluna não
--  inventa o dado, ela GUARDA A CONFIRMAÇÃO de quem olhou, para o caso
--  poder ser auditado depois. Sem confirmação explícita o backend recusa a
--  reabertura, em vez de assumir que sim.
--
--  ROLLBACK
--
--    DROP INDEX idx_gar_anterior;
--
--  As colunas podem ficar: são aditivas e nuláveis, e nenhum código
--  anterior a esta migration as lê.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. o vínculo entre os ciclos
ALTER TABLE garantias ADD COLUMN garantia_anterior_id INTEGER REFERENCES garantias(id);

-- ─── 2. a confirmação humana que autorizou o novo atendimento
--
-- NULL   = caso de primeira abertura; a pergunta não se aplica.
-- 1      = alguém confirmou que a etiqueta estava na peça.
-- 0      = alguém confirmou que NÃO estava. Nunca gravado por reabertura
--          válida, e reservado para quem um dia quiser registrar a recusa.
ALTER TABLE garantias ADD COLUMN etiqueta_preservada INTEGER;

-- Quantos dias úteis se passaram entre o encerramento anterior e esta
-- reabertura, congelado no momento em que a regra foi conferida. Recalcular
-- depois daria outro número se a tabela de feriados mudar, e a pergunta
-- "isto foi autorizado corretamente na época?" precisa de resposta estável.
ALTER TABLE garantias ADD COLUMN reabertura_dias_uteis INTEGER;

CREATE INDEX IF NOT EXISTS idx_gar_anterior ON garantias(garantia_anterior_id);

-- ─── 3. nada a converter
--
-- Toda garantia existente é primeira abertura: `garantia_anterior_id` nulo
-- é a verdade sobre cada uma delas. As reaberturas feitas pelo caminho
-- antigo — UPDATE apagando o encerramento — não deixaram rastro estruturado
-- e não podem ser reconstruídas. Isso não é disfarçado: os eventos de
-- `garantia_eventos` continuam sendo o único registro daqueles casos, e é
-- lá que a mudança de status aparece.
