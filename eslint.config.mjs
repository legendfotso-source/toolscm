import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party runtime assets copied in by `npm run assets` — vendored
    // code we do not own and must not reformat.
    "public/pdfjs/**",
    "public/vendor/**",
    "public/sw.js",
  ]),
]);

export default eslintConfig;
