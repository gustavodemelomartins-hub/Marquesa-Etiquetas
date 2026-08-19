/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  /* Caminhos relativos no build. O app é servido de um subdiretório
     (`/frontend/dist/` no servidor de teste, e um caminho ainda a decidir em
     produção), e `/assets/...` absoluto quebraria em qualquer um deles. */
  base: './',

  server: {
    port: 5173,
    strictPort: true,
    fs: {
      /* As fontes da marca vivem em `brand/`, um nível acima do projeto.
         Sem isto o servidor de desenvolvimento recusa lê-las. */
      allow: ['..'],
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    /* O Worker responde JSON pequeno; o peso aqui é só o React. Um aviso em
       500 kB só ensinaria a ignorar avisos. */
    chunkSizeWarningLimit: 700,
  },

  /* O Cloudflare Pages injeta CF_PAGES_COMMIT_SHA (e outras) como variável
     de ambiente real do build, sem prefixo VITE_ — o Vite só expõe pra
     `import.meta.env` o que começa com VITE_. Isto traduz uma pra outra,
     só o SHA (não é segredo, é só rótulo de versão). Fora da Cloudflare
     Pages (build local, CI de outro tipo) vira string vazia. */
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(process.env.CF_PAGES_COMMIT_SHA || ''),
  },

  test: {
    /* Ambiente padrão continua 'node' de propósito: a maior parte do que
       se testa aqui é lógica pura e a camada de API, e o comportamento
       real da interface é provado num navegador de verdade, pelo teste
       ponta a ponta — ver docs/TESTING.md. O fluxo de reconciliação por
       planilha (Estoque Total) é a exceção: é um assistente de várias
       etapas (escolha → upload → revisão → confirmação → resultado) onde
       vale a pena provar a ORQUESTRAÇÃO de estado com Testing Library,
       além do E2E. Esses arquivos declaram `// @vitest-environment jsdom`
       no topo — o padrão 'node' abaixo não muda para o resto da suíte. */
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
