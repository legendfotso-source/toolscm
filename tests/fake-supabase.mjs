/**
 * A small in-memory stand-in for the Supabase client.
 *
 * Enough of the query builder to run the real payment code — `grantPro` and
 * `settlePayment` — without a network, a database, or a provider account.
 * Those two functions decide who gets a paid month, and until now neither had
 * ever been executed anywhere.
 *
 * This deliberately reproduces the behaviours the real code depends on rather
 * than pretending to be a database:
 *
 *   - the unique index on (provider, transaction_id) raises 23505, which is
 *     the whole idempotency guarantee for admin-entered payments;
 *   - an UPDATE with a filter that matches nothing returns no rows, which is
 *     the whole idempotency guarantee for provider settlements;
 *   - `.maybeSingle()` gives null rather than throwing on no match.
 *
 * The SQL those behaviours rest on is verified separately, for real, in
 * run-db-tests.mjs. This file is about the decisions made around it.
 */

let sequence = 0;
const nextId = () => `id-${(sequence += 1)}`;

class Query {
  constructor(store, table, missingColumns = []) {
    this.store = store;
    this.table = table;
    this.missingColumns = missingColumns;
    this.columns = "*";
    this.filters = [];
    this.op = "select";
    this.payload = null;
    this.wantsRows = false;
    this.mode = null;
    this.orderKey = null;
    this.orderAsc = true;
    this.limitN = null;
  }

  /* ---- filters ---- */
  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  ilike(column, value) {
    const needle = String(value).toLowerCase();
    this.filters.push((row) => String(row[column] ?? "").toLowerCase() === needle);
    return this;
  }

  lte(column, value) {
    this.filters.push((row) => row[column] !== null && row[column] <= value);
    return this;
  }

  gte(column, value) {
    this.filters.push((row) => row[column] !== null && row[column] >= value);
    return this;
  }

  not(column, operator, value) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    }
    return this;
  }

  /* ---- shaping ---- */
  select(columns = "*") {
    if (this.op === "select") this.op = "select";
    this.columns = columns;
    this.wantsRows = true;
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.orderKey = column;
    this.orderAsc = ascending;
    return this;
  }

  limit(count) {
    this.limitN = count;
    return this;
  }

  single() {
    this.mode = "single";
    return this;
  }

  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  /* ---- writes ---- */
  insert(values) {
    this.op = "insert";
    this.payload = values;
    return this;
  }

  update(values) {
    this.op = "update";
    this.payload = values;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  /* ---- execution ---- */
  matching() {
    const rows = this.store[this.table] ?? [];
    return rows.filter((row) => this.filters.every((test) => test(row)));
  }

  /**
   * A column the database does not have yet.
   *
   * Used to reproduce the window between pushing code that knows about `tier`
   * and running the migration that adds it. PostgreSQL answers 42703 to both a
   * SELECT and a write that names a column it has never heard of.
   */
  missingColumnError() {
    if (this.missingColumns.length === 0) return null;

    const named =
      this.op === "select"
        ? String(this.columns).split(",").map((part) => part.trim())
        : Object.keys(
            Array.isArray(this.payload) ? (this.payload[0] ?? {}) : (this.payload ?? {}),
          );

    const absent = named.find((column) => this.missingColumns.includes(column));
    if (!absent) return null;
    return {
      data: null,
      error: { code: "42703", message: `column "${absent}" does not exist` },
    };
  }

  run() {
    const missing = this.missingColumnError();
    if (missing) return missing;

    const rows = this.store[this.table] ?? (this.store[this.table] = []);

    if (this.op === "insert") {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = [];

      for (const values of incoming) {
        // The unique index the whole idempotency story rests on.
        if (this.table === "payments") {
          const clash = rows.some(
            (row) =>
              row.provider === values.provider && row.transaction_id === values.transaction_id,
          );
          if (clash) {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "payments_provider_transaction_idx"',
              },
            };
          }
        }

        const row = {
          id: nextId(),
          created_at: new Date().toISOString(),
          subscription_id: null,
          ...values,
        };
        rows.push(row);
        created.push(row);
      }

      return this.shape(created);
    }

    if (this.op === "update") {
      const targets = this.matching();
      for (const row of targets) Object.assign(row, this.payload);
      return this.shape(targets);
    }

    if (this.op === "delete") {
      const targets = this.matching();
      this.store[this.table] = rows.filter((row) => !targets.includes(row));
      return this.shape(targets);
    }

    let found = this.matching();

    if (this.orderKey) {
      const key = this.orderKey;
      found = [...found].sort((a, b) => {
        const left = a[key] ?? "";
        const right = b[key] ?? "";
        if (left === right) return 0;
        return (left < right ? -1 : 1) * (this.orderAsc ? 1 : -1);
      });
    }

    if (this.limitN !== null) found = found.slice(0, this.limitN);
    return this.shape(found);
  }

  /**
   * Return only the columns that were asked for.
   *
   * PostgREST does this, and the difference matters: code that reads a field
   * it did not select gets `undefined` in production. A fake that hands back
   * whole rows hides exactly the bug this suite exists to catch — a fallback
   * SELECT that drops a column and then reads it anyway.
   */
  project(rows) {
    if (this.columns === "*" || !this.columns) return rows;
    const wanted = String(this.columns)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (wanted.length === 0) return rows;
    return rows.map((row) => {
      const picked = {};
      for (const column of wanted) picked[column] = row[column];
      return picked;
    });
  }

  shape(rows) {
    rows = this.project(rows);
    if (this.mode === "single") {
      if (rows.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: "no rows returned" } };
      }
      return { data: rows[0], error: null };
    }
    if (this.mode === "maybeSingle") {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  then(resolve, reject) {
    try {
      resolve(this.run());
    } catch (error) {
      if (reject) reject(error);
      else throw error;
    }
  }
}

export function createFakeClient(seed = {}, { missingColumns = [] } = {}) {
  const store = {
    payments: [],
    subscriptions: [],
    profiles: [],
    usage_logs: [],
    admin_settings: [],
    tool_events: [],
    ...seed,
  };

  return {
    store,
    from(table) {
      return new Query(store, table, missingColumns);
    },
  };
}
