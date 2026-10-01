/**
 * Run the real migration against a real PostgreSQL server, then check what it
 * actually guarantees.
 *
 *   npm run test:db
 *
 * Why this exists. Everything that decides who has paid and who has used their
 * allowance lives in SQL — the daily limit, the idempotency index, the row
 * level security policies, the grants. Until now none of it had ever been
 * executed anywhere except the production project, and "it ran once in the
 * dashboard" is not a test you can repeat before a deploy.
 *
 * A throwaway cluster is created, the untouched `0001_init.sql` is applied on
 * top of a small stand-in for the Supabase-specific pieces (the four roles,
 * `auth.users`, `auth.uid()`), and `db-checks.sql` asserts the guarantees. The
 * cluster is destroyed afterwards, pass or fail.
 *
 * Skips cleanly with exit 0 when no PostgreSQL server binaries are installed,
 * so it never blocks anyone who just wants to work on the tools.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Find the server binaries. `psql` alone is not enough — that is just a client. */
function findBinDir() {
  const candidates = [
    process.env.PG_BIN_DIR,
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
    "/usr/lib/postgresql/15/bin",
    "/usr/local/opt/postgresql@16/bin",
    "/opt/homebrew/opt/postgresql@16/bin",
    "/usr/bin",
  ].filter(Boolean);

  for (const dir of candidates) {
    if (existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) return dir;
  }
  return null;
}

const bin = findBinDir();
if (!bin) {
  console.log(
    "PostgreSQL server binaries not found — skipping the database checks.\n" +
      "Install postgresql (or set PG_BIN_DIR) to run them.",
  );
  process.exit(0);
}

/**
 * PostgreSQL refuses to run as root, and CI containers often are root. When
 * that happens, drop to an unprivileged account rather than failing — but only
 * to one that already exists, and never by creating one.
 */
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
const dropTo = asRoot
  ? ["claude", "postgres", "nobody"].find(
      (name) => spawnSync("id", ["-u", name], { stdio: "ignore" }).status === 0,
    )
  : null;

if (asRoot && !dropTo) {
  console.log(
    "Running as root and no unprivileged account to drop to — skipping the database checks.\n" +
      "PostgreSQL will not start as root. Run this as a normal user.",
  );
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "toolscm-db-"));
const data = join(dir, "data");
const PORT = process.env.PG_TEST_PORT ?? "55433";

/** Run a command, as the unprivileged user when we had to drop privileges. */
function run(command, { quiet = false } = {}) {
  const full = `export PATH="${bin}:$PATH"; ${command}`;
  const args = dropTo ? ["-s", "/bin/sh", dropTo, "-c", full] : ["-c", full];
  const file = dropTo ? "su" : "/bin/sh";

  return execFileSync(file, args, {
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
  });
}

const BOOTSTRAP = `
-- Stand-ins for the Supabase-specific pieces the migration depends on. These
-- all exist in a real project; recreating them here is what lets the REAL
-- migration run untouched against a plain PostgreSQL server.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's auth.uid() reads a JWT claim. A settable parameter stands in for
-- it, so the policies can be exercised as different signed-in users.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;
`;

let failed = false;

try {
  if (dropTo) {
    // Done as root, before dropping: the unprivileged user cannot chown a
    // directory it does not yet own, and mkdtemp creates it 0700.
    execFileSync("chown", ["-R", dropTo, dir]);
    execFileSync("chmod", ["755", dir]);
  }

  run(`initdb -D ${data} -U postgres --auth=trust`, { quiet: true });
  run(`pg_ctl -D ${data} -o "-p ${PORT} -k ${dir}" -l ${dir}/log start`, { quiet: true });

  // Give the postmaster a moment to accept connections.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      run(`psql -h ${dir} -p ${PORT} -U postgres -tAc "select 1"`, { quiet: true });
      break;
    } catch {
      execFileSync("sleep", ["0.4"]);
    }
  }

  writeFileSync(join(dir, "bootstrap.sql"), BOOTSTRAP);

  const psql = `psql -h ${dir} -p ${PORT} -U postgres -v ON_ERROR_STOP=1 -q`;
  run(`${psql} -f ${dir}/bootstrap.sql`, { quiet: true });

  // EVERY migration, in order, read off the directory rather than listed here
  // — a list written by hand is correct until somebody adds a migration and
  // forgets to add it, which is how 0002 and 0003 went untested for a while
  // and how `plan_tier` ended up being a type this suite had never seen.
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of migrations) {
    console.log(`Applying supabase/migrations/${name} to a fresh database...`);
    run(`${psql} -f ${join(root, "supabase/migrations", name)}`, { quiet: true });
  }

  // Applied twice, start to finish. Every one of these files claims to be
  // safe to re-run, and that claim is the whole reason it is safe to paste one
  // into the Supabase SQL editor when you are not sure whether you already
  // did. Asserting it costs one more pass.
  for (const name of migrations) {
    run(`${psql} -f ${join(root, "supabase/migrations", name)}`, { quiet: true });
  }
  console.log(`Applied cleanly, twice — ${migrations.length} migrations.\n`);

  // The checks print their own PASS lines; a failure raises and psql exits
  // non-zero, which throws here.
  const output = run(`${psql} -f ${join(here, "db-checks.sql")} 2>&1`, { quiet: true });
  const lines = output
    .split("\n")
    .filter((line) => /PASS |FAILED|ERROR/.test(line))
    .map((line) => line.replace(/^psql:.*?(NOTICE|ERROR):\s*/, "").trimEnd());

  for (const line of lines) {
    console.log(line.startsWith("PASS") ? `[32m${line}[0m` : `[31m${line}[0m`);
  }

  const passed = lines.filter((line) => line.startsWith("PASS")).length;
  failed = lines.some((line) => !line.startsWith("PASS"));
  console.log("");
  console.log(`${passed} database guarantee${passed === 1 ? "" : "s"} verified`);
} catch (error) {
  failed = true;
  const detail = error.stdout || error.stderr || error.message;
  console.error(String(detail).split("\n").slice(-25).join("\n"));
} finally {
  try {
    run(`pg_ctl -D ${data} -m immediate stop`, { quiet: true });
  } catch {
    /* already down */
  }
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
