-- Prova de que as revendedoras não foram tocadas: contagem, soma de ids e
-- uma impressão digital do conteúdo cadastral. Rodar ANTES e DEPOIS do
-- reset e comparar as três linhas — têm que bater exatamente.
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
