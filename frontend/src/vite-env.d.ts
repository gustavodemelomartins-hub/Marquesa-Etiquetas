/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço da API sugerido no formulário de conexão — nunca conecta
   *  sozinho, só preenche o campo. Vem de variável de build (Cloudflare
   *  Pages, por ambiente), nunca hardcoded em componente. */
  readonly VITE_API_URL?: string;
  /** 'dev' liga o selo "DEV · <commit>" no rodapé. Ausente em produção. */
  readonly VITE_APP_ENV?: string;
  /** Injetado via `define` em vite.config.ts a partir de
   *  CF_PAGES_COMMIT_SHA — não é segredo, é só rótulo de versão. */
  readonly VITE_COMMIT_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
