# Regras de negócio — Catálogo, Mídia e Publicação

Fonte técnica aprovada: `docs/domains/CONTRATO-UX-API-4-5.md`, implementada e
provada na branch paralela, sem deploy. Este arquivo traduz o contrato para a
interface; não o substitui.

## Invariantes

| ID | Regra | Consequência na UX |
|---|---|---|
| CAT-R001 | Sistema Marquesa é autoridade do produto aprovado; Nuvemshop é canal externo. | Presença na loja é observação, não aprovação nem fonte automática do produto local. |
| CAT-R002 | Preparação, aprovação e publicação são etapas diferentes. | Cada etapa mantém rótulo, responsável e resultado próprios. |
| CAT-R003 | Conteúdo preparado por agente exige aprovação humana. | Não existe atalho de preparação para publicação. |
| CAT-R004 | `falta[]`, `bloqueios[]` e `presencaNaLoja` são dimensões distintas. | Nunca misturar bloqueio de infraestrutura com checklist humano ou presença externa. |
| CAT-R005 | A interface só oferece ações previstas no contrato. | Sem mesclar categoria, correção automática de preço, publicação sem aprovação ou despublicação automática ao arquivar. |
| CAT-R006 | Alterar quantidade diretamente no cadastro é sempre recusado. | Quantidade aparece como leitura; correção de estoque segue o domínio próprio. |
| CAT-R007 | O original da foto não é substituído pela versão preparada. | Galeria diferencia original e preparada; processamento não destrói o original. Exclusão continua ação humana explícita. |
| CAT-R008 | A publicação é seca por padrão e a escrita real está desligada nos ambientes atuais. | Mostrar simulação e bloqueio de capacidade; não oferecer botão ativo que prometa publicação real. |

## Falta, bloqueio e presença

| Dimensão | Valores do contrato | Tratamento visual |
|---|---|---|
| trabalho humano | `nome`, `categoria`, `preco`, `quantidade`, `foto` em `falta[]` | lista única de pendências acionáveis |
| infraestrutura | `sem_r2`, `sem_preparador`, `foto_nao_preparada` em `bloqueios[]` | aviso “o sistema não consegue”, fora de checklist e sem checkbox |
| presença externa | `presencaNaLoja` + `estadoObservado` | fato observado; usar “Está na loja” quando não foi publicação Marquesa |

`aprovacaoInvalidada: true` informa que dados mudaram após a aprovação. A
aprovação deixa de valer e a pessoa precisa revisar e aprovar novamente; não é
falha técnica.

## Produto, categoria e variação

- produto sem preço é bloqueio de prontidão por `falta: preco`, nunca preço
  zero nem aviso dispensável;
- variações vêm do produto real e qualquer uma sem `variante_id` deve ficar
  visível;
- kit e componente são relações distintas devolvidas por dependências;
- estoque total (`qtd`) e em casa (`casa`) aparecem juntos e não são
  intercambiáveis;
- arquivado mantém data e motivo;
- `Sem categoria` é sentinela, não categoria: aparece como estado separado,
  não como opção equivalente às categorias; não renomeia nem arquiva;
- categoria órfã não é erro;
- ações de categoria obedecem `podeRenomear` e `podeArquivar`;
- mesclar categoria não existe;
- criar/atualizar por nome deixa a normalização para o servidor; a UI não faz
  pré-validação concorrente como fonte de verdade.

## Galeria

- um SKU pode ter várias fotos;
- a primeira foto vira principal automaticamente;
- da segunda em diante, a escolha de principal é humana;
- a ordem recebida é confiável: principal, ordem, criação e id;
- reordenar usa apenas ids daquela galeria e mostra `ignorados[]` devolvidos;
- apagar a principal promove a próxima e a tela anuncia `novaPrincipal`;
- preparação cria versão tratada sem sobrescrever o original;
- foto própria, somente endereço da loja e nenhuma foto são três estados;
- ausência de R2 é `503 { bloqueio: "sem_r2" }`, um bloqueio do sistema, não
  erro da pessoa.

## Upload em lote

O fluxo respeita três atos, na ordem: criar/analisar lote, enviar um arquivo
por requisição e confirmar. A análise inicial não grava bytes e precisa ser
revisada antes do envio.

- concorrência é baixa e falha isolada não cancela os demais arquivos;
- `multiplas` significa outra foto do mesmo SKU e não é erro;
- `confirmar` reconta as linhas; o resumo final não reutiliza o total otimista
  da análise;
- nenhum caso de nome/arquivo é resolvido por palpite.

## Preparação e aprovação

- tarefa sem `skus` significa preparar todos os produtos prontos;
- a resposta separa `abertas`, `jaTinhamTarefa` e `recusados` com motivos;
- `executor` é rótulo livre e interno, nunca lista de fornecedores;
- resultado de preparação declara `publicado: false` e a UX repete essa
  separação;
- `Pedir ajuste` é proposta de rótulo para a capacidade `reabrir`; não cria o
  estado `ajuste_solicitado` nem presume transição ausente do contrato;
- aprovação só existe no estado aceito pelo servidor e pode ser invalidada
  automaticamente por mudança posterior.

## Publicação, despublicação e divergência

- ensaio mostra `enviaria` integral, com o corpo exato;
- `seco` só deixa de valer com `false` explícito, e a escrita ainda depende da
  flag `NUVEMSHOP_PUBLICACAO_ENABLED`;
- enquanto a flag estiver ausente, a UX oferece simulação e explica o bloqueio,
  não uma falsa publicação;
- rodada acima de 20 aprovados retorna pausada e espera `forcar: true`; é freio,
  não erro;
- `foto_erro`, `preparo_erro`/`bloqueioExterno` e `publicacao_erro` nunca são
  combinados em um erro genérico;
- `semEmpurrar[]` permanece por peça e explicita o que a sincronização decidiu
  não fazer;
- preço divergente é detectado, não corrigido automaticamente;
- arquivar localmente não despublica automaticamente.
