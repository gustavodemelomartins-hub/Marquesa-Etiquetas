# Graphify baseline — Fase 0

- **Gerado em:** 2026-09-09
- **Commit analisado:** `04edb022455e417b8389d2163b2f007b7dd3ecff`
- **Ferramenta:** Graphify `0.9.55`, análise local sem LLM/rede.

## Resultado

| Artefato | Antes | Fase 0 |
|---|---:|---:|
| nós RAW | 4.521 | 4.923 |
| arestas RAW | 10.571 | 10.307 |
| comunidades | — | 313 |
| entradas Lite | — | 519 |
| domínios Lite | — | 16 |
| arquivos Lite | — | 156 |
| hubs Lite | — | 60 |
| tabelas Lite | — | 13 |
| integrações Lite | — | 3 |
| relações Lite | — | 255 |
| dependências externas Lite | — | 16 |

O corpus contém 325 arquivos e aproximadamente 758.815 palavras. A extração reportou 99% de relações extraídas, 1% inferidas (117, confiança média 0,85) e zero ambíguas. O Lite final tem 321.672 bytes: 89,5% menos entradas e 94,3% menos bytes que o RAW de 5.629.384 bytes. Classificação final: 1.627 vendor, 1.103 domínio, 2.126 supporting, 27 duplicatas, 40 tabelas e **zero uncertain**.

## Saúde e alertas

`graphify diagnose multigraph --json` encontrou zero endpoints ausentes, zero arestas penduradas, zero duplicatas exatas e zero colapsos direcionais; restaram **4 self-loops**. São alerta de qualidade do grafo, não falha de aplicação, e devem ser revistos na próxima regeneração.

Os hubs confirmam os hotspots do plano: `src/dashboard.tpl.html`, o despachante `api/src/index.js`, documentação de arquitetura/testes e `estoque.movimentar`. Contagens de linhas dependem da ferramenta/EOL; o baseline arquitetural usa relações e responsabilidades, não uma falsa precisão métrica.

## Persistência dos artefatos

Por decisão DEC-2026-005, `graphify-out/graph.json` é derivado local, ignorado e não versionado. O gerador privado atualizou:

- `C:\Users\User\Desktop\Marquesa-AI\07_GRAPH\lite\graph-lite.json`;
- as Domain Notes em `C:\Users\User\Desktop\Marquesa-AI\07_GRAPH\domains\`;
- o mapa privado de domínio para reconhecer `api/src/publicacao-catalogo.js` e documentação supporting.

Este arquivo é o recibo versionado e reproduzível da geração correspondente ao commit. Nenhum RAW Graph foi copiado para o repositório.

## Comando de reprodução

Na raiz do clone, com Graphify instalado:

```powershell
graphify update .
graphify diagnose multigraph --json
python C:\Users\User\Desktop\Marquesa-AI\07_GRAPH\tools\graphify-lite-generator.py
```

Os comandos leem o repositório e escrevem apenas artefatos derivados locais/privados; não acessam produção.

## Checkpoint da integração não-venda — 2026-09-09

Depois da documentação e do teste hermético desta integração, o Graphify foi
regenerado localmente. O RAW passou a 5.023 nós, 10.404 arestas e 314
comunidades. O Lite permaneceu com 519 entradas, 16 domínios, 156 arquivos, 60
hubs, 13 tabelas, 3 integrações, 255 relações e 16 dependências externas
(321.671 bytes).

A classificação resultou em 1.627 nós vendor, 1.103 de domínio, 2.226
supporting, 27 duplicatas e 40 tabelas, com **zero uncertain**. O diagnóstico
continuou sem endpoints ausentes, arestas penduradas, duplicatas exatas ou
colapsos direcionais; permanecem os mesmos 4 self-loops já tratados como
alerta. O mapa privado passou a classificar o `package.json` raiz como manifesto
de tooling.

## Checkpoint da categoria Sorteio — 2026-09-09

Após incorporar `sorteio` ao domínio de saídas sem faturamento, o Graphify foi
regenerado localmente no checkpoint `33a7cef`. O RAW passou a 5.031 nós, 10.417 arestas e 304
comunidades. O Lite passou a 523 entradas, 16 domínios, 157 arquivos, 60 hubs,
13 tabelas, 3 integrações, 258 relações e 16 dependências externas (323.416
bytes na primeira geração e 323.422 bytes no checkpoint Git).

A classificação final resultou em 1.627 nós vendor, 1.107 de domínio, 2.228
supporting, 27 duplicatas e 42 tabelas. O diagnóstico continuou com zero
endpoints ausentes, arestas penduradas, duplicatas exatas ou colapsos; os 4
self-loops conhecidos permanecem como alerta de qualidade. A geração foi
local, sem LLM/rede e sem acesso a produção.
