-- O mapa das fotos ANTES do reset: qual SKU aponta para qual objeto no R2.
--
-- Importa porque o reset apaga a LINHA em produtos, e é a linha que guarda
-- a chave do objeto. Os bytes continuam no bucket (não apagamos nada no
-- R2), mas sem este mapa ninguém sabe mais de quem eram.
--
-- Na prática a chave é reconstruível — `fotos-storage.js › chaveFoto` a
-- monta como `produtos/<sku>/original` e `produtos/<sku>/tratada`, sem
-- timestamp nem extensão. Ainda assim vale guardar o retrato: ele diz
-- quais SKUs REALMENTE têm objeto no bucket, o estado de cada um, e a URL
-- da loja de quem ainda não teve os bytes copiados.
SELECT sku,
       foto_status,
       foto_origem,
       foto_original_key,
       foto_original_tipo,
       foto_original_tam,
       foto_tratada_key,
       foto_tratada_tipo,
       foto_tratada_tam,
       foto_url,
       foto_em
  FROM produtos
 WHERE foto_original_key IS NOT NULL
    OR foto_tratada_key  IS NOT NULL
    OR foto_url          IS NOT NULL
 ORDER BY sku;
