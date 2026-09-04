/** §31 — o prazo da garantia é em DIAS ÚTEIS, e feriado tem um dono só.
 *
 *  Sábado e domingo o calendário resolve sozinho. Feriado, não: ele muda
 *  todo ano, muda por cidade, e a lista fatalmente fica velha. A escolha
 *  aqui é não espalhar `if (mes === 12 && dia === 25)` pelo código — os
 *  feriados moram na tabela `feriados`, e quem calcula pergunta a ela.
 *
 *  Com a tabela vazia o cálculo usa só o fim de semana. Isso é uma resposta
 *  MENOS precisa, e a função diz isso em `consideraFeriados: false` em vez
 *  de fingir precisão que não tem. Cadastrar os feriados melhora o número
 *  sem tocar em uma linha de código.
 */

/** As datas do banco são TEXTO `YYYY-MM-DD`. Fazer conta com `new Date()`
 *  em cima delas atravessa fuso e faz o dia 1 virar o dia 31 do mês
 *  anterior — o mesmo defeito clássico de `new Date('2026-09-04')` no
 *  navegador do Brasil. Por isso tudo aqui é UTC explícito. */
export function paraUTC(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

export function paraISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

const DIA = 86400000;

/** Sábado (6) e domingo (0) nunca contam; feriado conta quando conhecido. */
function ehUtil(ms, feriados) {
  const dow = new Date(ms).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !feriados.has(paraISO(ms));
}

/** Lê os feriados uma vez, para a janela que interessa. Devolve um Set —
 *  a consulta seguinte é O(1), e uma garantia de 45 dias úteis chega a
 *  olhar ~65 datas. */
export async function carregarFeriados(db, { de = null, ate = null } = {}) {
  try {
    const q = de && ate
      ? db.prepare('SELECT data FROM feriados WHERE data >= ? AND data <= ?').bind(de, ate)
      : db.prepare('SELECT data FROM feriados');
    const { results } = await q.all();
    return new Set((results ?? []).map((r) => String(r.data).slice(0, 10)));
  } catch {
    /* Banco anterior à migration não tem a tabela. Fim de semana continua
       valendo; a resposta diz que feriado não entrou na conta. */
    return new Set();
  }
}

/** O dia útil número N a partir de `inicio` — sem contar o próprio dia de
 *  entrada, que é como um prazo comercial se conta ("entrou hoje, 45 dias
 *  úteis a partir de amanhã"). */
export function somarDiasUteis(inicio, dias, feriados = new Set()) {
  let ms = paraUTC(inicio);
  let restam = Math.max(0, Math.trunc(dias));
  let guarda = 0;
  while (restam > 0 && guarda < 4000) {
    ms += DIA; guarda++;
    if (ehUtil(ms, feriados)) restam--;
  }
  return paraISO(ms);
}

/** Quantos dias úteis já se passaram entre duas datas — sem contar o dia de
 *  entrada, pelo mesmo motivo acima. Nunca negativo. */
export function diasUteisEntre(de, ate, feriados = new Set()) {
  let ms = paraUTC(de);
  const fim = paraUTC(ate);
  if (fim <= ms) return 0;
  let n = 0; let guarda = 0;
  while (ms < fim && guarda < 4000) {
    ms += DIA; guarda++;
    if (ehUtil(ms, feriados)) n++;
  }
  return n;
}

/** O bloco de prazo que a tela mostra: previsão, decorridos, restantes.
 *  `restantes` pode ser 0 com `atrasado: true` — o prazo estourou, e dizer
 *  "−7 dias restantes" é mais confuso do que dizer que atrasou 7. */
export function prazoDaGarantia({ dataEntrada, prazoDiasUteis = 45, hoje, feriados = new Set(), previsao = null }) {
  const previsaoRetorno = previsao || somarDiasUteis(dataEntrada, prazoDiasUteis, feriados);
  const decorridos = diasUteisEntre(dataEntrada, hoje, feriados);
  const restantes = Math.max(0, prazoDiasUteis - decorridos);
  const atrasoUteis = decorridos > prazoDiasUteis ? decorridos - prazoDiasUteis : 0;
  return {
    previsaoRetorno,
    prazoDiasUteis,
    diasUteisDecorridos: decorridos,
    diasUteisRestantes: restantes,
    atrasado: atrasoUteis > 0,
    atrasoDiasUteis: atrasoUteis,
    consideraFeriados: feriados.size > 0,
  };
}
