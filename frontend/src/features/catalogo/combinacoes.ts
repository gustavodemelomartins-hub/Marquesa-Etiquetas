/** ATRIBUTOS → COMBINAÇÕES, do jeito que o backend faz.
 *
 *  Esta é a MESMA regra de `api/src/produtos.js › combinar`, e ela existe
 *  aqui de propósito: o formulário precisa mostrar as combinações ANTES de
 *  o produto existir, para pedir a quantidade de cada uma. O nome gerado
 *  aqui tem de bater caractere por caractere com o que o servidor vai
 *  gravar — é por ele que a divisão encontra a variação certa depois.
 *
 *  Por isso as três regras não são escolha de tela:
 *
 *   - valor repetido conta uma vez (a pessoa digitou "16, 16");
 *   - atributo sem nome, ou sem nenhum valor, não produz combinação;
 *   - o nome da combinação é `valor · valor`, na ordem dos atributos.
 */
export interface Atributo {
  nome: string;
  /** Valores separados por vírgula, como a pessoa digita. */
  valores: string;
}

export interface Combinacao {
  nome: string;
  valores: { atributo: string; valor: string }[];
}

export interface AtributoLimpo {
  nome: string;
  valores: string[];
}

export function combinar(atributos: Atributo[]): {
  atributos: AtributoLimpo[];
  combinacoes: Combinacao[];
} {
  const limpos: AtributoLimpo[] = (atributos ?? [])
    .map((a) => ({
      nome: String(a?.nome ?? '').trim(),
      valores: [...new Set(String(a?.valores ?? '').split(',').map((v) => v.trim()).filter(Boolean))],
    }))
    .filter((a) => a.nome && a.valores.length);

  if (!limpos.length) return { atributos: [], combinacoes: [] };

  let combos: { atributo: string; valor: string }[][] = [[]];
  for (const a of limpos) {
    const proximo: { atributo: string; valor: string }[][] = [];
    for (const parcial of combos) {
      for (const valor of a.valores) proximo.push([...parcial, { atributo: a.nome, valor }]);
    }
    combos = proximo;
  }

  return {
    atributos: limpos,
    combinacoes: combos.map((valores) => ({ valores, nome: valores.map((v) => v.valor).join(' · ') })),
  };
}
