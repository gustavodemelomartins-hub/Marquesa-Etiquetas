/** Casamento de método e caminho, e nada além disso.
 *
 *  O despachante de `index.js` decide rota com uma corrente de `if`, na
 *  ordem em que as rotas foram escritas, e o primeiro que casa responde.
 *  Este roteador reproduz essa regra: mesma ordem, mesma precedência,
 *  mesma captura crua do caminho — quem decodifica `%20` continua sendo o
 *  handler, como sempre foi.
 *
 *  Ele não autentica, não abre banco, não formata erro e não conhece regra
 *  de negócio. Transporte é transporte. */

/** `/api/produtos/:sku/movimento` vira `^/api/produtos/([^/]+)/movimento$`.
 *  `padroes` restringe um parâmetro quando a rota antiga restringia — as
 *  rotas de revendedora e maleta só casavam com dígitos, e um caminho com
 *  letra caía no 404 em vez de virar `NaN`. */
function compilar(caminho, padroes = {}) {
  const nomes = [];
  const fonte = caminho.split('/').map((parte) => {
    if (!parte.startsWith(':')) return parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nome = parte.slice(1);
    nomes.push(nome);
    return `(${padroes[nome] || '[^/]+'})`;
  }).join('/');
  return { regex: new RegExp(`^${fonte}$`), nomes };
}

export function criarRoteador(rotas) {
  const compiladas = rotas.map((rota) => {
    if (!rota.metodo || !rota.caminho || !rota.auth || typeof rota.handler !== 'function') {
      throw new Error(`rota incompleta: ${JSON.stringify(rota.caminho || rota)}`);
    }
    return { ...rota, ...compilar(rota.caminho, rota.padroes) };
  });

  /** Devolve a resposta da rota que casar, ou `null` para quem chamou
   *  continuar procurando. `null` é o que permite migrar rota por rota: o
   *  que ainda não mudou de lugar continua sendo respondido pela corrente
   *  antiga, com o mesmo 404 no fim. */
  return async function despachar(contexto) {
    const { path, metodo } = contexto;
    for (const rota of compiladas) {
      if (rota.metodo !== 'ANY' && rota.metodo !== metodo) continue;
      const casou = rota.regex.exec(path);
      if (!casou) continue;
      const params = {};
      rota.nomes.forEach((nome, i) => { params[nome] = casou[i + 1]; });
      return await rota.handler({ ...contexto, params });
    }
    return null;
  };
}
