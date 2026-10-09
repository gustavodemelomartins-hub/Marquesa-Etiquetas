# Operação integral de SEO do catálogo

O catálogo é enumerado pela API oficial antes da publicação. Quantidades
históricas e o inventário do Merchant não substituem a contagem da Nuvemshop.
O runner reutiliza `api/src/catalogo/conteudo-seguro.js`, importado da implementação
existente; não expõe rota HTTP nem altera o Worker, D1 ou a sincronização de estoque.

## Conteúdo e proteção comercial

O runner aceita somente `description`, `seo_title` e `seo_description` revisados.
Nome comercial, SKU, variantes, preços, estoque, fotos, publicação, handle e
vínculos comerciais de categorias são preservados. Os títulos respeitam o
limite confirmado na API de **70 bytes UTF-8**, inclusive acentos.

Cada produto exige identidade da loja, variante/SKU, conteúdo da auditoria,
plano com hash, backup durável anterior ao PUT, duas leituras contra concorrência
e readback completo de conteúdo e comércio. Falha de disco impede a escrita.
Escrita incerta ou divergência de comércio interrompe o processamento. Erros
isolados de página pública são registrados e permitem continuar o catálogo.

A API de categoria substitui campos omitidos: o adapter envia **os mesmos**
`name`, `handle` e `parent` da leitura imediata, além do conteúdo aprovado. Raiz
usa `parent:null`, que a API devolve como `0`. A hierarquia e todos os demais
campos são comparados depois da escrita. Categoria não é produto e não deve
receber o payload parcial usado no endpoint de produto.

A correção revisada de `google_shopping_category` usa o mesmo adapter via
`updateCategoryShopping`. Ela exige backup e SEO existente não vazio, retém
integralmente o conteúdo já publicado e admite somente a taxonomia de joias
aprovada para a categoria real. Nome, handle, hierarquia e demais campos
continuam sujeitos ao readback. Efetuar essa operação depois da verificação
dos planos de produto: a API embute metadados das categorias nos produtos,
e uma alteração autorizada nessa metadata muda o hash comercial antigo.

## Arquivos privados

Snapshots, credenciais, planos, HTML, exportações Merchant e journal ficam em
diretório local ignorado pelo Git. O snapshot `seo-before-YYYY-MM-DD.json` é
imutável. O runner atual exige o snapshot da operação de 08/10/2026; uma nova
operação deve adaptar explicitamente a identificação da execução.

O perfil protegido existente fornece autenticação em processo. Nenhum comando
deve imprimir valores de credenciais. Logs mostram apenas IDs, estados e
motivos. O relatório versionável contém metadados públicos e resultados
sintéticos, sem dumps, preços, quantidades de estoque ou dados pessoais.
`scripts/seo-catalog-report.py` gera o CSV integral e recusa fechamento com
estado desconhecido, skip sem justificativa ou registro escrito sem ambas
as provas `businessOk:true` e validação pública limpa.

## Execução

Os caminhos abaixo são argumentos explícitos. `writer-root` aponta para o
checkout que contém o escritor existente e o parser de inteligência; `python`
aponta para o runtime isolado previamente verificado. O parser não faz parte
do runtime do Worker.

```powershell
node scripts/seo-catalog-runner.mjs --writer-root <checkout> --storage <diretorio-privado> --python <python-isolado> --kind products --drafts products-reviewed.json --mode preview
node scripts/seo-catalog-runner.mjs --writer-root <checkout> --storage <diretorio-privado> --python <python-isolado> --kind products --drafts products-reviewed.json --mode apply
node scripts/seo-catalog-runner.mjs --writer-root <checkout> --storage <diretorio-privado> --python <python-isolado> --kind products --drafts products-reviewed.json --mode verify
```

`--limit` serve para controle inicial. A execução integral não usa limite.
`COMPLETE` exige que todo registro esteja `VALIDATED` ou `SKIPPED` justificado;
`PENDING`, `WRITTEN` e `FAILED` não qualificam como conclusão. Preview não é
publicação. Os switches de escrita continuam exigindo a string exata `true`.

## Retomada e cache

O runner salva os estados de todos os registros antes de escrever. Na retomada,
um plano gravado é conferido contra a leitura atual. Conteúdo desejado e
comércio original intactos permitem somente readback, sem repetir PUT.
Alteração posterior ou plano adulterado exige reconciliação. O journal mantém
a evidência anterior mesmo quando um reparo editorial gera outro plano.

A página pública precisa refletir title, meta, descrição, canonical, identidade,
imagens, SKU, preço, estoque e variantes, além de Product/Offer válidos.
Product principal é identificado pela URL da própria oferta, inclusive quando
está em `WebPage.mainEntity`; Products das recomendações não o substituem.
Warnings de campos recomendados permanecem no relatório.

O verificador registra `requested_url`. Caminhos equivalentes com e sem barra
final podem ter caches distintos; a prova preserva a canonical e registra a
resposta antiga em `cached_alias_proof`. A conferência posterior da forma
original fecha a propagação sem repetir PUT.

Cloudflare pode servir conteúdo anterior depois de um PUT válido. Leitura com
query de verificação não comprova bypass do cache e nunca recebe validação
final da URL limpa. Uma prova alternativa válida permite estado `WRITTEN`,
com validação limpa pendente. Falha alternativa continua como `FAILED` com
`written:true`. O modo `verify` repete somente leituras; não reescreve conteúdo.

Recontar elegibilidade se houver interrupção longa: estoque pode mudar pelo
fluxo comercial da loja. Preservar o estoque atual, justificar os esgotados e
analisar os reabastecidos. Nunca restaurar estoque histórico por causa do SEO.

Quando o plano de um controle anterior divergir apenas em estoque já observado
num snapshot independente, `--stock-snapshot <snapshot>` é aceito **somente**
em `--mode verify --kind products`. O conteúdo desejado deve estar intacto;
preços, SKU, IDs, nome, variantes, imagens e todos os campos não relacionados
ao estoque devem corresponder ao plano original. O estoque atual deve ser
exatamente o do snapshot fornecido. A reconciliação ganha um evento no journal,
sem modificar o plano/recibo original e sem habilitar PUT ou rollback. Uma
nova diferença de estoque ou de qualquer outra invariante exige investigação.

Na auditoria após a publicação, `--reviewed-categories <arquivo>` conserva
categorias revisadas somente quando os três campos na API e título/meta no
HTML correspondem ao plano editorial. Isso impede regenerar uma introdução
genérica sobre conteúdo que já foi revisado. Divergências continuam exigindo
revisão; nenhuma escrita é feita pelo auditor.

## Rollback e acompanhamento

`rollbackContentPlan` restaura somente os campos efetivamente alterados e
recusa edições concorrentes posteriores. Exige plano e recibo com hashes,
journal durável e flags existentes. Não executar rollback de comércio.
Categorias usam backup integral e payload que preserve nome/handle/hierarquia;
a API pode rejeitar descrição vazia. Institucionais têm backups independentes.

D0 vem de Search Console e da data real de cada publicação. D7, D28, D56 e D84
são datas de acompanhamento, não promessa de ganho. Resubmissão de sitemap
solicita leitura pelo Google e não garante indexação, aprovação ou vendas.

Testes direcionados:

```powershell
node --test scripts/test-catalog-content-writer.mjs scripts/seo-catalog-runner.test.mjs
python scripts/seo-catalog-audit.test.py
```
