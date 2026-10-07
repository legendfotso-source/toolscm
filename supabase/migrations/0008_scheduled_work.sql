-- ===========================================================================
-- 0008 — Work that has to happen when nobody is looking
--
-- Two functions were written and then never called by anything.
--
--   expireStalePayments() closes checkouts that were opened and abandoned.
--   It exists, it is tested, and grep finds exactly one reference to it: its
--   own definition. So `pending` rows still accumulate for ever and "what is
--   pending right now" — the reading that tells you a provider has gone quiet
--   — still stops being answerable after a few hundred visitors. Phase 5
--   wrote the function and forgot the caller, which is the quietest possible
--   way to ship nothing.
--
--   reminderMessage() composes the renewal nudge, and the only thing that
--   sends it is a person tapping a WhatsApp link in /admin. On a manual
--   Mobile Money flow there is no card on file to charge again, so somebody
--   telling the customer IS the entire renewal mechanism — and a renewal
--   mechanism that requires the owner to open a page every morning is one
--   that stops the first busy week.
--
-- Both now run from a scheduled request. That needs two things stored:
--
--   WHICH reminder has already gone out, so a daily job does not send the
--   same one three days running. Recorded as the end_date it was sent FOR,
--   not as a flag or a timestamp: when the customer renews, end_date moves,
--   the recorded value no longer matches, and the next expiry is eligible
--   again with nothing to reset. A boolean would have had to be cleared on
--   renewal, and the renewal path would have had to remember to clear it.
--
--   WHEN each job last ran, because a scheduled job that silently stops is
--   indistinguishable from a quiet month. The admin panel reads this.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Which renewal reminder has been sent
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists reminded_for timestamptz;

comment on column public.subscriptions.reminded_for is
  'The end_date a renewal reminder was last sent for. Equal to end_date means '
  'the customer has already been told about THIS expiry. Renewing moves '
  'end_date, which makes them eligible again with nothing to reset.';

-- The job asks: active subscriptions ending within the window whose
-- reminded_for is null or stale. end_date leads because it is the selective
-- condition; status is an equality beside it.
create index if not exists subscriptions_reminder_idx
  on public.subscriptions (end_date)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- When the scheduled work last ran
-- ---------------------------------------------------------------------------

create table if not exists public.cron_runs (
  -- One row per job, overwritten. A history of every run would be a table
  -- that grows for ever to answer a question only ever asked about the most
  -- recent row.
  job        text primary key,
  ran_at     timestamptz not null default now(),
  ok         boolean not null default true,
  -- One line a person can read: "3 reminders, 2 checkouts closed", or the
  -- provider's own error. Never a stack trace.
  detail     text
);

alter table public.cron_runs enable row level security;

-- No policy and no grant for anon or authenticated. The admin page reads this
-- through the service-role client like every other admin figure, so a browser
-- never needs to touch it — and a browser that could write it could make a
-- job that has stopped look like one that is running, which is the single
-- most misleading thing this table could be made to say.
grant select, insert, update on public.cron_runs to service_role;
