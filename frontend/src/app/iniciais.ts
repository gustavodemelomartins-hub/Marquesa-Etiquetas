/** As iniciais do avatar do cabeçalho.
 *
 *  O protótipo desenha "SM" — Sthefany Marques. Aqui elas saem de
 *  `config.operadorNome`, que é um parâmetro REAL da operação
 *  (`PUT /api/config`), e não de uma tabela de usuários: não existe uma. A
 *  autenticação do sistema continua sendo UMA chave Bearer compartilhada
 *  (`api/src/auth.js › checarChave`), e fingir identidade por pessoa aqui
 *  seria desenhar uma capacidade que o servidor não tem.
 *
 *  Sem nome gravado, o avatar mostra "MQ" — a marca. É a resposta honesta
 *  para "ninguém disse quem está operando", e nunca uma pessoa inventada.
 */
export const INICIAIS_PADRAO = 'MQ';

/** Partículas que não contam como sobrenome para efeito de inicial:
 *  "Maria da Silva" é MS, não MD. */
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'la']);

export function iniciaisDe(nome: string | null | undefined): string {
  const partes = String(nome ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !PARTICULAS.has(p.toLowerCase()));

  if (partes.length === 0) return INICIAIS_PADRAO;

  const primeira = partes[0]![0]!;
  /* Nome único devolve UMA letra, e não a primeira repetida: "Sthefany"
     é S, não SS. */
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : '';
  return (primeira + ultima).toUpperCase();
}

/** O rótulo acessível do avatar. Diz de quem é quando se sabe, e diz que
 *  ninguém foi identificado quando não se sabe — nunca "Meu perfil" em cima
 *  de uma identidade que o sistema não tem. */
export function rotuloDoPerfil(nome: string | null | undefined): string {
  const limpo = String(nome ?? '').trim();
  return limpo ? `Perfil de ${limpo}` : 'Perfil — ninguém identificado';
}
