import { useState } from 'react';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { money } from '../../domain/formato';
import { Conferencia } from '../financeiro/FinanceiroArea';
import type { AppState } from '../../types/api';

interface ConfigDaCasa {
  prazoDias: number;
  prataPct: number;
  inventarioDias: number;
  maletaAlvoPecas: number;
  reservaMinima: number;
  faixas: { limite: number | null; pct: number }[];
  syncCorteEm: string | null;
}

interface Props {
  conexao: Connection;
  estado: AppState | null;
  aoMudar: () => void;
}

/** CONFIGURAÇÕES — como a casa está configurada.
 *
 *  Só os parâmetros que o backend deixa escrever, e é uma lista FECHADA de
 *  propósito: o mesmo `config` guarda estado interno da sincronização, e
 *  uma tela que escrevesse nele por engano faria o robô reler ou pular
 *  pedidos. O que não está aqui não é esquecimento.
 *
 *  Perfis e permissões não estão nesta tela porque não existem no sistema.
 *  Inventar uma tela de usuários sem backend seria prometer um controle
 *  que ninguém tem.
 */
export function ConfiguracoesArea({ conexao, estado, aoMudar }: Props) {
  const original = (estado?.config ?? null) as unknown as ConfigDaCasa | null;
  const [form, setForm] = useState<Partial<ConfigDaCasa>>({});
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  /* A conferência lê o banco inteiro: só roda quando alguém abre
     "Avançado", e não a cada visita às Configurações. */
  const [avancadoAberto, setAvancadoAberto] = useState(false);

  const valor = <K extends keyof ConfigDaCasa>(k: K): ConfigDaCasa[K] | undefined =>
    (form[k] !== undefined ? form[k] : original?.[k]);

  const mudou = Object.keys(form).length > 0;

  async function salvar() {
    setSalvando(true);
    setErro('');
    setSalvo(false);
    const r = await chamar<{ erro?: string }>(conexao, 'PUT', '/api/config', form)
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui salvar.' }));
    setSalvando(false);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return; }
    setForm({});
    setSalvo(true);
    aoMudar();
  }

  const campo = (k: keyof ConfigDaCasa, rotulo: string, ajuda: string, sufixo?: string) => (
    <label className="mq-field">
      <span>{rotulo}</span>
      <input
        className="mq-input"
        type="number"
        inputMode="numeric"
        value={String(valor(k) ?? '')}
        onChange={(e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) }))}
      />
      <small>{ajuda}{sufixo ? ` (${sufixo})` : ''}</small>
    </label>
  );

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Sistema</p>
          <h1 className="mq-display">Configurações</h1>
          <p className="mq-lede">Os números que o sistema usa como padrão.</p>
        </div>
      </div>

      {!original ? (
        <section className="mq-card mq-card--pad" aria-busy="true">
          <p className="mq-skel mq-skel--title" />
          <p className="mq-skel mq-skel--line" style={{ marginTop: 14 }} />
        </section>
      ) : (
        <>
          <section className="mq-card mq-card--pad">
            <h2 className="mq-subtitle">Operação</h2>
            <div className="mq-grid mq-grid--2">
              {campo('prazoDias', 'Prazo de acerto', 'quantos dias a maleta fica com a revendedora antes do acerto', 'dias')}
              {campo('inventarioDias', 'Lembrete de inventário', 'de quantos em quantos dias a contagem é sugerida', 'dias')}
              {campo('prataPct', 'Percentual da prata', 'usado no cálculo de comissão das peças de prata', '%')}
            </div>
            {/* "Peças por maleta" e "Reserva mínima" (maletaAlvoPecas,
                reservaMinima) saíram daqui: a V2 não os usa — o
                planejamento de maletas tem a própria configuração em
                Revendedoras › Planejamento — e dois lugares para o mesmo
                número deixavam a usuária sem saber qual vale. O painel
                clássico ainda os lê e edita. */}
            <p className="mq-hint" style={{ marginTop: 10 }}>
              O tamanho das maletas e quanto deixar em casa se ajustam em
              Revendedoras › Planejamento.
            </p>
          </section>

          <section className="mq-card mq-card--pad">
            <h2 className="mq-subtitle">Faixas de comissão</h2>
            <p className="mq-lede">
              Quanto a revendedora ganha conforme o valor do acerto. Elas são
              lidas de baixo para cima: o acerto cai na primeira faixa cujo
              limite ele não ultrapassa.
            </p>
            <dl className="mq-dl">
              {(valor('faixas') ?? []).map((f, i) => (
                <div key={`${f.limite ?? 'acima'}-${i}`}>
                  <dt>{f.limite === null ? 'Acima da última faixa' : `Até ${money(f.limite)}`}</dt>
                  <dd>{f.pct}%</dd>
                </div>
              ))}
            </dl>
            <p className="mq-hint" style={{ marginTop: 10 }}>
              As faixas ainda não se mudam por aqui: mexer nelas muda a
              comissão de todas as revendedoras.
            </p>
          </section>

          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
          {salvo && !mudou && (
            <p className="mq-note mq-note--ok"><Icone nome="check" /><span>Configuração salva.</span></p>
          )}

          <div className="mq-btns">
            <button type="button" className="mq-btn mq-btn--primary" disabled={!mudou || salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
            {mudou && (
              <button type="button" className="mq-btn mq-btn--ghost" onClick={() => setForm({})}>
                Descartar
              </button>
            )}
          </div>

          {/* Perfis e permissões não existem no sistema (o acesso é uma chave
              só); a seção que dizia isso saiu, porque anunciar o que não
              existe numa tela de uso diário só confunde. */}
          <details
            className="mq-card mq-card--pad"
            onToggle={(e) => setAvancadoAberto((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="mq-subtitle">Avançado</summary>
            <p className="mq-lede">Ajustes técnicos. Mexa só se souber o que está fazendo.</p>
            <div className="mq-stack" style={{ marginTop: 12 }}>
          <div>
            <h3 className="mq-subtitle">Início da integração com a loja</h3>
            <p className="mq-lede">
              Pedido da Nuvemshop anterior a esta data não vira venda aqui.
              Vazio significa sem corte.
            </p>
            <label className="mq-field">
              <span>Data e hora (formato 2026-08-23T12:00:00Z)</span>
              <input
                className="mq-input"
                placeholder="2026-08-23T12:00:00Z"
                value={String(valor('syncCorteEm') ?? '')}
                onChange={(e) => setForm((f) => ({ ...f, syncCorteEm: e.target.value.trim() || null }))}
              />
              <small>
                Uma data escrita errado é recusada ao salvar.
              </small>
            </label>
            {form.syncCorteEm !== undefined && (
              <div className="mq-btns">
                <button type="button" className="mq-btn mq-btn--primary" disabled={salvando} onClick={salvar}>
                  {salvando ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            )}
          </div>
              <div>
                <h3 className="mq-subtitle">Conferência das contas</h3>
                {avancadoAberto && <Conferencia conexao={conexao} />}
              </div>
            </div>
          </details>
        </>
      )}
    </>
  );
}
