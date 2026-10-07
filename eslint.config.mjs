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
    // Every build output directory, not only the default one. next.config.ts
    // reads distDir from TOOLSCM_DIST_DIR, and the layout and access suites
    // set it to `.next-tools` so a test build cannot clobber a dev server's
    // `.next`. That directory is gitignored but it was NOT lint-ignored, so
    // `npm run lint` walked a few thousand files of generated and vendored
    // bundles and reported 1818 errors in them. The three real findings in
    // src/ were on page 40 of the output, which is the same as not being
    // reported at all — a lint run nobody can read is a lint run nobody runs.
    ".next-*/**",
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
