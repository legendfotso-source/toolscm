-- Tools.cm — plan tiers
--
-- Until now a subscription was binary: you had one or you did not, and having
-- one meant Pro. Max needs a third answer, so the row has to say WHICH plan
-- was bought rather than only that something was.
--
-- Safe to run more than once, and safe to run on a database with live
-- subscriptions in it: every existing paid row is backfilled to 'pro', because
-- every subscription sold before this migration was a Pro subscription and
-- reading them as anything else would take away something people paid for.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type public.plan_tier as enum ('free', 'pro', 'max');
  end if;
end $$;

alter table public.subscriptions
  add column if not exists tier public.plan_tier not null default 'pro';

-- Belt and braces: the default above only covers rows written from now on.
update public.subscriptions set tier = 'pro' where tier is null;

comment on column public.subscriptions.tier is
  'Which plan this subscription buys. Read by getEntitlement(); never sent by a browser.';

-- The payments table records what was bought, so a refund or a dispute can be
-- traced to a tier without joining through a subscription that may since have
-- been extended to a different one.
alter table public.payments
  add column if not exists tier public.plan_tier;

comment on column public.payments.tier is
  'The tier this payment was for, as it was at the time of payment.';
