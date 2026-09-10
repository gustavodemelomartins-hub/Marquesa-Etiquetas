# Status de integração

Uma tela só está integrada quando o dado que ela mostra vem da API real, com o
estado de erro tratado. Desenho pronto não é integração.

Estado em **10/09/2026**. Provisório — ver [README.md](README.md).

| Tela | Material UX | Contrato de API | React consumindo | Verificado | Situação |
|---|---|---|---|---|---|
| Dashboard | vazio | existe (parcial) | — a confirmar — | não | legado em produção |
| Vendas | vazio | existe | — a confirmar — | não | legado em produção |
| Clientes | vazio | existe | — a confirmar — | não | legado em produção |
| Revendedoras | vazio | existe | — a confirmar — | não | legado em produção |
| Estoque | vazio | existe | parcial | não | legado em produção |
| Reparos | vazio | não existe | não | não | domínio novo |
| Personalização | vazio | parcial | — a confirmar — | não | legado em produção |

**"Verificado"** significa prova executada, não leitura de código: teste de
navegador (`ui-verification`) para tela, teste dirigido do assunto para API, e
`GET /api/estoque/conferir` vazio quando a mudança toca estoque. Enquanto a
coluna estiver `não`, a linha não sustenta nenhuma afirmação de pronto.

Nenhuma linha desta tabela avança por causa de material depositado em
`docs/ux/`. Ela avança quando código foi escrito, na fase certa, e provado.
