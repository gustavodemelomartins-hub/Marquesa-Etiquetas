# docs/ux — área de produto e UX do Sistema Marquesa

Esta pasta é **documental**. Ela recebe design, inspiração, regra de tela e
ideia de funcionalidade enquanto a refatoração arquitetural do
[Master Plan](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md) acontece
em paralelo, em outra trilha.

## Como esta área funciona

1. **Nada aqui é ordem de implementação.** Material depositado em `docs/ux/` é
   requisito futuro aguardando encaixe na arquitetura. Implementar exige pedido
   humano explícito, separado.
2. **Nenhum arquivo daqui move ou renomeia código.** A estrutura é independente
   de `api/`, `src/` e `frontend/`.
3. **Uma tela, uma pasta.** Toda imagem, regra, estado, métrica, necessidade de
   API e decisão aberta de uma tela mora em `03-screens/<tela>/`.
4. **Incompleto é o estado normal.** Campo sem resposta fica marcado
   `— ainda não definido —`. Nunca se preenche por suposição: a regra 2 do
   [CLAUDE.md](../../CLAUDE.md) (nunca chutar) vale também para documentação de
   produto.
5. **Quem escreve assina.** Cada registro leva data e origem (Gustavo, Codex,
   Claude).

## Onde salvar o quê

| Chegou | Vai para |
|---|---|
| print, mockup, foto de tela nossa, protótipo de uma tela | `03-screens/<tela>/images/` |
| inspiração externa (outro produto, site, referência visual) | `02-references/<dominio>/` |
| ideia de funcionalidade nova | `06-backlog/functional-ideas.md` |
| dúvida que precisa de decisão do Gustavo | `06-backlog/pending-decisions.md` |
| cor, tipografia, logo, tom de voz | `01-brand/README.md` |
| padrão visual que repete em várias telas | `04-components/<componente>/` |
| caminho do usuário entre telas | `05-flows/` |
| o que já existe hoje em código | `07-mapping/` |

Convenção de nome de arquivo visual:

```text
AAAA-MM-DD_<tela>_<viewport>_<sequencia>.<ext>
2026-09-10_dashboard_desktop_01.png
```

`<viewport>`: `desktop`, `tablet`, `mobile` ou `impressao`.

## Índice das telas

| Tela | Pasta | Referências | Estado do material |
|---|---|---|---|
| Dashboard | [03-screens/dashboard/](03-screens/dashboard/) | [02-references/dashboard/](02-references/dashboard/) | vazio |
| Vendas | [03-screens/vendas/](03-screens/vendas/) | [02-references/vendas/](02-references/vendas/) | vazio |
| Clientes | [03-screens/clientes/](03-screens/clientes/) | [02-references/clientes/](02-references/clientes/) | vazio |
| Revendedoras | [03-screens/revendedoras/](03-screens/revendedoras/) | [02-references/revendedoras/](02-references/revendedoras/) | vazio |
| Estoque | [03-screens/estoque/](03-screens/estoque/) | [02-references/estoque/](02-references/estoque/) | vazio |
| Reparos | [03-screens/reparos/](03-screens/reparos/) | [02-references/reparos/](02-references/reparos/) | vazio |
| Personalização | [03-screens/personalizacao/](03-screens/personalizacao/) | [02-references/personalizacao/](02-references/personalizacao/) | vazio |

"Estado do material": `vazio` → `recebendo` → `descrito` → `pronto para
avaliação arquitetural`. Ninguém promove sozinho o estado de uma tela para o
último degrau.

## Mapa da pasta

```text
docs/ux/
  00-index.md         este arquivo
  01-brand/           identidade visual e tom
  02-references/      inspiração externa, por domínio
  03-screens/         uma pasta por tela do produto
  04-components/      padrões visuais que repetem
  05-flows/           percursos entre telas
  06-backlog/         ideias e decisões pendentes
  07-mapping/         ligação com o código real (provisória)
```

## Relação com as outras trilhas

- **`docs/ui/`** é a trilha de UI/React do Codex: inventário de telas, de
  componentes e matriz de paridade legado → React do que **já existe**.
  `docs/ux/` é o lado do **futuro**: material novo, ainda não arquitetado. Onde
  as duas falarem da mesma tela, `docs/ux/` referencia `docs/ui/` por link — não
  copia.
- **Master Plan / refatoração** (`docs/architecture/`) não é bloqueado nem
  pautado por esta pasta. O encaixe acontece na fase prevista de cada domínio,
  não porque chegou uma imagem.
- **[api/REGRAS.md](../../api/REGRAS.md)** continua a fonte única da regra de
  negócio. `rules.md` de uma tela registra como a tela **mostra** a regra; se
  divergir do `REGRAS.md`, o `REGRAS.md` vence e a divergência vira decisão
  pendente.
