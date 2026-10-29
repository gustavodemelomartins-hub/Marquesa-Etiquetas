# Princípios do harness

Cinco regras que valem para qualquer agente trabalhando neste repositório.
Vieram do repositório `Harness-da-Marquesa` (fase de pesquisa, 13 a
24/09/2026). As referências de origem abaixo são históricas, não requisitos
de instalação nem arquivos que um clone deste projeto precisa receber.
O harness agora mora aqui dentro: [AGENTS.md](../../AGENTS.md),
[docs/setup.md](../setup.md) e `.claude/`.

## 1. Alegação não é prova

"Rodei e passou" escrito por quem fez o trabalho não é evidência. Evidência
é a saída de uma ferramenta, conferível contra uma fonte que quem escreve não
controla: o git, o registro de suítes (`docs/testing/test-suites.json`), a
saída guardada do comando.

**Por quê:** no Harness, o critério mais duro de prova aceitava uma
referência a arquivo que nunca existiu. Régua cujo verificador não confere
nada é só um campo com nome de prova.
Origem: `Harness-da-Marquesa/docs/architecture/23-EVIDENCE-INTEGRITY.md`.

## 2. Derive o que dá para derivar

Se um fato tem fonte consultável (git, banco, registro de suítes), não o
escreva à mão em outro lugar: guarde a âncora e consulte na hora de ler.

**Por quê:** num experimento do Harness, arquivos de estado escritos à mão
tinham trabalho ausente e data errada em 75 minutos. Campo derivável escrito
à mão envelhece; não "pode", vai.
Origem: `Harness-da-Marquesa/docs/architecture/21-DERIVED-STATE.md`.

## 3. O git vence o handoff

Resumo de sessão anterior, checkpoint e memória são pistas. Antes de agir
sobre eles, confira checkout, branch, commits e processos reais. Quando
divergirem, o git vence e o resumo é corrigido.
Origem: `Harness-da-Marquesa/BOOTSTRAP.md`.

## 4. Um só modelo de risco

As classes de risco A–D estão em [docs/SECURITY.md](../SECURITY.md). Nenhuma
ferramenta, skill ou processo cria um modelo paralelo: herda esse. Duas
políticas de segurança divergentes são piores que uma imperfeita.
Origem: `Harness-da-Marquesa/docs/workflows/16-SECURITY-BOUNDARIES.md`.

## 5. O harness não vira o projeto

Instruções, skills e ferramentas existem para o produto andar. Sinal de
alerta: mais trabalho no harness do que no produto por semanas seguidas, ou
fato do produto copiado para um documento de processo (segunda fonte de
verdade). A resposta é congelar o harness, não expandi-lo.
Origem: `Harness-da-Marquesa/docs/research/OPEN-QUESTIONS-AND-RISKS.md` (riscos R-1 e R-4).
