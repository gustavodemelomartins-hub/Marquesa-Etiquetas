import type { Panorama } from './panorama';
import { StatusBadge, type Tom } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';

interface Pendencia {
  chave: string;
  titulo: string;
  quantidade: number;
  tom: Tom;
  descricao: string;
  skus: string[];
}

/** O que precisa de uma PESSOA — e só isso.
 *
 *  "Estoque errado no site" fica de fora de propósito: a sincronização
 *  resolve sozinha na próxima rodada. Listar como pendência o que o robô já
 *  vai consertar é o que faz o painel legado parecer sempre em chamas. */
export function montarPendencias(p: Panorama): Pendencia[] {
  const lista: Pendencia[] = [];

  if (p.duplicados.length) {
    lista.push({
      chave: 'duplicado',
      titulo: 'Cadastro duplicado na loja',
      quantidade: p.duplicados.length,
      tom: 'critico',
      descricao:
        'O mesmo código está em dois produtos diferentes da Nuvemshop. O estoque fica dividido entre dois anúncios e a conta nunca fecha. A sincronização não toca neles: não há como dividir automaticamente entre dois cadastros.',
      skus: p.duplicados,
    });
  }

  const porMotivo = {
    sem_reparticao: p.comVariacao.filter((v) => v.motivo === 'sem_reparticao'),
    maleta: p.comVariacao.filter((v) => v.motivo === 'maleta'),
    duplicado: p.comVariacao.filter((v) => v.motivo === 'duplicado'),
  };

  if (porMotivo.sem_reparticao.length) {
    lista.push({
      chave: 'sem_reparticao',
      titulo: 'Falta dizer de qual variação é cada peça',
      quantidade: porMotivo.sem_reparticao.length,
      tom: 'atencao',
      descricao:
        'Sobram peças sem variação atribuída. Enquanto a repartição estiver pela metade, as caixinhas da loja somadas dariam menos do que existe aqui — e a diferença sairia do ar como se a peça não existisse. O código volta a ser sincronizado assim que estiver inteiramente repartido.',
      skus: porMotivo.sem_reparticao.map((v) => v.sku),
    });
  }

  if (porMotivo.maleta.length) {
    lista.push({
      chave: 'maleta',
      titulo: 'Peça com variação está em maleta',
      quantidade: porMotivo.maleta.length,
      tom: 'atencao',
      descricao:
        'A maleta ainda não registra qual variação saiu. Descontar da errada tiraria do ar uma peça que está aqui, então a sincronização não mexe no estoque desses códigos enquanto a maleta não encerrar.',
      skus: porMotivo.maleta.map((v) => v.sku),
    });
  }

  if (p.faltaSubir.length) {
    lista.push({
      chave: 'falta_cadastrar',
      titulo: 'Tem peça em casa e não existe na loja',
      quantidade: p.faltaSubir.length,
      tom: 'atencao',
      descricao:
        'A sincronização não cria produto na Nuvemshop — ela só atualiza o estoque de quem existe nos dois lados. Cadastrar é um passo manual, e o código some desta lista sozinho na rodada seguinte.',
      skus: p.faltaSubir.map((x) => x.sku),
    });
  }

  if (p.ocultosComPeca.length) {
    lista.push({
      chave: 'oculto_com_peca',
      titulo: 'Produto fora do ar com peça disponível',
      quantidade: p.ocultosComPeca.length,
      tom: 'atencao',
      descricao:
        'Estão cadastrados na loja, têm peça em casa e não estão visíveis — não vendem enquanto ficarem assim. Reativar é decisão sua, na Nuvemshop.',
      skus: p.ocultosComPeca.map((x) => x.sku),
    });
  }

  return lista;
}

export function PendenciasList({ panorama }: { panorama: Panorama }) {
  const pendencias = montarPendencias(panorama);

  if (!pendencias.length) {
    return (
      <EmptyState
        titulo="Nada esperando por você"
        descricao="Nenhum cadastro duplicado, nenhuma variação pela metade e nenhum código sem anúncio. A sincronização dá conta do resto sozinha."
      />
    );
  }

  const total = pendencias.reduce((s, p) => s + p.quantidade, 0);

  return (
    <>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 'var(--r3)' }}>
        {total === 1
          ? '1 item precisa da sua atenção.'
          : `${total} itens precisam da sua atenção.`}{' '}
        Nenhum deles é resolvido pela sincronização.
      </p>

      <div className="cartao">
        {pendencias.map((p) => (
          <article key={p.chave} className="pendencia">
            <div className="cabeca">
              <span className="titulo">{p.titulo}</span>
              <StatusBadge tom={p.tom}>{p.quantidade}</StatusBadge>
            </div>
            <p className="descricao">{p.descricao}</p>
            {p.skus.length > 0 && (
              <div className="skus">
                {p.skus.slice(0, 12).map((s) => (
                  <code key={s}>{s}</code>
                ))}
                {p.skus.length > 12 && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    e mais {p.skus.length - 12}
                  </span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
