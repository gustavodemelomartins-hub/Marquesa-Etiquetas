# Marquesa Intelligence — Google conectado, PSI/CrUX pendentes

Estado em 04/10/2026; candidato local, sem release. Branch develop, HEAD
98e8772a2253c101fc22b7730d429f0aa40b09d6. Arquivos anteriores não commitados
foram preservados. Nenhum deploy, migration, publicação, alteração de tema,
escrita D1/R2/Nuvemshop ou push nesta continuação.

## Conectividade comprovada

- Projeto marquesa-seo confirmado no Console autenticado.
- Search Console, Analytics Data, PageSpeed e CrUX habilitadas.
- Conta marquesa-seo-readonly existente, com credenciais históricas de agosto.
  Credencial mais recente validada e reutilizada na pasta externa protegida;
  nenhum conteúdo privado exposto, nenhuma chave remota criada/removida.
- GSC direto autenticado, propriedade sc-domain:marquesasemijoias.com.br,
  acesso siteRestrictedUser; leitura de 28/90 dias funcionando.
- GA4 propriedade 473886060 confirmada na interface da loja; Data API e funil
  alpha funcionando. Admin API discovery retornou 403 e foi dispensada, sem
  habilitar API adicional ou ampliar IAM.

## Baseline real

Datas consolidadas escolhidas: 02–29/09/2026 (28 dias) e 02/07–29/09/2026
(90 dias). A resposta de maturidade do conector informou 29/09 como último
dia consolidado; 30/09 não entrou. Não tratar como histórico de agosto nem
como resultado até a data de elaboração deste documento.

| Métrica | 28 dias | 90 dias |
|---|---:|---:|
| GSC cliques | 21 | 37 |
| GSC impressões | 974 | 2.150 |
| GSC CTR | 2,156% | 1,721% |
| GSC posição média | 9,515 | 10,076 |
| Linhas query / page / query+page | 52 / 267 / 56 | 122 / 392 / 128 |
| GA4 sessões totais | 285 | 1.143 |
| GA4 sessões orgânicas | 47 | 172 |
| GA4 sessões engajadas orgânicas | 28 | 103 |
| GA4 compras / receita registradas | 0 / R$ 0 | 0 / R$ 0 |

GSC foi recuperado primeiro por conector interativo, depois reproduzido pela
service account. Raw de ambas as fontes permanece local/ignorado. O conector
retorna CTR em pontos percentuais; o importer preserva raw e normaliza para
fração clicks/impressions. Query anonimizada/top rows impede somar queries
como se representassem todo o tráfego. Datas 28/90 se sobrepõem, não são
comparação antes/depois.

GA4 tem metadata BRL/America_Sao_Paulo (API: America/Sao_Paulo), sem restrição
de receita informada. Todos os 16 relatórios internos (quatro por escopo e
período) tiveram status collected, além de dois funis. Purchase está ausente
nos relatórios de eventos. Zero reportado não prova ausência de vendas:
tracking, consentimento, pedidos Nuvemshop e cobertura de ingestão ainda
precisam ser validados. Funil alpha usa usuários em coorte fechada ordenada,
pode atravessar sessões e não é conversão por sessão/produto.

## O próximo ponto humano — atualização da continuação

Uma chave API já existe. Após o humano retornar, a lista de credenciais mostrou
3 APIs e a dica de restrições confirmou CrUX, PageSpeed e Search Console salvas.
O Codex acionou Copiar chave, recebeu confirmação Código copiado e fechou a
exibição, sem imprimir o valor. Falta colar a chave em GOOGLE_API_KEY no `.env`
externo protegido e salvar; doctor ainda informou configured=false. Depois
testar PSI/CrUX e interpretar quota/ausência de amostra sem fabricar CWV.
A política do navegador exige confirmação no momento de ampliar permissões
por uma credencial. Nenhuma proteção ou restrição antiga foi removida.

## Implementação e verificação

Comandos novos: configure-google (metadados projeto/GSC/GA4 sem alterar tokens)
e import-gsc-connector (raw antes da transformação, valida propriedade,
período, maturidade e paginação, reimportação idêntica sem novo pending).
Alterados config.py, __main__.py, exemplos .env e runbook; adicionados
connector.py e testes focados. Arquivos candidatos de rodadas anteriores
continuam sem commit. Dados reais apenas em .local/intelligence ignorado;
credenciais fora do clone, com ACL usuário/SYSTEM. No sandbox, essa pasta
protegida aparece ausente; doctor foi verificado no contexto real do usuário.

88 testes unitários passaram; git diff --check passou. Coletas reais GSC/GA4,
consistência de totais entre conector/direto e reimportação sem mudança
verificadas. Não repetimos coleta paga/LLM. Zero chamadas LLM nos runners.
Baseline comercial permaneceu com zero oportunidades A–J justificadas pelo
cruzamento atual: só duas URLs/SKUs possuem canonical público comprovado,
nenhuma cobertura completa de pedidos site, margem histórica desconhecida.
Nenhuma recomendação foi convertida automaticamente em publicação.

## Continuidade

Após chave: probes PSI/CrUX; validar pedidos/tracking e canonical por IDs;
medir cobertura comercial; registrar scheduler determinístico apenas após
validar seu contexto de usuário/ACL. SERP, Content Brain e publicação ainda
seguem backlog. Esta execução não representa configuração completa de todos
os módulos Marquesa Intelligence.

Referências: [runbook](../operations/MARQUESA_INTELLIGENCE_CONNECTIVITY.md),
[arquitetura](../architecture/MARQUESA_INTELLIGENCE_PLAN_2026-10-03.md),
[rodada local anterior](MARQUESA_INTELLIGENCE_CONNECTIVITY_2026-10-03.md).
