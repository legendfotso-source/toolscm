/**
 * Build the one file a human pastes into the Supabase SQL editor.
 *
 *   npm run paste-file
 *
 * Migrations are numbered so they have an order, and that order lives in
 * somebody's head the moment they are applied by hand through a web page. On
 * 1 October 2026 the live project had 0001 and nothing else — 0002 had been
 * written, tested and committed, and never run — so pasting 0003 died halfway
 * through with `type "public.plan_tier" does not exist`, in a database the
 * statements above the failure had already half-changed.
 *
 * So the repository now carries the concatenation, in order, as a file. One
 * paste, one Run, no order to remember. `npm run test:db` checks both that it
 * still matches the migrations it was built from and that it really applies
 * to a database holding only 0001 — twice, because every one of these files
 * claims to be safe to re-run.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");

export const HEADER = `-- ===========================================================================
-- Tools.cm — TOUTES LES MIGRATIONS, DANS L'ORDRE
--
-- Tout coller dans l'éditeur SQL de Supabase, appuyer sur Run, une fois.
--
-- Si une fenêtre « Potential issue detected » apparaît, c'est normal : ce
-- fichier remplace des politiques de sécurité et retire des droits au rôle
-- anonyme. Cliquez sur « Run query ».
--
-- Chaque migration est réexécutable sans danger : les repasser alors qu'elles
-- sont déjà passées ne change rien. En cas de doute, repassez tout.
--
-- NE PAS MODIFIER À LA MAIN — ce fichier est produit par
-- \`npm run paste-file\` et \`npm run test:db\` échoue s'il a dérivé.
-- ===========================================================================
`;

/** The migrations, in order, as one string. The order is the file name. */
export function buildPasteFile() {
  const names = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const bodies = names.map((name) => readFileSync(join(dir, name), "utf8").replace(/\s*$/, ""));
  return `${HEADER}\n${bodies.join("\n\n\n")}\n`;
}

export const PASTE_FILE = join(root, "supabase", "PASTE-INTO-SUPABASE.sql");

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(PASTE_FILE, buildPasteFile());
  console.log(`Wrote ${PASTE_FILE}`);
}
