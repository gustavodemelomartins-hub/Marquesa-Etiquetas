import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icone } from '../../components/Icone';
import { ApiError } from '../../types/api';
import { atualizarCliente, criarCliente } from './api';
import type { Connection } from '../../services/client';
import type { CadastroCliente, DadosCadastro } from './tipos';

interface Props {
  conexao: Connection;
  /** `null` cria; um cadastro edita o dele. */
  cadastro: CadastroCliente | null;
  aoFechar: () => void;
  aoSalvar: (id: number) => void;
}

const VAZIO: DadosCadastro = {
  nome: '', tel: '', email: '', instagram: '', cidade: '', cpf: '', nascimento: '', obs: '',
};

/** Cadastro e edição, na mesma gaveta.
 *
 *  Os campos são exatamente os que `POST /api/clientes` e
 *  `PATCH /api/clientes/:id` aceitam — nenhum a mais, para a tela não
 *  prometer guardar o que o banco não guarda.
 *
 *  Renomear uma cliente é a operação delicada aqui: o histórico dela é
 *  casado por nome normalizado, e o backend amarra as linhas ao `id` ANTES
 *  de trocar o nome justamente para que nada desapareça. A tela diz isso
 *  em vez de deixar a pessoa descobrir vendo o total zerar.
 */
export function FormCliente({ conexao, cadastro, aoFechar, aoSalvar }: Props) {
  const [dados, setDados] = useState<DadosCadastro>(() => (cadastro ? {
    nome: cadastro.nome ?? '',
    tel: cadastro.tel ?? '',
    email: cadastro.email ?? '',
    instagram: cadastro.instagram ?? '',
    cidade: cadastro.cidade ?? '',
    cpf: cadastro.cpf ?? '',
    nascimento: cadastro.nascimento ?? '',
    obs: cadastro.obs ?? '',
  } : VAZIO));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const primeiro = useRef<HTMLInputElement>(null);

  useEffect(() => { primeiro.current?.focus(); }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const campo = (k: keyof DadosCadastro) => ({
    value: dados[k],
    onChange: (e: { target: { value: string } }) =>
      setDados((d) => ({ ...d, [k]: e.target.value })),
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!dados.nome.trim()) { setErro('Nome é obrigatório.'); return; }
    setSalvando(true);
    setErro('');
    try {
      if (cadastro) {
        await atualizarCliente(conexao, cadastro.id, dados);
        aoSalvar(cadastro.id);
      } else {
        const r = await criarCliente(conexao, dados);
        aoSalvar(r.id);
      }
    } catch (e2) {
      setErro(e2 instanceof ApiError || e2 instanceof Error ? e2.message : 'Não consegui salvar.');
      setSalvando(false);
    }
  }

  const renomeando = !!cadastro && dados.nome.trim() !== (cadastro.nome ?? '').trim();

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <form
        className="mq-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={cadastro ? 'Editar cliente' : 'Nova cliente'}
        onSubmit={enviar}
      >
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">{cadastro ? 'Editar' : 'Cadastro'}</p>
            <h2 className="mq-title">{cadastro ? cadastro.nome : 'Nova cliente'}</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body">
          <label className="mq-field">
            <span>Nome</span>
            <input className="mq-input" ref={primeiro} required {...campo('nome')} />
          </label>

          {renomeando && (
            <p className="mq-note mq-note--info">
              <Icone nome="alert" />
              <span>
                Trocar o nome não perde o histórico: as compras dela são
                amarradas ao cadastro antes da troca. O que muda é só como ela
                passa a ser chamada.
              </span>
            </p>
          )}

          <div className="mq-grid mq-grid--2">
            <label className="mq-field">
              <span>Telefone</span>
              <input className="mq-input" inputMode="tel" {...campo('tel')} />
            </label>
            <label className="mq-field">
              <span>Cidade</span>
              <input className="mq-input" {...campo('cidade')} />
            </label>
          </div>

          <div className="mq-grid mq-grid--2">
            <label className="mq-field">
              <span>E-mail</span>
              <input className="mq-input" type="email" {...campo('email')} />
            </label>
            <label className="mq-field">
              <span>Instagram</span>
              <input className="mq-input" placeholder="@" {...campo('instagram')} />
            </label>
          </div>

          <div className="mq-grid mq-grid--2">
            <label className="mq-field">
              <span>CPF</span>
              <input className="mq-input" inputMode="numeric" {...campo('cpf')} />
              <small>Só serve para busca. Pode ficar em branco.</small>
            </label>
            <label className="mq-field">
              <span>Nascimento</span>
              <input className="mq-input" type="date" {...campo('nascimento')} />
            </label>
          </div>

          <label className="mq-field">
            <span>Observações</span>
            <textarea className="mq-textarea" rows={4} {...campo('obs')} />
            <small>O que ajuda a atender melhor: tamanho, preferência, combinado.</small>
          </label>

          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

          <div className="mq-btns">
            <button type="submit" className="mq-btn mq-btn--primary" disabled={salvando}>
              {salvando ? 'Salvando…' : cadastro ? 'Salvar alterações' : 'Cadastrar cliente'}
            </button>
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
