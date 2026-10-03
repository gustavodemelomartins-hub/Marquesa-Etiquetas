/** A CONFERÊNCIA "BIPOU E MARCHA" — as regras da estação de leitura, puras.
 *
 *  O jeito da Sthefany, que é o jeito do Excel dela: o sistema já sabe
 *  quanto deveria haver em casa. Ela pega a referência, olha as peças, bipa
 *  UMA vez para dizer "conferi" e vai para a próxima. Só quando falta peça
 *  ela digita — e digita SÓ QUANTO falta.
 *
 *    1 bipe = código (ou variação) conferido.   Nunca "+1 unidade".
 *
 *  Os quatro estados de uma referência, e por que são quatro:
 *
 *    não conferido  ela ainda não chegou nela — NÃO é falta;
 *    conferido      passou por ela e não disse falta;
 *    com falta      passou e disse quantas faltam;
 *    sobra          achou peça que o sistema não esperava em casa.
 *
 *  Nada aqui fala com o servidor nem com o React: é o que deixa provar a
 *  regra sem navegador.
 */

export type EstadoDaReferencia = 'nao_conferido' | 'conferido' | 'com_falta' | 'sobra';

/** Uma referência conferida nesta sessão, como a tela a guarda. */
export interface Conferida {
  sku: string;
  /** '' = o código inteiro. */
  variacao: string;
  /** O que ela disse que falta. `null` quando a linha foi dita por
   *  `contado` (esperado zero em casa, ou aro sem esperado conhecido). */
  faltando: number | null;
  contado: number | null;
  /** O esperado em casa que valeu para esta linha (o do servidor quando já
   *  respondeu; o da tela enquanto não). */
  esperado: number | null;
  gravacao: 'salvando' | 'salvo' | 'erro';
  erro?: string;
  /** Quando foi lida — é o que desenha a evolução da sessão. */
  contadoEm?: string;
}

export const chaveDe = (sku: string, variacao = '') => `${sku}|${variacao}`;

export function estadoDe(c: Conferida | undefined): EstadoDaReferencia {
  if (!c) return 'nao_conferido';
  if (c.faltando != null) return c.faltando > 0 ? 'com_falta' : 'conferido';
  if (c.contado == null || c.esperado == null) return 'conferido';
  if (c.contado < c.esperado) return 'com_falta';
  if (c.contado > c.esperado) return 'sobra';
  return 'conferido';
}

/** Quantas peças faltam numa linha — o número que ela digitou, ou a
 *  diferença quando ela disse quantas achou. */
export function pecasFaltandoEm(c: Conferida): number {
  if (c.faltando != null) return c.faltando;
  if (c.contado != null && c.esperado != null && c.contado < c.esperado) return c.esperado - c.contado;
  return 0;
}

export interface ResumoDaConferencia {
  /** Referências (códigos) por estado. Um código com várias variações
   *  conferidas conta UMA vez, no pior estado entre elas. */
  conferidos: number;
  comFalta: number;
  sobrando: number;
  pendentes: number;
  pecasFaltando: number;
  pecasContadas: number;
  naoSalvos: number;
}

const PESO: Record<EstadoDaReferencia, number> = { nao_conferido: 0, conferido: 1, sobra: 2, com_falta: 3 };

export function resumoDaConferencia(
  codigos: { sku: string }[],
  conferidas: Iterable<Conferida>,
): ResumoDaConferencia {
  const porSku = new Map<string, EstadoDaReferencia>();
  let pecasFaltando = 0, pecasContadas = 0, naoSalvos = 0;
  for (const c of conferidas) {
    const e = estadoDe(c);
    const atual = porSku.get(c.sku);
    if (!atual || PESO[e] > PESO[atual]) porSku.set(c.sku, e);
    pecasFaltando += pecasFaltandoEm(c);
    pecasContadas += c.contado ?? Math.max(0, (c.esperado ?? 0) - (c.faltando ?? 0));
    if (c.gravacao !== 'salvo') naoSalvos += 1;
  }
  let conferidos = 0, comFalta = 0, sobrando = 0;
  for (const e of porSku.values()) {
    if (e === 'com_falta') comFalta += 1;
    else if (e === 'sobra') sobrando += 1;
    else conferidos += 1;
  }
  const visitados = new Set(porSku.keys());
  const pendentes = codigos.filter((c) => !visitados.has(c.sku)).length;
  return { conferidos, comFalta, sobrando, pendentes, pecasFaltando, pecasContadas, naoSalvos };
}

/** O que foi digitado (ou bipado) no campo do leitor.
 *
 *  Etiqueta tem seis dígitos ou mais. Um número de UM a TRÊS dígitos não é
 *  etiqueta nenhuma: é ela dizendo quanto falta da peça que acabou de bipar
 *  — "bip, 2, Enter" sem tirar a mão do teclado. */
export type Leitura =
  | { tipo: 'vazio' }
  | { tipo: 'falta'; quantidade: number }
  | { tipo: 'codigo'; codigo: string };

export function interpretarLeitura(texto: string): Leitura {
  const t = String(texto ?? '').trim();
  if (!t) return { tipo: 'vazio' };
  if (/^\d{1,3}$/.test(t)) return { tipo: 'falta', quantidade: Number(t) };
  return { tipo: 'codigo', codigo: t };
}

/** Uma gravação que NÃO PODE se perder em silêncio.
 *
 *  Falha de rede (status 0) e erro do servidor (5xx) são passageiros: tenta
 *  de novo, esperando mais a cada vez. Recusa (4xx) é resposta — repetir não
 *  muda nada, e ela volta para a tela dizer por quê. Esgotadas as
 *  tentativas, o erro sobe: quem chamou marca a linha "não salvo" e oferece
 *  tentar de novo. */
export async function comRetentativa<T>(
  fazer: () => Promise<T>,
  { tentativas = 4, esperaMs = 600, dormir = (ms: number) => new Promise((r) => setTimeout(r, ms)) }:
    { tentativas?: number; esperaMs?: number; dormir?: (ms: number) => Promise<unknown> } = {},
): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i += 1) {
    try {
      return await fazer();
    } catch (e) {
      ultimo = e;
      const status = (e as { status?: number })?.status;
      const passageiro = status === undefined || status === 0 || status >= 500;
      if (!passageiro || i === tentativas - 1) throw e;
      await dormir(esperaMs * 2 ** i);
    }
  }
  throw ultimo;
}
