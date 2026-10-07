-- ===========================================================================
-- 0007 — Somewhere to count requests
--
-- Nothing in this application rate-limits anything. The audit found three
-- consequences, and the first is the one that costs money:
--
--   /api/webhooks/campay has no signature — correctly, because forging it
--   grants nothing: the handler re-asks CamPay before settling anything. What
--   that reasoning missed is VOLUME. Every POST makes the server fetch a token
--   and then a status from CamPay: two authenticated outbound calls, triggered
--   by anyone, with no ceiling. A trivial loop turns the endpoint into an
--   amplifier pointed at the CamPay quota and the Vercel function budget.
--
--   /api/events and /api/views are unauthenticated writes. tool_events inserts
--   a new row per request with no cap at all.
--
--   /api/payments/verify is signed-in, but each call can trigger an outbound
--   provider request, and the only thing pacing it is the client's own
--   backoff — which is to say, nothing.
--
-- One row per hit. Counting rows in a window is one indexed query; no Redis,
-- no extra service that can be down on the day the site is being hammered.
-- ===========================================================================

create table if not exists public.rate_hits (
  id         bigint generated always as identity primary key,
  -- What is being limited: 'webhook:campay', 'contact', 'verify'.
  bucket     text not null,
  -- Who. A salted digest, an account id — never a raw address. The usage
  -- fingerprint is reused so there is one definition of "who is this request
  -- from" in the codebase, and so an IP still never lands in a table.
  key        text not null,
  created_at timestamptz not null default now()
);

-- The only query this table serves: how many hits in this bucket, from this
-- key, since a moment. Column order matters — bucket and key are equality
-- tests, created_at is a range, and a range column has to come last or the
-- index stops being usable for the equalities beyond it.
create index if not exists rate_hits_window_idx
  on public.rate_hits (bucket, key, created_at desc);

-- For the sweep, which deletes by age across every bucket.
create index if not exists rate_hits_age_idx on public.rate_hits (created_at);

alter table public.rate_hits enable row level security;

-- No policy and no grant for anon or authenticated, in either direction.
-- A browser that could write this table could fill it; a browser that could
-- DELETE from it could clear its own limit, which is the more interesting
-- attack and the reason this is not merely "no insert".

grant select, insert, delete on public.rate_hits to service_role;
grant usage on all sequences in schema public to service_role;
