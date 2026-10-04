# Claude SEO local no Codex — Marquesa

Instalação de instruções e referências em 03/10/2026. Não é implantação do
SEO Engine nem confirmação de integrações ativas.

A rodada seguinte implementou wrappers locais Codex-first para conectividade
e inteligência comercial; veja [runtime e conectividade](MARQUESA_INTELLIGENCE_CONNECTIVITY.md).
Ela não instalou Claude Code nem mudou os 176 arquivos do toolkit. O escopo
abaixo registra a instalação original; acesso Google continua pendente.

## Escopo e procedência

- Origem: [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo).
- Revisão fixa: `ff87fcee0734845d3f59128c8c905799ee2298da`; hub declara `2.4.1`.
- Destino exclusivo: `.agents/skills/`, dentro deste projeto.
- Mecanismo: `skill-installer` oficial do Codex, com `--dest` explícito,
  `--ref` fixo e `--method download`. Não executamos instaladores upstream.
- 33 nomes únicos: 26 diretórios principais e 7 extensões adicionais.
  `seo-dataforseo` e `seo-image-gen` usam as cópias principais; os espelhos
  das extensões não foram instalados uma segunda vez.
- Inventário de origem e SHA-256 de cada arquivo em
  [claude-seo-manifest.json](claude-seo-manifest.json).
- As 10 skills próprias da Marquesa foram preservadas. Não houve instalação
  global, mudança de hooks, secrets, configuração MCP, tema ou infraestrutura.

A referência `npx -y skills@latest add AgriciDaniel/claude-seo --skill '*' --agent codex`
é compatível com Codex e escopo de projeto: a [documentação do CLI](https://github.com/vercel-labs/skills)
declara `.agents/skills/` e reserva `--global` para instalação global.
Foi escolhido o instalador oficial disponível na sessão para evitar executar
um pacote npm remoto e fixar a revisão antes da instalação. O ambiente possui
PowerShell, Git, Node 24.19.0 e Python 3.14.7.

`.agents/` já está ignorado pelo Git. Mantivemos essa regra: arquivos locais
não aparecem no diff comum. O manifesto versionável permite revisar e
reproduzir a seleção. Reinstalação deve abortar se um destino já existir;
atualizações exigem revisão de origem, comparação de hashes e preservação
das adaptações locais. Nunca usar `skills update --all` por reflexo.

## Hierarquia obrigatória

Antes de usar qualquer skill SEO, carregar [AGENTS.md](../../AGENTS.md),
[SECURITY.md](../SECURITY.md), [api/REGRAS.md](../../api/REGRAS.md) e o contexto
Marquesa do domínio. As regras do pedido humano vigente têm precedência.
As skills genéricas são ferramentas, sem autoridade sobre estoque, preço,
cadastro, publicação ou estratégia de marca.

Cada `SKILL.md` instalado recebeu, depois do frontmatter original, o mesmo
aviso local apontando para este documento. O manifesto registra os hashes
originais e adaptados; as referências upstream permanecem intactas.

Nesta primeira rodada, somente inspeção, instalação local e documentação.
Nenhuma ação contra dados reais, nenhuma publicação, migration remota ou
deploy. Para rodadas futuras, o contrato de aprovação de catálogo e os gates
da Marquesa continuam obrigatórios. Preparar conteúdo não equivale a aprovar.

## Seleção por responsabilidade

| Skills | Responsabilidade | Uso na Marquesa |
|---|---|---|
| `seo` | Hub e roteamento | Quando o domínio é conhecido mas o trabalho exato ainda não |
| `seo-audit` | Consolida auditorias | Pontual; não disparar todos os agentes periodicamente |
| `seo-page`, `seo-ecommerce` | PDP/categoria, jornada comercial, checklist e-commerce | Prioridade; considerar Nuvemshop, dados reais e disponibilidade |
| `seo-technical` | Crawl, indexabilidade, canonical, performance | Auditoria do storefront público; ERP interno não é landing page SEO |
| `seo-schema` | Validar/propor dados estruturados | Conferir markup existente antes de sugerir complemento |
| `seo-sitemap` | Sitemap e cobertura | Ler sitemap gerado pela loja antes de propor outro |
| `seo-images` | Alt, formatos, dimensões e apresentação | Com galeria/R2 existentes; preservar original e fidelidade da peça |
| `seo-content`, `seo-content-brief` | Qualidade, intenção e briefing | Descrições e editoria com fatos verificáveis |
| `seo-plan` | Estratégia por tipo de negócio | Planejamento de e-commerce com metas comerciais |
| `seo-google` | GSC, GA4, PSI, CrUX e APIs Google | Prioridade após acesso somente leitura e adaptação do runtime |
| `seo-cluster` | Clustering baseado em SERPs | Relevante; distinguir análise linguística de dados SERP realmente coletados |
| `seo-drift` | Comparação de snapshots | Reaproveitar conceito; integrar ao ledger existente, evitar SQLite paralelo como verdade |
| `seo-sxo` | Experiência de busca e landing page | Relevante junto a conversão e disponibilidade |
| `seo-geo` | Busca assistida por IA e citabilidade | Condicional; não prometer ranking/citações |
| `seo-backlinks` | Links e referências externas | Condicional, baseado em dados e custo |
| `seo-flow` | Framework editorial e prompts | Opcional, sobreposto a planejamento/briefing; preservar atribuições |
| `seo-local`, `seo-maps` | Presença local e mapas | Somente com operação/localidade confirmadas |
| `seo-hreflang` | Idiomas e regiões | Baixa prioridade sem loja multilíngue comprovada |
| `seo-programmatic` | Páginas em escala | Condicional; nenhuma página sem intenção e utilidade próprias |
| `seo-competitor-pages` | Comparações com concorrentes | Baixa prioridade; padrões e evidências, sem copiar conteúdo |
| `seo-agentic` | Acesso por agentes e superfícies técnicas | Experimental, sem alterar tema nesta fase |
| `seo-dataforseo` | SERP/keywords via MCP | Opcional pago; estimar custo e conferir disponibilidade |
| `seo-image-gen` | Imagens geradas | Opcional; não fabricar características/retratos da peça |
| `seo-ahrefs` | Keywords/backlinks via serviço externo | Opcional, credencial/plano/MCP |
| `seo-bing` | Bing Webmaster e IndexNow | Opcional; submissão é ação externa distinta da leitura |
| `seo-firecrawl` | Crawling por serviço externo | Opcional, MCP/chave/limites |
| `seo-matomo` | Analytics alternativo | Redundante se GA4 atender; não instalar uma segunda medição por padrão |
| `seo-profound`, `seo-seranking` | Visibilidade em respostas de IA | Opcional, pago; posterior ao básico |
| `seo-unlighthouse` | Lighthouse multipágina | Sobrepõe performance/PSI; runtime Node/browser separado |

As 33 skills não devem ser carregadas em toda tarefa. Use a folha exata e
evidência mínima suficiente. Notas genéricas de tamanho de título, quantidade
de palavras/fotos e notas 0–100 são heurísticas, não contratos da loja nem
requisitos universais do Google. Não inventar material, banho, pedra,
medida, garantia, review, preço ou disponibilidade para satisfazer checklists.

## Compatibilidade real e dependências pendentes

As instruções Agent Skills e referências estão instaladas. **O runtime
executável do plugin Claude não está instalado/configurado.** Referências a
`${CLAUDE_PLUGIN_ROOT}`, `$HOME/.claude`, slash commands, agentes/modelos Claude,
launcher Bash e MCPs não se tornam ferramentas do Codex por cópia do Markdown.
Não executar literalmente esses comandos nesta instalação.

Os scripts compartilhados do topo do upstream e seus agentes não foram
copiados. Sua adaptação futura deve usar runtime isolado local, resolução de
caminhos explícita e runner determinístico testado; nunca Python/pip global
nem scripts de setup que alterem a configuração pessoal por conveniência.
Dependências upstream incluem requests/BeautifulSoup/lxml, Playwright e
Chromium, bibliotecas Google Auth/API/GA4/Ads e, para relatórios, matplotlib,
numpy, WeasyPrint e openpyxl. Nada disso foi instalado nesta rodada.

As instruções podem ser lidas e aplicadas com ferramentas disponíveis no
Codex; APIs e runners não configurados devem aparecer como pendência, nunca
como integração funcional. As novas skills serão descobertas no próximo
turno/sessão do Codex conforme recarga do catálogo de skills.

## Restrições específicas

- Google: usar acesso somente leitura para GSC/GA4. `index`, envio de sitemap,
  IndexNow e ajustes de configuração são ações externas, não auditorias.
- A [Indexing API do Google](https://developers.google.com/search/apis/indexing-api/v3/using-api)
  limita o uso a páginas elegíveis de vagas e eventos transmitidos. Não usar
  esse comando para PDPs de semijoias.
- Publicação: passar pelo fluxo existente de rascunho, aprovação vigente e
  writer Marquesa; nunca publicar diretamente por ferramenta genérica.
- Identidade: no schema atual `produtos.sku` é a chave local; `produto_id_loja`
  é referência Nuvemshop. Não inventar `product_id` interno nem casar por nome.
- Dados operacionais e clientes não são enviados a MCP externo. Usar apenas
  dados públicos ou recortes mínimos explicitamente autorizados.
- Watchdog: script compara hash/timestamp e só cria evento quando houver
  mudança relevante; IA analisa evento, hipótese e texto. Não executar LLM
  só para confirmar que nada mudou.
- Custos: registrar fornecedor, skill/revisão, chamadas, tokens quando
  disponíveis, custo real/estimado e limite por execução; não inventar zero.

## Verificação e rollback local

Verificação da instalação: nomes únicos, frontmatter `name`/`description`,
hashes por arquivo, referências presentes, zero colisões e hashes das
configurações/skills anteriores preservados. Isso não prova API, crawling,
Google, MCP ou publication runtime.

Rollback da instalação: remover apenas os 33 diretórios novos identificados
no manifesto após conferir caminhos e hashes; preservar as 10 skills próprias
e qualquer edição posterior. Não usar remoção global ou limpeza recursiva
de `.agents`. Nenhum rollback remoto é necessário nesta rodada.
