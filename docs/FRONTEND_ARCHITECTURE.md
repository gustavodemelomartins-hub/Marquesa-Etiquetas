# Arquitetura do frontend

Duas interfaces convivem, de propósito:

| | Painel legado | Painel novo |
|---|---|---|
| Onde | `src/dashboard.tpl.html` → `dashboard.html` | `frontend/` |
| Stack | HTML/CSS/JS vanilla, montado por `build.py` | React + TypeScript + Vite |
| Cobre | Tudo: estoque, maletas, revendedoras, vendas, inventário, Nuvemshop | Nuvemshop e a fundação da reconciliação |
| Estado | Global mutável, re-render completo | Local por componente, dados por `hooks/useApi` |
| Situação | **Em produção. Não remover.** | Em construção, não publicado |

O backend é o **mesmo** para os dois, sem uma linha de diferença: Cloudflare
Worker + D1, autenticado pelo mesmo Bearer, guardado na mesma chave de
`localStorage`. Quem conecta num, chega conectado no outro.

## Por quê

**React**, porque o problema real do painel legado não é a linguagem — é que
estado global mutável mais re-render completo torna cada mudança arriscada em
proporção ao tamanho do arquivo, e ele tem 3.802 linhas. React não é mais
rápido nem mais bonito; ele torna explícito quem depende de quê.

**TypeScript**, porque o contrato com o backend hoje é implícito. `GET
/api/state` devolve um objeto que ninguém declarou, e a única forma de saber
que `preco` pode ser `null` (§24) é lendo `state.js`. Em
`frontend/src/types/api.ts` isso está escrito, e o compilador cobra.

**Vite**, porque o projeto não tem etapa de build de JavaScript e não deveria
ganhar uma complicada. `dev` sobe em menos de um segundo, `build` produz
arquivos estáticos que qualquer servidor entrega — inclusive o GitHub Pages,
que é como o app já é publicado.

**Nada além disso.** Sem router, sem gerenciador de estado, sem biblioteca de
CSS, sem biblioteca de componentes. A regra em cada dependência nova é:
*o React/Vite/TypeScript padrão já resolve?* Se sim, não entra.

## Dependências

| Pacote | Por quê |
|---|---|
| `react`, `react-dom` | A stack alvo |
| `typescript` | idem |
| `vite`, `@vitejs/plugin-react` | idem |
| `@types/react`, `@types/react-dom` | Tipos do React |
| `vitest` | Roda TypeScript com a mesma configuração do Vite. Sem ele não há teste unitário sem inventar uma segunda pipeline |

Sete pacotes. **Sem `jsdom` e sem `@testing-library`**: o que se testa em
unidade aqui é lógica pura e a camada de API; o comportamento da interface é
provado num navegador de verdade, pelo `src/frontend-e2e.mjs`.

## Estrutura

```
frontend/
├── index.html                  ponto de entrada do Vite
├── vite.config.ts              base relativa, fs.allow para brand/, config do vitest
├── tsconfig.json               strict + noUncheckedIndexedAccess
└── src/
    ├── main.tsx                monta o React
    ├── app/
    │   ├── App.tsx             conexão, rota, análise compartilhada
    │   ├── AppShell.tsx        marca, navegação, rodapé
    │   └── ConnectionForm.tsx  endereço + chave
    ├── components/             pequenos, reusáveis, sem regra de negócio
    ├── features/
    │   ├── nuvemshop/          a tela + panorama.ts (lógica pura)
    │   └── reconciliacao/      fundação + classificar.ts (lógica pura)
    ├── services/               client.ts, state.ts, sync.ts
    ├── hooks/                  useApi, useAcao, useConnection
    ├── types/                  api.ts, sync.ts, reconciliation.ts
    └── styles/                 tokens.css, fonts.css, global.css
```

`features/` guarda o que é de um assunto só; `components/` guarda o que não
sabe de assunto nenhum. Um componente só nasce quando tem responsabilidade
clara ou reúso real — abstração por estética de código não entra.

## Camada de API

Nenhum componente chama `fetch`. Tudo passa por `services/`:

```
services/client.ts    endereço, Bearer, JSON, erro tipado, conexão guardada
services/state.ts     GET /api/state
services/sync.ts      POST /api/sync {seco:true}, GET /api/sync
```

Três decisões que valem ficar escritas:

1. **A mensagem de erro vem do servidor.** O backend responde
   `{erro: "..."}` com frases que dizem o que FAZER — *"o token não tem a
   permissão de ler pedidos; gere um token novo, porque ele guarda as
   permissões de quando foi criado"*. Reescrever isso na tela só perderia
   informação.
2. **Falha de rede vira status 0**, distinta de qualquer resposta do
   servidor. "A internet caiu" e "o servidor recusou" pedem reações
   diferentes.
3. **`services/sync.ts` não sabe escrever.** Ele só chama `{seco: true}`, e
   um teste trava isso. Escrever na loja é Classe C
   ([SECURITY.md](SECURITY.md)) e vai acontecer pelo motor de reconciliação,
   com aprovação item a item.

## Autenticação

Mantida **exatamente** como está: chave única, `Bearer`, guardada em
`localStorage['marquesa_conexao_v1']` no formato `{url, key}` — a mesma
chave e o mesmo formato do painel legado.

Isso é compatibilidade deliberada, não aprovação do modelo. As limitações
(sem revogação por dispositivo, sem auditoria de quem fez o quê) estão em
[SECURITY.md](SECURITY.md) e serão outra etapa.

## Tipos

Derivados do backend real, lendo `state.js`, `sync.js` e `estoque.js` — não
inventados a partir do nome das entidades.

| Arquivo | O que descreve |
|---|---|
| `types/api.ts` | `AppState`, `Product`, `Variant`, `KitComponent`, `Reseller`, `Suitcase`, `StoreSnapshot`, `UnpushedCode`, `SyncSummary`, `ApiError` |
| `types/sync.ts` | `SyncReport`, `SyncChange`, `UnmatchedOrderItem`, `SeededCode`, `UnseededCode`, `SyncRun` |
| `types/reconciliation.ts` | `RiskLevel`, `ReconciliationItem`, `ReconciliationSummary`, `ReconciliationPending`, `ReconciliationAnalysis` |

Os dois primeiros são o contrato de hoje. O terceiro é vocabulário de uma
fase que ainda não existe no backend — e o arquivo diz isso no topo.

Detalhes que só existem porque foram lidos no código, não presumidos:
`preco: number | null` (§24, nunca 0 por omissão), `visivel: boolean | null`
(nulo é "a loja não informou"), `componentes` presente = é kit,
`variacoes` presente = o código é vendido em mais de uma opção.

## Regra de negócio no frontend

Duas funções puras, e as duas são **porte fiel** do que o painel legado já
faz — modernizar a interface não pode mudar o que os números significam:

- `features/nuvemshop/panorama.ts` — porte de `panoramaLoja()`. Quem está na
  loja, quem diverge, quem falta cadastrar, quem está oculto com peça.
- `features/reconciliacao/classificar.ts` — **novo**, e só classifica o que
  o backend já calculou. Não decide, não grava, não aplica.

Puras de propósito: sem React, sem rede, sem relógio (a data entra por
parâmetro). É o que permite testá-las sem navegador.

## Design system

Os tokens saem do CSS do app legado (`index.html`, bloco `:root`) — mesma
paleta, mesmas fontes. O que **não** veio junto foi a hierarquia visual.

Duas correções conscientes:

1. **Severidade escassa.** Quatro tons (`neutro`, `positivo`, `atencao`,
   `critico`) e a regra de que um tom mais forte só entra quando a
   consequência é mais forte. No painel legado quase tudo chega como aviso,
   e aviso que está sempre lá deixa de ser aviso.
2. **Contraste.** `--muted` foi escurecido de `#9E8A90` para `#755C64`: o
   tom original dá 2,9:1 sobre o marfim, abaixo do mínimo para texto
   pequeno. E o degradê longo até o preto foi trocado por marfim sólido com
   um brilho blush no alto — num painel longo, um fundo que escurece
   conforme se rola torna o texto secundário ilegível na metade de baixo.

O preto quente da marca continua, agora numa faixa própria atrás do rodapé.

### Botões dizem o que a ação FAZ

| Classe | Para |
|---|---|
| `.btn-leitura` | navegar, filtrar, abrir. Neutro |
| `.btn-analise` | ler muita coisa e mostrar. Destacado, e seguro |
| `.btn-escrita` | mudar dado nosso. **Ainda não usado** |
| `.btn-critico` | mudar dado de terceiro, ou difícil de desfazer |

A distinção existe desde já, mesmo sem escrita implementada: quando ela
chegar, o vocabulário visual já estará no lugar e ninguém vai precisar
decidir isso com pressa.

### Números

`font-variant-numeric: lining-nums tabular-nums` no `body`. O Cormorant
Garamond desenha algarismos antigos por padrão — o `1` sai parecendo um `i`,
o `0` parecendo um `o` — e sem `tnum` a coluna de números dança entre uma
rodada e outra. Mesma regra do painel legado, pelo mesmo motivo.

## A tela Nuvemshop

Hierarquia: **ESTADO → VISÃO GERAL → PENDÊNCIAS → ANÁLISE**.

A decisão que mais muda a tela em relação à antiga: **"estoque divergente"
não é pendência**. A rodada seguinte conserta sozinha. Pendência é só o que
uma pessoa precisa resolver — cadastro duplicado, variação pela metade,
código sem anúncio, produto oculto com peça. Um teste trava essa separação.

O único botão que fala com a Nuvemshop é *Analisar sincronização*, e ele usa
a rodada seca que o backend já tem. O `frontend-e2e.mjs` confere que a loja
falsa registra **zero escritas** depois de a análise inteira rodar.

## A tela Reconciliação

Fundação. Mostra o diff classificado e diz, em voz alta, que aprovar e
aplicar não existem. Tem um modo de exemplo, e quando ele está ligado uma
faixa listrada avisa que nenhum número corresponde ao estoque real.

**Não há caixinha de aprovar.** Aprovar exige gravar a decisão em algum
lugar, e esse lugar ainda não existe — uma caixinha que não persiste nada
seria pior que a ausência dela, porque pareceria que a pessoa decidiu algo.

## Estratégia de migração

Uma área por vez, e só depois de a anterior estar provada.

```
1. fundação + Nuvemshop        ← estamos aqui
2. motor de reconciliação (backend) + a tela de revisão de verdade
3. estoque
4. vendas
5. revendedoras e maletas
6. inventário
7. etiquetas (index.html) — por último: é outro app, e funciona
```

Enquanto isso o painel legado continua sendo **o** painel. O novo é
alcançável por link, e o rodapé dele aponta de volta.

### Como o legado é aposentado

Não por substituição de uma vez. O critério, área por área:

1. a tela nova cobre tudo que a antiga cobria naquele assunto;
2. o `e2e` prova o caminho inteiro na tela nova;
3. o painel legado ganha um link levando para lá;
4. depois de um tempo de uso real, a aba antiga sai do `dashboard.tpl.html`.

`src/build.py`, `src/dashboard.tpl.html` e `dashboard.html` só somem quando
a última aba tiver saído. Até lá, mexer neles continua sendo trabalho
legítimo.

## Publicação

**Ainda não publicado, de propósito.** O `dist/` é estático e o `base: './'`
faz os caminhos funcionarem de qualquer subdiretório, então publicar é
possível a qualquer momento — mas onde e sob qual endereço é decisão a
tomar depois da revisão. Ver [SECURITY.md](SECURITY.md): deploy é Classe C.

## Como rodar

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit && vite build → frontend/dist/
npm run typecheck
npm test           # vitest
```

O painel precisa de um Worker no ar para ter o que mostrar — ver
[DEVELOPMENT.md](DEVELOPMENT.md).
