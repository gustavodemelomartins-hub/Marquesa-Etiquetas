/* Vitrine do Design System · usa os mesmos componentes do produto. */
document.addEventListener('marquesa-ready', () => {
  document.querySelectorAll('[data-open]').forEach(b =>
    b.addEventListener('click', () => document.getElementById(b.dataset.open)?.showModal()));
  const toast = document.querySelector('[data-ds-toast]');
  document.querySelector('[data-toast]')?.addEventListener('click', () => {
    toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => toast.hidden = true, 2800);
  });
  const grid = document.querySelector('[data-icon-grid]');
  if (grid && window.MarquesaUI) {
    const labels = { home:'Home', sale:'Venda', person:'Cliente', people:'Clientes', money:'Financeiro',
      card:'Cartão', cash:'Dinheiro', pix:'Pix', credit:'Crédito', receipt:'Recebimento', box:'Estoque',
      inventory:'Inventário', tag:'Catálogo', label:'Etiqueta', cloud:'Nuvemshop', shield:'Garantia',
      repair:'Reparo', swap:'Troca', bag:'Maleta', bell:'Notificação', clock:'Prazo', calendar:'Agenda',
      settings:'Configuração', search:'Busca', check:'Concluído', close:'Fechar', menu:'Menu', arrow:'Ir',
      chevron:'Avançar', plus:'Adicionar', alert:'Atenção', image:'Foto', upload:'Enviar', doc:'Documento',
      filter:'Filtro', star:'Destaque', link:'Link externo' };
    grid.innerHTML = Object.entries(labels).map(([name, label]) =>
      `<figure>${window.MarquesaUI.icon(name)}<figcaption>${label}</figcaption><code>${name}</code></figure>`).join('');
  }
});
