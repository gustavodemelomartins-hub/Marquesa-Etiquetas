# Baseline de contratos HTTP — Fase 0

- **Captura:** 2026-09-09
- **Código-fonte:** `api/src/index.js` em `04edb022455e417b8389d2163b2f007b7dd3ecff`
- **Escopo:** 142 contratos método/caminho em 141 decisões do despachante, mais `OPTIONS *`.
- **Natureza:** caracterização do monólito atual; não é desenho da API futura.

## Contrato transversal

`OPTIONS *` é público e devolve 204. `ANY /api/health` e `GET /api/nuvemshop/callback` não usam Bearer. A leitura de foto original/tratada usa assinatura HMAC temporária. Todo o restante exige `Authorization: Bearer <API_KEY>`. Personalização exige ainda `PERSONALIZACAO_ATIVA`, hoje desligada.

Respostas normais são JSON UTF-8 com CORS. As exceções são callback OAuth em HTML e foto em bytes. Bearer inválido retorna 401; validação, em geral 400; conflito/invariante 409; rota ausente 404; migration/quota/feature indisponível 503; exceção não tratada 500. O comportamento existente inclui três riscos a preservar até migração deliberada: health aceita qualquer método, OAuth responde HTML 200 também para falhas e o 500 expõe `detalhe` técnico ao cliente autenticado.

Legenda: **R** leitura; **C** comando local; **H** alto risco de domínio; **X** integração externa; **A** agregação/read model.

## Inventário completo

### Plataforma, OAuth e estado

Proprietário proposto: Plataforma; `/api/state` é read model transversal. Consumidores: dashboard legado e React. Tabelas centrais: praticamente todo o estado operacional. Módulos: `auth.js`, `state.js`, `d1-metrica.js`, `nuvemshop-oauth.js`.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `ANY /api/health` | R | Público; sem DB; `{ok, hoje}`. |
| `GET /api/state` | A | Snapshot agregado v2; sem escrita. |
| `PUT /api/config` | C/H | Lista fechada de chaves; valida `syncCorteEm`. |
| `GET /api/nuvemshop/callback?code=` | X/H | Público; troca OAuth e mostra token em HTML; não persiste token. |

### Estoque, catálogo e importações

Proprietários: Estoque para razão/saldo; Catálogo para produto/categoria/fila. Consumidor principal: legado; reconciliação de planilha também é usada pelo React. Tabelas: `produtos`, `movimentos`, `categorias`, `produtos_pendentes`, `loja_snapshot`. Testes: `catalogo`, `import-total`, `estoque-total-e2e`, `produtos-novos-e2e`, `editar-peca`.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/estoque/conferir` | R | Confere razão contra saldo materializado. |
| `GET /api/estoque/:sku/movimentos` | R | Razão e saldos do SKU. |
| `GET /api/categorias` | R | Lista ordenada. |
| `POST /api/categorias` | C | Upsert por nome. |
| `POST /api/produtos/importar` | C/H | Cria com zero e lança movimento inicial/delta. |
| `POST /api/loja/importar` | C/H | Atualiza somente o espelho local. |
| `POST /api/estoque-total/analisar` | R | Analisa planilha, sem escrita. |
| `POST /api/estoque-total/aplicar` | C/H | Aplica deltas via razão. |
| `POST /api/produtos/novos/analisar` | R | Analisa sem cadastrar. |
| `POST /api/produtos/novos/cadastrar` | C/H | Cadastra apenas inexistentes. |
| `GET /api/produtos/pendentes` | R | Lista fila. |
| `POST /api/produtos/pendentes` | C | Enfileira. |
| `DELETE /api/produtos/pendentes` | C/H | Remove SKUs informados da fila. |

Invariante: `produtos.qtd == SUM(movimentos.qtd)`; nenhuma importação grava saldo sem movimento rastreável.

### Fotos e publicação interna

Proprietário: Catálogo/Mídia/Publicação. Tabelas: `produtos`, `fotos_orfas`, `loja_fotos`, `catalogo_publicacoes`; efeitos em R2 e serviços de imagem. Publicação é interna e declara `escritaNaLoja:false`.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `POST /api/fotos/sincronizar` | C/X | Lê catálogo externo; `seco` não grava. |
| `POST /api/fotos/vincular-da-loja` | C/X | Vincula URL; `seco`/`refazer`. |
| `POST /api/fotos/importar-da-loja` | C/X/H | Baixa bytes e grava R2/metadados. |
| `GET /api/produtos/:sku/fotos` | R | Galeria. |
| `GET /api/fotos/orfas` | R | Lista órfãs. |
| `POST /api/fotos/orfas/adotar` | C | Adota por `{id,sku}`. |
| `PUT /api/produtos/:sku/foto/:versao` | C | Corpo binário para `original`/`tratada`. |
| `DELETE /api/produtos/:sku/foto` | C/H | Remove bytes e metadados. |
| `POST /api/produtos/:sku/foto/fundo-branco` | C/X | Processa ou registra pendência. |
| `GET /api/produtos/:sku/foto/:versao?exp=&sig=` | R | Público com HMAC; bytes; 401/404. |
| `GET /api/catalogo/publicacao` | A | Fila, prontos e bloqueios. |
| `POST /api/catalogo/publicacao/:sku/preparar` | C/X | Prepara rascunho. |
| `POST /api/catalogo/publicacao/:sku/previa` | C | Gera prévia. |
| `POST /api/catalogo/publicacao/:sku/aprovar` | C/H | Aprovação interna com gates. |
| `POST /api/catalogo/publicacao/:sku/reabrir` | C | Reabre item. |
| `POST /api/catalogo/publicacao/:sku/repetir` | C | Repete preparação. |

### Produto, variações, kits e SKU

Proprietários: Catálogo para ciclo/identidade; Estoque para razão, distribuição e kits. Tabelas: `produtos`, `movimentos`, `produto_variacoes`, `loja_variantes`, `kit_componentes`, referências históricas.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `PATCH /api/produtos/:sku` | C | Edita campos permitidos; recusa `qtd`. |
| `POST /api/produtos/:sku/movimento` | C/H | Movimento explícito no razão. |
| `POST /api/produtos/:sku/repartir` | C/H | Distribuição deve fechar o total. |
| `POST /api/variacoes/desfazer-semeadura` | C/H | Contrapartidas; não apaga histórico. |
| `POST /api/loja/variantes/importar` | C/X | Espelho externo; suporta seco. |
| `GET /api/loja/variantes/:sku` | R | Variantes espelhadas. |
| `GET /api/variacoes/revisao` | A | Casos recusados pelo sync. |
| `GET /api/variacoes/reconciliacao` | A | Compara três fontes. |
| `POST /api/produtos/:sku/variacoes/distribuir` | C/H | Distribui por `variant_id`. |
| `PUT /api/produtos/:sku/variacoes` | C/H | Estrutura local, sem mudar quantidade. |
| `GET /api/produtos/:sku/variacoes` | A | Estrutura, loja e saldos. |
| `GET /api/produtos/:sku/dependencias` | A | Histórico/referências. |
| `DELETE /api/produtos/:sku` | C/H | Só sem dependências. |
| `POST /api/produtos/:sku/arquivar` | C | Inativa sem apagar. |
| `POST /api/produtos/:sku/desarquivar` | C | Reativa. |
| `GET /api/produtos/sku/checar?sku=` | R | Formato/disponibilidade. |
| `POST /api/produtos/sku/gerar` | C | Reserva SKU definitivo. |
| `GET /api/produtos/sku/auditoria?amostra=` | A | Amostra máxima 200. |
| `GET /api/produtos/:sku/componentes` | R | Composição do kit. |
| `PUT /api/produtos/:sku/componentes` | C/H | Define/remove kit; sem kit aninhado. |

### Pendências

Read model transversal; comandos pertencem aos domínios que corrigem. Lê vendas, clientes, variantes, maletas, garantias, histórico, catálogo e razão.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/pendencias?tipo=&adiadas=1` | A | Projeção unificada. |
| `POST /api/pendencias/adiar` | C | Adia por chave/data. |
| `POST /api/pendencias/retomar` | C | Retoma por chave. |
| `POST /api/pendencias/variacao/venda` | C/H | Corrige identidade sem segunda baixa. |
| `POST /api/pendencias/variacao/maleta` | C/H | Distribui identidade consignada. |

### Revendedoras e maletas

Proprietário: Revendedoras/Maletas. Tabelas: `revendedoras`, `maletas`, `maleta_itens`, `movimentos`, `vendas`. Consumidores: legado e React de maletas.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `POST /api/revendedoras` | C | Cadastro. |
| `PATCH /api/revendedoras/:id` | C | Ficha/status. |
| `POST /api/revendedoras/:id/arquivar` | C | Recusa se houver maleta aberta. |
| `POST /api/maletas` | C | Abre maleta. |
| `PATCH /api/maletas/:id` | C | Metadados; fechamento/cancelamento proibidos. |
| `POST /api/maletas/:id/itens` | C/H/X | Consigna e sincroniza. |
| `POST /api/maletas/:id/acerto` | C/H/X | Devolução/falta/venda e sync. |
| `POST /api/maletas/:id/cancelar` | C/H/X | Contrapartidas e sync; não apaga. |

Consignação/devolução têm efeito zero no estoque total; preço é congelado e acerto gera venda.

### Clientes

Proprietário: Clientes. Tabelas: `clientes`, `clientes_vinculo_revisao`, vendas e históricos. Consumidores: legado e busca global React.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/clientes?busca=&limite=` | R | Busca; máximo 100. |
| `POST /api/clientes` | C | Cria ficha. |
| `GET /api/clientes/perfil?id=|norm=` | A | Perfil agregado. |
| `PATCH /api/clientes/:id` | C/H | Ficha e vínculo histórico seguro. |
| `GET /api/clientes/revisao` | A | Casos ambíguos. |
| `POST /api/clientes/revisao/:id` | C/H | Vincula ou separa. |

Nome não é identidade e homônimos não são fundidos automaticamente.

### Sincronização Nuvemshop

Proprietário: Nuvemshop; sync é serviço de aplicação. Consumidores: legado, React e `scheduled()`. Tabelas: `config`, `sync_execucoes`, vendas, razão, catálogo, snapshot e maletas.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `POST /api/sync` | C/H/X | `{forcar,seco}`; pull antes de push. |
| `GET /api/sync` | R | Histórico. |
| `POST /api/sync/analisar` | R/X | Preview puro; não abre execução nem grava. |
| `POST /api/vendas/:id/nuvemshop` | C/H/X | Retry/publicação de saldo absoluto. |

Nuvemshop é destino do estoque físico; pedidos são idempotentes por `externo_id`; SKU/variante ambíguo falha fechado; seco não escreve.

### Reconciliação

Proprietário: Reconciliação. Tabelas: `reconciliacao_sessoes`, `reconciliacao_itens`, catálogo e razão. Consumidores: legado e React de planilha.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `POST /api/reconciliacao` | C/X | Cria sessão Nuvemshop. |
| `POST /api/reconciliacao/planilha/estoque-total/analisar` | C | Sessão; sem alterar estoque. |
| `POST /api/reconciliacao/planilha/produtos-novos/analisar` | C | Sessão; sem alterar catálogo. |
| `GET /api/reconciliacao/:id` | R | Sessão e itens. |
| `POST /api/reconciliacao/:id/itens/:itemId/aprovar` | C | Aprovação item a item. |
| `POST /api/reconciliacao/:id/itens/:itemId/rejeitar` | C | Rejeição item a item. |
| `POST /api/reconciliacao/:id/cancelar` | C | Cancela sessão. |
| `POST /api/reconciliacao/:id/aplicar` | C/H/X | Idempotente, retomável e com precondition fresca. |

### Inventário

Proprietário: Estoque/Inventário. Tabelas: `inventarios`, `inventario_itens`, catálogo, razão e consignado.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/inventarios` | R | Lista. |
| `POST /api/inventarios` | C | Abre um; recusa segundo aberto. |
| `GET /api/inventarios/:id` | R | Detalhe. |
| `PUT /api/inventarios/:id/contagem` | C | Registra contados/desconhecidos. |
| `POST /api/inventarios/:id/concluir` | C | Calcula diferenças, sem ajustar. |
| `POST /api/inventarios/:id/ajustar` | C/H | Ajuste explícito via razão, uma vez/item. |
| `POST /api/inventarios/:id/cancelar` | C | Cancela sem apagar. |

### Vendas, pagamento e personalização

Proprietários: Vendas; liquidação em Financeiro; Personalização é subdomínio opcional. Tabelas: vendas/itens, clientes, razão, catálogo, variantes, kits e tabelas de personalização. Consumidor principal: legado.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `POST /api/vendas` | C/H/X | Venda, itens, desconto, pagamento e eventual sync. |
| `GET /api/vendas?data=` | R | Vendas do dia. |
| `GET /api/vendas/dia?data=` | A | Histórico comercial consolidado. |
| `GET /api/vendas/lancamentos?data=` | A | Cartões consolidados. |
| `POST /api/vendas/:id/pagamento` | C/H | Liquida/estorna liquidação; nunca estoque. |
| `GET /api/personalizacao/modelos?inativos=1` | R | 503 enquanto feature desligada. |
| `POST /api/personalizacao/modelos` | C | Modelo/opções; 503 enquanto desligada. |
| `POST /api/vendas/corrigir-item` | C/H | Corrige identidade sem duplicar baixa. |
| `GET /api/vendas/correcoes?limite=&offset=` | R | Auditoria. |
| `POST /api/vendas/:id/cancelar` | C/H/X | Contrapartidas e sync; não apaga. |
| `GET /api/vendas/pagamento/auditoria` | A | Classificação somente leitura. |

Preço ausente e variante ambígua bloqueiam; preço/desconto ficam congelados; pagamento não movimenta estoque; personalização integra a venda em vez de criar uma segunda.

### Histórico de vendas

Proprietário: Vendas/Histórico. Tabelas: lotes, itens brutos, projeções reconstruídas, clientes e operações. O bruto nunca é apagado.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `POST /api/vendas/historico/analisar` | R | Analisa linhas/arquivo sem escrita. |
| `POST /api/vendas/historico/importar` | C/H | Importa com hash idempotente; estoque zero. |
| `GET /api/vendas/historico/lotes` | R | Lista lotes. |
| `GET /api/vendas/historico/retrato` | A | Retrato derivado. |
| `POST /api/vendas/historico/substituir` | C/H | Reverter+importar atômico. |
| `POST /api/vendas/historico/lotes/:id/reverter` | C/H | Reverte sem apagar bruto. |
| `POST /api/vendas/historico/reconstruir` | C/H | Recalcula projeção; preserva decisões. |
| `GET /api/vendas/historico/reconstrucao` | A | Estado da reconstrução. |
| `POST /api/vendas/historico/operacoes` | C/H | Plano hash; seco ou aplicação explícita. |

### Contas a receber

Proprietário: Financeiro. Une vendas operacionais, diferenças de troca e histórico sem fundir identidades; a chave preserva origem e a concorrência usa versão/estado esperado.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/contas-receber?status=` | A | Lista unificada. |
| `PATCH /api/contas-receber/prazo` | C/H | Prazo com controle concorrente. |
| `POST /api/contas-receber/receber` | C/H | Liquidação; não toca estoque. |
| `POST /api/contas-receber/:id/marcar-paga` | C/H | Liquida item histórico. |
| `PATCH /api/contas-receber/:id/vencimento` | C/H | Altera vencimento histórico. |

### Analytics e lista comercial

Proprietário: Analytics/read models. Somente leitura transversal; deve evitar dupla contagem operacional/histórica e declarar semântica de data.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/analytics/painel?periodo=` | A | KPIs. |
| `GET /api/analytics/crm?periodo=` | A | CRM. |
| `GET /api/analytics/revendedoras?periodo=` | A | Revendedoras. |
| `GET /api/analytics/vendas?periodo=` | A | Vendas. |
| `GET /api/analytics/mes?mes=AAAA-MM` | A | Fechamento mensal. |
| `GET /api/analytics/evolucao?periodo=&granularidade=` | A | Série temporal. |
| `GET /api/analytics/produtos?periodo=&por=&limite=` | A | Ranking; máximo 200. |
| `GET /api/analytics/categorias?periodo=` | A | Categorias. |
| `GET /api/analytics/origem?periodo=` | A | Origem. |
| `GET /api/analytics/clientes?periodo=&ordem=&limite=` | A | Clientes; máximo 500. |
| `GET /api/vendas/lista?de=&ate=&busca=&canal=&limite=&offset=` | A | Lista paginada; máximo 1000. |

### Saídas sem faturamento

Proprietário: Estoque para o movimento; Vendas/Saídas para o caso de uso. Tabelas: `saidas_sem_faturamento`, `movimentos`, `produtos`.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/saidas?de=&ate=&tipo=&estornadas=&limite=&offset=` | R | Lista. |
| `POST /api/saidas` | C/H | Brinde/uso próprio/perda/sorteio via razão; sem venda. |
| `POST /api/saidas/:id/estornar` | C/H | Contrapartida; não apaga. |

### Garantias e trocas

Proprietário: Garantias; diferença financeira é consumida por Financeiro. A venda original não muda e peça defeituosa não retorna automaticamente ao vendável.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/garantias?status=&limite=&offset=` | R | Lista. |
| `GET /api/garantias/pendentes?limite=` | A | Pendências. |
| `POST /api/garantias` | C | Abre caso ligado à origem. |
| `GET /api/garantias/:id` | R | Caso e eventos. |
| `POST /api/garantias/:id/status` | C | Transição controlada. |
| `POST /api/garantias/:id/troca` | C/H | Registra troca/diferença. |
| `POST /api/garantias/:id/troca/pagar` | C/H | Liquida apenas diferença. |
| `POST /api/garantias/:id/troca/estornar` | C/H | Estorna liquidação. |

### Auditoria e reclassificação histórica

Proprietário: Vendas/Histórico, com consumo por Analytics. Análise é seca; aplicação exige seleção explícita; bruto permanece; desfazer é auditável.

| Contrato | Classe | Entrada/efeito principal |
|---|---:|---|
| `GET /api/historico/auditoria?usoProprio=a,b` | A | Propostas sem escrita. |
| `POST /api/historico/reclassificar` | C/H | Aplica apenas linhas nomeadas. |
| `GET /api/historico/reclassificar?status=` | R | Lista decisões. |
| `DELETE /api/historico/reclassificar/:id` | C/H | Desfaz decisão. |

## Consumidores e pontos de mudança

O legado chama diretamente a maior parte dos contratos dentro de `src/dashboard.tpl.html`. O React depende hoje principalmente de `/api/state`, `/api/sync`, reconciliação por planilha e maletas. `api/src/index.js` é simultaneamente composição, autenticação e despachante; os módulos importados detêm regras, mas ownership de rota não está formalizado no código. `scheduled()` não é HTTP: chama `sincronizar()` e aparece no baseline operacional.

## Riscos de migração

1. `/api/state` é um contrato transversal e amplo; precisa de caracterização antes de ser fatiado.
2. Sync, catálogo antigo e integrações podem representar falha lógica em corpo HTTP 200.
3. Maleta/venda confirmam transação local antes do efeito externo; o resultado externo faz parte da resposta.
4. Reconciliação e histórico carregam idempotência/preconditions e não podem virar CRUD simples.
5. Pendências é projeção transversal, não autoridade de escrita.
6. Publicação de catálogo é interna; aprovação não concede escrita na loja.
7. Pagamento, garantia e histórico jamais podem causar segunda baixa de estoque.

O teste `scripts/phase0-artifacts.test.mjs` caracteriza a contagem do despachante e rotas sentinela. A Fase 1 deve evoluí-lo para método/path, auth e status de cada contrato antes de mover handlers.
