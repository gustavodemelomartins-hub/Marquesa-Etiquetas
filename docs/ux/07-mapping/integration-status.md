# Status de integração

Uma tela só está integrada quando o dado que ela mostra vem da API real, com o
estado de erro tratado. Desenho pronto não é integração.

Estado em **10/09/2026**. Provisório — ver [README.md](README.md).

| Tela | Material UX | Contrato de API | React consumindo | Verificado | Situação |
|---|---|---|---|---|---|
| Dashboard | vazio | existe (parcial) | — a confirmar — | não | legado em produção |
| Vendas | descrito | existe para o modelo atual; recebimentos múltiplos/parcelas não comprovados | — a confirmar — | não | legado em produção; alvo financeiro futuro não implementado |
| Clientes | vazio | existe | — a confirmar — | não | legado em produção |
| Revendedoras | vazio | existe | — a confirmar — | não | legado em produção |
| Estoque | descrito | Fase 4.4 aprovada na trilha paralela; fonte ainda não visível nesta branch | parcial | não | legado em produção; novas visões de Inventário não implementadas |
| Catálogo, Mídia e Publicação | domínio mapeado; sem mockups | Fase 4.5 implementada e provada na branch paralela; sem deploy | não | não | contrato técnico pronto; UX/React e infraestrutura PROD ainda não integrados |
| Etiquetas | descrito | operação atual predominantemente local; necessidades futuras abertas | placeholder | não | legado validado em uso por relato; alvo futuro não implementado |
| Reparos | vazio | não existe | não | não | domínio novo |
| Personalização | recebendo | contratos existentes, feature desligada em produção | — a confirmar — | não | alvo futuro em detalhamento; não liberado ao usuário final |

**"Verificado"** significa prova executada, não leitura de código: teste de
navegador (`ui-verification`) para tela, teste dirigido do assunto para API, e
`GET /api/estoque/conferir` vazio quando a mudança toca estoque. Enquanto a
coluna estiver `não`, a linha não sustenta nenhuma afirmação de pronto.

Nenhuma linha desta tabela avança por causa de material depositado em
`docs/ux/`. Ela avança quando código foi escrito, na fase certa, e provado.
