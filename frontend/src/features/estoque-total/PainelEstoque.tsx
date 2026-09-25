import type { AppState } from '../../types/api';
import { Icone } from '../../components/Icone';
import { money, plural } from '../../domain/formato';
import {
  inconsistencias,
  maletasCirculando,
  porCategoria,
  precisamDeAtencao,
  semPreco,
  totaisEstoque,
} from '../../domain/estoque';
import { calcularCapacidade } from '../../domain/capacidade';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

interface Props {
  estado: AppState;
  planejamento: UsoPlanejamento;
  /** Leva para Revendedoras › Visão Geral, onde o módulo de maletas mora
   *  inteiro. Aqui existe só o resumo. */
  aoVerPlanejamento: () => void;
  /** As duas ações do cabeçalho do protótipo, e as três saídas dos KPIs.
   *  Quem navega é o módulo de cima — este painel só diz para onde. */
  aoConferirEstoque: () => void;
  aoNovoProduto: () => void;
  aoVerPendencias: () => void;
}

/** Quanto de 100% cabe numa fatia, já arredondado para o `conic-gradient`.
 *  Sem total, o donut fica vazio em vez de dividir por zero. */
const fatia = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);

/** VISÃO GERAL DO ESTOQUE — a tela do protótipo, com os números reais.
 *
 *  A composição é a de `docs/ux/03-screens/estoque/master.html`, e ela
 *  responde nesta ordem:
 *
 *    1. cinco números    quanto vale, quanto existe, onde está, o que trava
 *    2. onde está o patrimônio   casa × revendedoras × loja, e as categorias
 *    3. o que precisa de gente   a fila de cadastro e as travas da loja
 *
 *  Todos saem do MESMO `GET /api/state` que o resto do módulo lê — nenhuma
 *  requisição a mais, e nenhum número que discorde de outra tela.
 *
 *  O que o protótipo mostra e aqui NÃO aparece como patrimônio: custo. Não
 *  existe coluna de custo em `produtos`, e um valor calculado sobre preço
 *  de VENDA não é patrimônio contábil. O cartão diz isso em vez de deixar
 *  alguém somar o número errado num balanço.
 */
export function PainelEstoque({
  estado,
  planejamento,
  aoVerPlanejamento,
  aoConferirEstoque,
  aoNovoProduto,
  aoVerPendencias,
}: Props) {
  const t = totaisEstoque(estado);
  const inc = inconsistencias(estado);
  const sp = semPreco(estado);
  const atencao = precisamDeAtencao(estado);
  const maletas = maletasCirculando(estado);
  const cap = calcularCapacidade(estado, planejamento.config);
  /* O cartão diz "POR QUANTIDADE", então ele ordena POR QUANTIDADE.
     `porCategoria` devolve na ordem do catálogo — que é o que o donut
     precisa, para a cor de cada fatia não trocar entre uma leitura e
     outra. Aqui a leitura é comparativa, e uma barra de 421 embaixo de
     uma de 287 faz o rótulo do cartão mentir. */
  const categorias = [...porCategoria(estado, 'total')].sort((a, b) => b.qtd - a.qtd);

  /* Nem tudo que está em casa pode ir para a loja: a sincronização recusa
     código duplicado, código com peça em maleta e código sem repartição de
     variação. `loja.variacoes` é a lista que ELA gravou, não uma conta
     feita aqui — ver docs/SYNC_ENGINE.md. */
  const travados = estado.loja?.variacoes ?? [];
  const duplicados = estado.loja?.duplicados ?? [];
  const temRetratoDaLoja = !!estado.loja?.lidoEm;
  const naLoja = estado.loja?.produtosNaLoja ?? 0;

  const pendencias = inc.length + sp.length + duplicados.length + travados.length;

  /* O donut é o do design system: um `conic-gradient` com duas paradas.
     `--a` fecha "em casa", `--b` fecha "com revendedoras", e o resto é a
     loja. Nenhuma biblioteca de gráfico entra no bundle por causa dele. */
  const pctCasa = fatia(t.casa, t.total);
  const pctFora = pctCasa + fatia(t.fora, t.total);

  /* A barra mais longa é a maior categoria, não 100% do estoque: a leitura
     é comparativa, e normalizar pelo total deixaria todas rasteiras. */
  const maiorCategoria = categorias.reduce((m, c) => Math.max(m, c.qtd), 0);

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Operação e distribuição</p>
          <h1 className="mq-display">Estoque</h1>
          <p className="mq-lede">
            Onde estão as peças, quanto vale o que está parado e o que precisa
            de conferência ou cadastro.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--secondary" onClick={aoConferirEstoque}>
            <Icone nome="box" />
            Conferir estoque
          </button>
          <button type="button" className="mq-btn mq-btn--primary" onClick={aoNovoProduto}>
            <Icone nome="plus" />
            Novo produto
          </button>
        </div>
      </div>

      <div className="mq-kpis">
        <div className="mq-kpi mq-kpi--accent">
          <span className="mq-kpi__label">Valor de referência</span>
          <strong className="mq-kpi__value">
            <i>R$</i>
            {Math.round(t.valTotal).toLocaleString('pt-BR')}
          </strong>
          <span className="mq-kpi__foot">Preço cadastrado · não é custo real</span>
        </div>

        <div className="mq-kpi">
          <span className="mq-kpi__label">Peças em estoque</span>
          <strong className="mq-kpi__value">{t.total.toLocaleString('pt-BR')}</strong>
          <span className="mq-kpi__foot">
            Saldo da razão de movimentos · {t.codigos} {plural(t.codigos, 'código', 'códigos')}
          </span>
        </div>

        <div className="mq-kpi">
          <span className="mq-kpi__label">Em casa</span>
          <strong className="mq-kpi__value">{t.casa.toLocaleString('pt-BR')}</strong>
          <span className="mq-kpi__foot">
            {Math.round(fatia(t.casa, t.total))}% do total · conferíveis no inventário
          </span>
        </div>

        <button type="button" className="mq-kpi" onClick={aoVerPlanejamento}>
          <span className="mq-kpi__label">Com revendedoras</span>
          <strong className="mq-kpi__value">{t.fora.toLocaleString('pt-BR')}</strong>
          <span className="mq-kpi__foot">
            {Math.round(fatia(t.fora, t.total))}% do total ·{' '}
            {maletas > 0
              ? `em ${maletas} ${plural(maletas, 'maleta aberta', 'maletas abertas')}`
              : 'nenhuma maleta aberta'}
          </span>
        </button>

        <button
          type="button"
          className={atencao.length > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}
          onClick={aoVerPendencias}
        >
          <span className="mq-kpi__label">Precisam de atenção</span>
          <strong className="mq-kpi__value">{atencao.length}</strong>
          <span className="mq-kpi__foot">Produtos sem foto, categoria ou preço</span>
        </button>
      </div>

      <section className="mq-card">
        <div className="mq-card__head">
          <div>
            <p className="mq-eyebrow">Distribuição</p>
            <h2 className="mq-title">Onde está o patrimônio</h2>
            <p className="mq-lede">
              A peça está em casa ou circulando com uma revendedora. O inventário
              só compara o que deveria estar em casa.
            </p>
          </div>
        </div>

        <div className="mq-card__body stock-overview">
          <div className="stock-overview__where">
            <div
              className="mq-donut"
              style={{ '--a': `${pctCasa}%`, '--b': `${pctFora}%` } as React.CSSProperties}
              role="img"
              aria-label={`${t.casa} peças em casa e ${t.fora} com revendedoras, de ${t.total} no total`}
            >
              <span className="mq-donut__label">
                <b>{t.total.toLocaleString('pt-BR')}</b>
                <small>peças no total</small>
              </span>
            </div>

            <dl className="mq-dl stock-split">
              <div>
                <dt>
                  <i className="dot dot--home" />
                  Em casa
                </dt>
                <dd>
                  {t.casa.toLocaleString('pt-BR')} <span className="mq-muted">peças</span>
                </dd>
              </div>
              <div>
                <dt>
                  <i className="dot dot--bags" />
                  Com revendedoras
                </dt>
                <dd>
                  {t.fora.toLocaleString('pt-BR')} <span className="mq-muted">peças</span>
                </dd>
              </div>
              <div>
                <dt>
                  <i className="dot dot--store" />
                  Anunciadas na loja
                </dt>
                <dd>
                  {temRetratoDaLoja ? (
                    <>
                      {naLoja.toLocaleString('pt-BR')} <span className="mq-muted">produtos</span>
                    </>
                  ) : (
                    /* A loja nunca foi lida nesta base. Mostrar "0" aqui
                       afirmaria que não há nada anunciado, e isso é uma
                       afirmação que não temos como fazer. */
                    <span className="mq-muted">loja ainda não lida</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="stock-overview__cats">
            <p className="mq-eyebrow">Principais categorias · por quantidade</p>
            {categorias.length === 0 ? (
              <p className="mq-lede">Nenhuma peça com categoria para comparar.</p>
            ) : (
              <div className="mq-bars">
                {categorias.slice(0, 5).map((c) => (
                  <div className="mq-bars__row" key={c.cat}>
                    <span>{c.cat}</span>
                    <span className="mq-meter">
                      <i style={{ width: `${Math.round(fatia(c.qtd, maiorCategoria))}%` }} />
                    </span>
                    <b>{c.qtd.toLocaleString('pt-BR')}</b>
                  </div>
                ))}
              </div>
            )}
            <p className="mq-note mq-mt-4">
              <Icone nome="alert" />
              <span>
                O valor de referência usa o <b>preço cadastrado</b>. Enquanto o
                custo real não existir no sistema, ele não representa patrimônio
                contábil.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* A SAÚDE DO ESTOQUE, em UMA linha.
          Ela era um cartão inteiro numa coluna de 340px ao lado do resumo
          (`.mq-grid--aside`), e o protótipo desta tela
          (`docs/ux/03-screens/estoque/master.html`) simplesmente não tem esse
          cartão: depois do panorama vem a conferência física, direto. Quatro
          parágrafos espremidos em 280px de largura é o que aquela coluna
          produzia — muito espaço para pouca informação, e a tela perdia o
          fio justamente onde ela deveria acelerar.

          O que NÃO foi feito: apagar os números. Eles continuam aqui, na
          mesma linha em que o protótipo põe as suas ressalvas, cada um
          dizendo em qual aba está o detalhe. Sumir com um código sem preço
          porque o cartão ficou feio seria engolir o que o sistema decidiu
          não resolver (regra 9). */}
      {pendencias > 0 && (
        <p className="mq-note mq-note--warn stock-health">
          <Icone nome="alert" />
          <span>
            <b>Precisam de uma pessoa:</b>{' '}
            {[
              inc.length && `${inc.length} ${plural(inc.length, 'código com mais peças na rua do que no cadastro', 'códigos com mais peças na rua do que no cadastro')}`,
              sp.length && `${sp.length} ${plural(sp.length, 'código sem preço', 'códigos sem preço')}`,
              duplicados.length && `${duplicados.length} ${plural(duplicados.length, 'código duplicado na loja', 'códigos duplicados na loja')}`,
              travados.length && `${travados.length} ${plural(travados.length, 'código não empurrado para a loja', 'códigos não empurrados para a loja')}`,
            ].filter(Boolean).join(' · ')}
            . O detalhe de cada um está nas abas <b>Na loja</b> e{' '}
            <b>Pendências</b>; o preço, em Cadastro de produtos.
          </span>
        </p>
      )}

      <section className="mq-card">
        <div className="mq-card__head">
          <div>
            <p className="mq-eyebrow">Resumo</p>
            <h2 className="mq-title">Potencial para consignação</h2>
          </div>
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoVerPlanejamento}>
            Ver planejamento
          </button>
        </div>
        <div className="mq-card__body">
          <p className="mq-figures">
            <strong>{cap.maletas}</strong>
          </p>
          <p className="mq-lede">
            {plural(cap.maletas, 'nova maleta', 'novas maletas')} de{' '}
            {cap.tamanhoAlvo} peças, mantendo {cap.reservaPct}% de cada código em
            casa.
          </p>
          <p className="mq-hint">
            {cap.consignavel} de {cap.emCasa} peças liberadas · premissa
            configurável, não regra do sistema. O planejamento mora em
            Revendedoras.
          </p>
          <dl className="mq-dl">
            <div>
              <dt>Valor em casa</dt>
              <dd>{money(t.valCasa)}</dd>
            </div>
            <div>
              <dt>Valor na rua</dt>
              <dd>{money(t.valFora)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
