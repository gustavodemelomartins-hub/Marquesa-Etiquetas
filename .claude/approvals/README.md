# Production Release Approval

Autorização por **release**, não por comando. Uma aprovação efêmera, curta,
que libera uma sequência fechada de ações de publicação — em vez de exigir
aprovação humana a cada `Bash` individual da sequência.

Contexto completo: [docs/SECURITY.md § Production Release
Approval](../../docs/SECURITY.md#production-release-approval). Este arquivo
é só o "como usar" mecânico.

## O arquivo

`production-release.json`, **não versionado** (`.gitignore`). Quando existe,
`.claude/hooks/protect-production.mjs` consulta ele antes de negar merge em
`main`, push de `main`, migration no D1 de produção, ou deploy (Worker ou
Pages). Quando não existe — o estado normal, o dia a dia — nada muda: as
quatro categorias continuam bloqueadas, exatamente como sempre foram.

## Forma

```json
{
  "versao": 1,
  "id": "release-2026-09-06-01",
  "ambiente": "production",
  "branch": "claude/marquesa-operational-review-eztpzt",
  "commit": "1df2ac1234567890abcdef1234567890abcdef12",
  "acoes": ["merge-main", "push-main", "d1-migrate-prod", "worker-deploy", "pages-deploy"],
  "criadaEm": "2026-09-06T18:00:00-03:00",
  "expiraEm": "2026-09-07T06:00:00-03:00",
  "migration": {
    "arquivo": "api/migracao-pos-golive-1.sql",
    "sha256": "<sha256 do conteúdo do arquivo NO MOMENTO da aprovação>"
  },
  "autorizadoPor": "Gustavo, no chat, 2026-09-06",
  "notas": "Uma frase sobre o release."
}
```

Ver [EXEMPLO.json](EXEMPLO.json) — um arquivo completo e válido, com os
mesmos campos do exemplo acima. Copie e ajuste `branch`/`commit`/`acoes`/
`migration`/datas para o release de verdade — nunca aponte
`production-release.json` para o exemplo em si.

## Como uma aprovação nasce

**A pessoa autoriza no chat, em uma frase explícita e específica — nunca
implícita, nunca "porque já discutimos isso".** Algo como:

> "Autorizo o release do branch `claude/marquesa-operational-review-eztpzt`,
> commit atual, para produção. Ações: merge, push, migration
> `api/migracao-pos-golive-1.sql`, deploy do Worker e do painel. Validade:
> 6 horas."

O agente então:

1. Confere `git rev-parse <branch>` — o commit de verdade, não o que a
   pessoa digitou (menos chance de erro de transcrição).
2. Confere `git status --porcelain` — árvore precisa estar limpa.
3. Se a lista de ações incluir `d1-migrate-prod`, calcula o `sha256` do
   arquivo de migration EXATO que vai rodar.
4. Escreve `production-release.json` com esses fatos apurados — não com o
   que a pessoa digitou de memória.
5. Mostra o JSON escrito, para a pessoa conferir antes de qualquer ação de
   release começar.

**Nunca peça para a pessoa escrever o JSON à mão.** O ponto de autorizar no
chat é a pessoa dizer a INTENÇÃO em português; o agente traduz para fatos
verificáveis.

## O que uma aprovação NÃO faz

- Não libera `git push --force`, `git reset --hard`, `git clean -f`, reescrita
  de histórico, `DROP`/`TRUNCATE`, `DELETE`/`UPDATE` em massa sem `WHERE`,
  `wrangler d1 delete`, `time-travel restore`, alteração de secret, ou
  `wrangler rollback`. Essas continuam bloqueadas **sempre**, com ou sem
  aprovação — não são sequer consultadas contra o arquivo.
- Não libera migration nenhuma "parecida" — o `sha256` tem que bater com o
  arquivo exato. Mudou uma linha da migration depois da aprovação? A
  aprovação para de cobrir esse arquivo.
- Não libera nada em `staging`/DEV — o `ambiente` tem que ser exatamente
  `"production"`, e o pipeline de DEV (`git push origin develop`) nunca
  precisou de aprovação nenhuma.
- Não sobrevive à expiração, nem a um teto de 12 horas contado da própria
  criação (`JANELA_MAXIMA_MS` em `../hooks/lib/release-approval.mjs`) —
  mesmo que alguém escreva um `expiraEm` mais longe que isso.
- Não libera a ação numa branch errada: as quatro ações exigem `main` já em
  checkout no momento em que rodam (é daí que se publica, sempre).

## Depois do release

Apague o arquivo (`rm .claude/approvals/production-release.json`) ou deixe
expirar sozinho. Não reaproveite uma aprovação de um release para o
próximo — cada release pede a sua, com o commit e (se houver) a migration
daquela vez.

## Auditoria

Toda consulta à aprovação — liberada ou negada — grava uma linha em
`audit.log.jsonl` (também não versionado): quando, qual ação, qual decisão,
qual o motivo, qual o id da aprovação usada. Serve para revisão humana
depois do fato; não faz parte da decisão em si (uma falha ao gravar nunca
derruba o hook).
