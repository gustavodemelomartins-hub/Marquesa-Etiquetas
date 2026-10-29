// Lint rápido do painel React (sem informação de tipos). As regras que
// precisam do checador de tipos ficam em eslint.typed.config.mjs, rodadas
// por `npm run lint:types`, fora do caminho rápido.
//
// Base: vibe-coding-toolkit f13bb35, templates/eslint/eslint.config.mjs.example,
// adaptado ao projeto: sem Next, sem Drizzle, sem fronteira de banco (o
// frontend só fala com a API por src/services/), sem import-x (não há
// camadas declaradas para policiar ainda).
//
// Severidades medidas em 15/10/2026 (ver docs/setup.md, "Linha de base de
// lint"): regra com violação existente entra como "warn" com a contagem
// anotada; regra sem violação entra como "error". Só "error" reprova
// `npm run lint`, que roda na suíte (frontend-lint); os workflows de deploy
// existentes não executam essa suíte automaticamente.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import quality from "./eslint-rules/index.cjs";

const testFiles = [
  "**/*{.,-}{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/{__tests__,__mocks__,fixtures,mocks}/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
];

export default defineConfig([
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
      globals: globals.browser,
    },
    settings: { react: { version: "detect" } },
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  reactPlugin.configs.flat["jsx-runtime"],
  reactHooks.configs.flat.recommended,

  {
    files: ["src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    plugins: { quality },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Orçamento de tamanho e complexidade: "warn" de propósito, como no
      // toolkit. É conversa sobre fatoração, não gate.
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],
      "max-statements": ["warn", 20],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["warn", 3],
      // Arquivo novo acima de 350 linhas reprova. Os existentes ficam nesta
      // lista (27 em 15/10/2026); tirar daqui quando quebrar o arquivo.
      "quality/max-lines": [
        "error",
        {
          max: 350,
          ignore: [
            "src/domain/analytics.ts",
            "src/domain/sugestoes.ts",
            "src/features/catalogo/NovoProduto.tsx",
            "src/features/clientes/PerfilCliente.tsx",
            "src/features/estoque/FichaDaPeca.tsx",
            "src/features/estoque/PecasArea.tsx",
            "src/features/estoque/galeria/GaleriaDaPeca.tsx",
            "src/features/estoque/galeria/ImportarFotosDaLoja.tsx",
            "src/features/financeiro/AReceber.tsx",
            "src/features/financeiro/FinanceiroArea.tsx",
            "src/features/garantias/CasoDeReparo.tsx",
            "src/features/home/PendenciasArea.tsx",
            "src/features/home/ResolverPendencia.tsx",
            "src/features/inventario/BalancoDoInventario.tsx",
            "src/features/inventario/ConferenciaDaPeca.tsx",
            "src/features/inventario/InventarioArea.tsx",
            "src/features/inventario/RevisaoDoInventario.tsx",
            "src/features/inventario/contagem.ts",
            "src/features/maletas/CriarMaletaFluxo.tsx",
            "src/features/nuvemshop/VisaoGeralArea.tsx",
            "src/features/publicacao/FilaArea.tsx",
            "src/features/publicacao/tipos.ts",
            "src/features/saidas/SaidasArea.tsx",
            "src/features/vendas/MonteSeuColar.tsx",
            "src/features/vendas/NovaVenda.tsx",
            "src/features/vendas/PainelVendas.tsx",
            "src/testing/paridade.ts",
          ],
        },
      ],
      // O frontend ainda não tem helper de log; console direto precisa de
      // justificativa local (eslint-disable com motivo).
      "quality/no-direct-console": [
        "error",
        { logger: "um helper de log do projeto (o frontend ainda não tem)" },
      ],
    },
  },
  {
    // vite.config.ts roda no Node, não no navegador.
    files: ["vite.config.ts"],
    languageOptions: { globals: globals.node },
    // `/// <reference types="vitest/config" />` é a forma documentada pelo
    // Vitest para tipar `test` no vite.config.ts.
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },
  {
    // Linha de base de 15/10/2026: regras com violação existente ficam em
    // "warn" com a contagem medida. Promover a "error" quando zerar.
    rules: {
      "@typescript-eslint/no-non-null-assertion": "warn", // 124
      "react-hooks/set-state-in-effect": "warn", // 25
      "react-hooks/refs": "warn", // 9
      "react-hooks/immutability": "warn", // 1
      "react-hooks/purity": "warn", // 1
    },
  },
  {
    files: testFiles,
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
    },
  },
  {
    files: testFiles,
    rules: {
      "max-statements": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
    },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    "node_modules/**",
    "dist/**",
    "coverage/**",
    "**/*.tsbuildinfo",
    "package-lock.json",
  ]),
]);
