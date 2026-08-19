/** Selo "DEV · <commit>" — só aparece quando o build é do ambiente de
 *  desenvolvimento (`VITE_APP_ENV=dev`, configurado só no projeto
 *  Cloudflare Pages `marquesa-dev`). Produção nunca define essa variável,
 *  então nunca renderiza nada aqui — não é um `if` de ambiente espalhado
 *  pelo app, é UM lugar só. */
export function DevBadge() {
  if (import.meta.env.VITE_APP_ENV !== 'dev') return null;
  const sha = import.meta.env.VITE_COMMIT_SHA;
  return (
    <span className="selo-dev" title="Ambiente de desenvolvimento — dados sintéticos, nunca produção">
      DEV{sha ? ` · ${sha.slice(0, 7)}` : ''}
    </span>
  );
}
