import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * React Compiler / eslint-plugin-react-hooks (v6+) flood brownfield code with
 * set-state-in-effect, refs-during-render, purity, etc. Keep classic hooks rules;
 * defer the compiler-era ones until a dedicated migration.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "eslint-report.json",
    "eslint-counts.txt",
    "scripts/**",
  ]),
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      /* Discord CDN / remote icons: next/image not always usable */
      "@next/next/no-img-element": "off",
      /* Dep arrays often intentional in this codebase; enable per-file when migrating */
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);

export default eslintConfig;
