-- Prova de que as revendedoras não foram tocadas.
--
-- Não é só a contagem: a soma dos ids pega uma troca de linha que mantivesse
-- o total, e a impressão digital pega uma edição de cadastro que mantivesse
-- contagem e ids. Rodar ANTES e DEPOIS do reset; as três colunas têm que
-- bater exatamente.
SELECT COUNT(*)                                  AS revendedoras,
       COALESCE(SUM(id), 0)                      AS soma_ids,
       COALESCE(SUM(LENGTH(COALESCE(nome,'')
                         || COALESCE(tel,'')
                         || COALESCE(cidade,'')
                         || COALESCE(cpf,'')
                         || COALESCE(endereco,'')
                         || COALESCE(obs,'')
                         || status
                         || criada_em)), 0)      AS impressao_digital
  FROM revendedoras;
