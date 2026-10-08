/** A saúde do envio de estoque para a loja, numa frase.
 *
 *  §61 — desde 08/10/2026 a loja acompanha o Marquesa pela FILA: cada
 *  movimento de estoque põe o código na fila, e ele sai logo depois da
 *  operação (ou no cron, a cada 10 minutos). "Última sincronização" deixou
 *  de ser a rodada das 06:00/18:00 — é o último código que a loja aceitou.
 *
 *  Função pura: recebe o resumo e o instante, devolve o que a tela diz. A
 *  ordem é do mais grave para o mais tranquilo, e só UMA frase vence — a
 *  tela não empilha avisos.
 */
import type { EstoqueOnline } from '../../services/nuvemshopEstoque';
import type { Tom } from '../../components/StatusBadge';
import type { DiagnosticoSync } from './saude';
import { horasDesde } from '../../services/datas';

export interface SaudeEstoqueOnline {
  tom: Tom;
  rotulo: string;
  motivo: string | null;
  /** A pergunta que as Pendências fazem: a divergência se corrige sozinha? */
  autoCorrige: boolean;
}

/** O cron roda a cada 10 minutos. Meia hora sem sinal dele é três rodadas
 *  perdidas: já não é o relógio, é problema. */
export const CRON_ATRASADO_H = 0.5;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function saudeDoEstoqueOnline(r: EstoqueOnline, agora: Date): SaudeEstoqueOnline {
  if (!r.migrado) {
    return { tom: 'neutro', rotulo: 'Estoque online ainda não instalado', motivo: 'O servidor ainda não tem a fila de envio para a loja.', autoCorrige: false };
  }
  if (!r.conectada) {
    return { tom: 'neutro', rotulo: 'Loja não conectada', motivo: 'O sistema ainda não está autorizado a falar com a Nuvemshop.', autoCorrige: false };
  }
  if (!r.ativo) {
    return {
      tom: 'atencao', rotulo: 'Sincronização automática desligada',
      motivo: 'Nada está indo para a loja. O que muda no estoque fica guardado na fila e sai quando religar.',
      autoCorrige: false,
    };
  }
  if (!r.escritaHabilitada) {
    return { tom: 'atencao', rotulo: 'Escrita na loja bloqueada neste servidor', motivo: 'NUVEMSHOP_WRITES_ENABLED não está ligado aqui.', autoCorrige: false };
  }
  if (!r.corteEm) {
    return {
      tom: 'critico', rotulo: 'Falta o corte de pedidos',
      motivo: 'Sem a data de corte, ler os pedidos do site importaria o histórico inteiro. Nada é enviado até ela existir.',
      autoCorrige: false,
    };
  }
  const c = r.contagens ?? {};
  const erros = c.erro ?? 0;
  const revisao = c.revisao ?? 0;
  const pendentes = c.pendente ?? 0;
  if (erros > 0) {
    return {
      tom: 'critico', rotulo: plural(erros, 'erro na Nuvemshop', 'erros na Nuvemshop'),
      motivo: 'A loja não aceitou o envio. Cada código tem nova tentativa marcada; veja abaixo e tente de novo se quiser.',
      autoCorrige: false,
    };
  }
  if (r.freio) {
    return {
      tom: 'atencao', rotulo: 'Pausado pelo freio de segurança',
      motivo: `${r.freio.motivo} Confira e use "Sincronizar pendências".`,
      autoCorrige: false,
    };
  }
  const horasCron = r.cronEm ? horasDesde(r.cronEm, agora) : null;
  if (horasCron === null || horasCron > CRON_ATRASADO_H) {
    return {
      tom: 'atencao', rotulo: 'A rodada automática não está rodando',
      motivo: r.cronEm
        ? 'O cron não dá sinal há mais de meia hora. A venda continua indo na hora; o que falhar fica parado até ele voltar.'
        : 'O cron ainda não rodou nenhuma vez neste servidor.',
      autoCorrige: false,
    };
  }
  if (revisao > 0) {
    return {
      tom: 'atencao', rotulo: plural(revisao, 'produto precisa de revisão', 'produtos precisam de revisão'),
      motivo: 'O sistema não sabe com segurança para qual variante da loja mandar o saldo. Nada foi escrito nesses códigos.',
      autoCorrige: true,
    };
  }
  if (pendentes > 0) {
    return {
      tom: 'neutro', rotulo: plural(pendentes, 'produto aguardando sincronização', 'produtos aguardando sincronização'),
      motivo: null, autoCorrige: true,
    };
  }
  return { tom: 'positivo', rotulo: 'Tudo sincronizado', motivo: null, autoCorrige: true };
}

/** O diagnóstico no formato que a lista de Pendências já entende. */
export function comoDiagnostico(s: SaudeEstoqueOnline): DiagnosticoSync {
  return {
    estado: s.autoCorrige ? 'saudavel' : s.tom === 'critico' ? 'erro' : 'pausada',
    autoCorrige: s.autoCorrige,
    rotulo: s.rotulo,
    motivo: s.motivo ?? s.rotulo,
  };
}
