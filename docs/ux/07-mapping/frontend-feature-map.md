# Mapa frontend

Estado em **10/09/2026**. Provisório — ver [README.md](README.md).

Dois painéis convivem sobre o mesmo backend: o legado
(`src/dashboard.tpl.html`, em produção) e o React/TS/Vite (`frontend/`, em
construção). A coluna "React hoje" descreve o que existe, não o alvo.

| Tela (docs/ux) | Legado hoje | React hoje | Alvo definitivo |
|---|---|---|---|
| Dashboard | `src/dashboard.tpl.html` — `view-geral` | — a confirmar — | — indefinido (fase 9) — |
| Vendas | `src/dashboard.tpl.html` | — a confirmar — | — indefinido (fase 9) — |
| Clientes | `src/dashboard.tpl.html` | — a confirmar — | — indefinido (fase 9) — |
| Revendedoras | `src/dashboard.tpl.html` | — a confirmar — | — indefinido (fase 9) — |
| Estoque | `src/dashboard.tpl.html` — `view-estoque` | — a confirmar — | — indefinido (fase 9) — |
| Reparos | não existe | não existe | — indefinido — |
| Personalização | parcial (Monte seu Colar) | — a confirmar — | — indefinido — |

Pastas do React hoje, sem afirmar destino: `frontend/src/app`,
`components`, `domain`, `features`, `hooks`, `services`, `styles`, `types`.

A matriz detalhada de paridade legado → React é mantida pela trilha de UI em
`docs/ui/LEGACY-REACT-PARITY.md`. Esta tabela **não** a substitui e não deve
ser preenchida por leitura de código: copie de lá quando precisar.

Restrição permanente: `src/dashboard.html` é gerado por `python src/build.py` e
nunca é editado à mão.
