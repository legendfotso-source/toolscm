# Tools.cm — production audit and upgrade report

21 September 2026. Written against the code in this repository at commit
`95cd322`, after the changes described in section 2.

The instruction was: audit first, change only what needs changing, keep every
working feature, and report honestly at the end. What follows is that report.
Where something is unverified, it says so rather than sounding finished.

---

## 1 — What was already working

I read the codebase before touching it. Most of the 48-point brief was already
built, and the honest answer is that this turn added a plan, not a product.

**The tools — 26 of them, all real.**

| Category | Tools | Status |
| --- | --- | --- |
| PDF | 12 | all available |
| Image | 9 | 7 available, 2 beta |
| Utility | 5 | all available |

Every one processes the file in the browser. That is not a claim written on a
page — it is why the privacy page can say the file never leaves the device, and
it is checked by `tests/run-tool-tests.mjs`, which drives a real browser,
uploads a real file to each tool and opens what comes back out.

**The things a tool site needs, already present:**

- **French and English**, complete: 276 strings in each file, zero missing on
  either side. Verified again today.
- **SEO**: per-tool titles, descriptions and keywords, a generated
  `sitemap.xml` and `robots.txt`, and four written guides that link to live
  tools.
- **Mobile**: tool pages render at 320 px with no sideways scrolling and tap
  targets of at least 44 px — both asserted in the test suite against a real
  browser, not eyeballed.
- **Accounts**: email/password and Google, through Supabase.
- **Row level security**, including a `security definer` hole that was found by
  probing the live database with nothing but the public key and closed in
  commit `fc0f22a`. Thirty-one database guarantees are verified against real
  PostgreSQL by `tests/run-db-tests.mjs`.
- **A server-enforced daily limit** with salted fingerprints, so the browser
  cannot grant itself more.
- **An admin dashboard** at `/admin`: visitor counts, accounts, prices, and the
  two switches (`limits_enabled`, `payments_enabled`) that both default to
  **off**.
- **Payments, three providers written**: CamPay, NotchPay and Stripe, with
  signature-verified webhooks where the provider offers signatures, and
  idempotency resting on a unique index on `(provider, transaction_id)`.
- **Manual Mobile Money**: the customer sends money to an MTN or Orange number,
  you activate the plan in `/admin` against the transaction id, and a receipt
  is produced to send on WhatsApp. This path works end to end today.

**None of that was rebuilt.** No working feature was removed.

---

## 2 — What I changed

One theme: the site sold one paid plan, and you wanted three.

**A single table that every limit is read from** — `src/lib/payments/tiers.ts`.
Free, Pro, Max, and for each: operations a day, files in one batch, the file
size ceiling, and whether a batch can be downloaded as one ZIP. Nothing in that
table is decoration. The pricing page's comparison table is **generated from
it**, so the page cannot promise a number the code does not enforce — the one
failure mode that turns a price into a lie.

**The plan you chose, at the price you chose:**

| | Free | Pro | Max |
| --- | --- | --- | --- |
| Price | 0 | 2,000 FCFA / month | 5,000 FCFA / month |
| Operations a day | 3 | unlimited | unlimited |
| Files in one batch | 3 | 10 | 50 |
| File size | tool's own limit | ×2 | ×4 |
| Download a batch as ZIP | no | yes | yes |

Free keeps batches of three, as you asked. Merge-PDF is one of the most used
tools on the site and making it single-file to sell it back would have been
taking something away from the plan most people are on.

Both paid prices come from the **one** `price_xaf` setting in `/admin`: Max is
derived, not typed in a second place, so changing the Pro price moves both and
the gap between them stays where you put it. Prices round to the nearest 500
FCFA, because 4,833 is not a price anyone pays in cash.

**The tier now travels the whole way**: checkout → provider → webhook →
payment row → subscription row → entitlement → what the page shows you. Two
rules are enforced in code and tested: an upgrade mid-term **raises** the tier
and extends the same subscription, and a cheaper renewal **never demotes**
somebody who has already paid for Max until a date that has not arrived.

**Batch limits** are applied in the upload zone and again on the server that
counts operations. **File size ceilings** are multiplied per tier rather than
replaced, so a 25 MB ceiling that makes sense for a PDF merge and not for a
passport photo keeps its shape.

**ZIP download, with no new dependency** — `src/lib/tools/zip.ts`. JSZip would
have cost about 100 KB gzipped, downloaded by everyone including the people who
never pay, on a site whose whole promise is opening fast on a cheap Android
phone. The archive is written directly: local headers, central directory,
CRC-32, no compression — because PDFs and JPEGs are already compressed and
deflating them again saves under 2% for seconds of work on a slow phone. It
defends against Zip Slip, numbers duplicate filenames instead of losing one,
and refuses rather than writing a corrupt archive past 4 GB.

**Also changed:** a Pro/Max chooser at checkout, a tier selector in `/admin`
that moves the amount with it, the plan name on `/account`, 27 new strings in
both languages, `supabase/migrations/0002_tiers.sql`, and DEPLOY.md and README
updated with the migration step.

---

## 3 — What was fixed

**A pricing bug, before it could charge anyone.** The tier multiplier was
being applied *after* the quarterly and yearly discounts, which sold Max at
three months for the Pro price. Now the multiplier applies to the monthly price
first and the term discount applies to the result.

**A bug that would have quietly un-paid your customers.** Vercel redeploys the
moment you push; `0002_tiers.sql` is run by hand in Supabase afterwards. In
between, the new code asks the database for a column that does not exist yet —
and the failure path in `getEntitlement()` returned the **free** plan. Every
paying customer would have silently lost what they bought, for as long as the
gap lasted, with nothing in any log to say why. The code now asks again without
the column and reads the row as Pro, which is what it was sold as. There is a
test that puts the code in a pre-migration world and fails if anyone is
downgraded.

**A test harness that could not have caught it.** The in-memory Supabase
stand-in returned whole rows regardless of which columns were selected — so a
test could never tell a field that was never fetched from one that was there.
It now projects columns the way PostgREST does, and can reproduce a column the
database has not got. Adding that immediately exposed that one of my own new
tests had been passing for the wrong reason.

**Invisible characters in source.** The tool that wrote `zip.ts` turned the regular-expression escapes for
"any control character" into three literal invisible bytes, silently
narrowing "strip control characters" to "strip three specific ones".
Rewritten as real escapes.

---

## 4 — Which payment provider

**Written and tested in code: three. Live: none — and that is not a code
problem.**

| Provider | Built | What it needs from you |
| --- | --- | --- |
| **CamPay** | yes | a Cameroonian merchant account. This is the one to use. |
| **NotchPay** | yes | an account and the webhook hash |
| **Stripe** | yes | an account — see the caution below |

**CamPay is the right one for Cameroon**: Cameroonian, built for MTN and Orange
Money, and the customer pays from the phone they already have. Its integration
here treats the webhook as a **hint, not an authority** — CamPay publishes no
webhook signing scheme, so an incoming notification only triggers an
authenticated call back to CamPay's own status endpoint, and only `SUCCESSFUL`
*there* grants anything. Someone who forges a notification achieves nothing.
`CAMPAY_ENVIRONMENT` defaults to the **sandbox**, on purpose: a mistyped
variable should test a payment, not take somebody's real money.

NotchPay's webhook signature is verified. Stripe's is verified with the
`whsec_` secret.

**About Stripe, honestly:** I could not open Stripe's own country list from
this machine today, and every 2026 summary I could reach describes around 46
supported countries with no Central African country among them. Treat Stripe as
**not available to a Cameroon-registered business** until you have checked
[stripe.com/global](https://stripe.com/global) yourself. The code is there if
that ever changes, or if you one day bill through a company elsewhere.

**Nothing takes money automatically yet.** Every provider is inert without keys
*and* gated a second time behind `payments_enabled` in `/admin`, which is off.
Until you switch it on, what a customer sees is the Mobile Money instructions
and what happens is that you activate their plan by hand in `/admin` — which
works, produces a real receipt, and cannot double-grant a month if you enter
the same transaction id twice.

---

## 5 — Database changes

One migration: **`supabase/migrations/0002_tiers.sql`**.

- Creates the enum `public.plan_tier` (`free`, `pro`, `max`).
- Adds `tier` to `public.subscriptions`, **not null, default `'pro'`**.
- Adds `tier` to `public.payments`, so a refund or dispute can be traced to
  what was bought without joining through a subscription that may since have
  been extended to a different plan.
- Backfills every existing subscription to `'pro'`. Every plan sold before this
  migration was a Pro plan; reading those rows as anything else would take away
  something people paid for.

It is written to be safe to run twice. If you are not sure whether you ran it,
run it again.

Nothing else in the schema changed. No table was dropped, no policy loosened.

---

## 6 — Environment variables

**Required** for the site to do anything beyond free tools:

| Name | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL — public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key — public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | **a real secret.** Bypasses every database rule. Vercel only — never GitHub, never a chat message, never behind `NEXT_PUBLIC_` |
| `USAGE_HASH_SALT` | any long random text you invent. Never change it afterwards — every stored fingerprint is salted with it |
| `ADMIN_EMAIL` | your email, only until you have signed in once, then delete it |

**Optional, with working defaults in the code** — set them only to change a
value without touching the code: `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_MTN_NUMBER`, `NEXT_PUBLIC_MTN_NAME`,
`NEXT_PUBLIC_ORANGE_NUMBER`, `NEXT_PUBLIC_ORANGE_NAME`,
`NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_ADSENSE_CLIENT`.

**Only when a provider goes live:** `CAMPAY_USERNAME`, `CAMPAY_PASSWORD`,
`CAMPAY_ENVIRONMENT`; `NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY`,
`NOTCHPAY_WEBHOOK_HASH`; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

`.env.example` documents all of them with the same warnings.

---

## 7 — What is blocked on something outside this code

These are not unfinished work. They are things only you can do, because they
need an identity, a bank account or a company.

1. **A CamPay merchant account.** The integration is written and cannot be
   proved against a live account from here. Applying is yours.
2. **A NotchPay account**, if you want a second provider.
3. **Stripe**, subject to the caution in section 4.
4. **The live site is unverified from this machine.** The network here refuses
   outbound requests to `toolscm.vercel.app` — I could not load a single page
   of your deployment. Everything in this report is verified against the code
   and the test suites, and **nothing** in it is a statement about what is
   currently running online. Only you can check that.
5. **Google sign-in for everyone.** Until the Google Cloud consent screen is
   published, only test users can sign in with Google. Email/password is
   unaffected.
6. **AdSense.** No ad markup is rendered at all while `NEXT_PUBLIC_ADSENSE_CLIENT`
   is empty. Approval is Google's decision, not a code change.
7. **The `tools.cm` domain** is parked by someone else. The site runs fine on
   the Vercel address; buying the domain is a business decision, not a
   blocker.
8. **The first real payment.** The money path has been executed against an
   in-memory database and against real PostgreSQL, but never against real
   money. Take one 2,000 FCFA payment yourself, from a second account, before
   telling anyone about the site.

---

## 8 — How to deploy this version

`DEPLOY.md` has the long version with screenshots-worth of detail. Short form:

1. **Unzip and check it runs**: `npm install`, then `npm run dev`, then open
   http://localhost:3000.
2. **Push to GitHub.** The history is already committed, so it is
   `git remote add origin …`, `git branch -M main`, `git push -u origin main`.
   Nothing secret is in the repository — `.env.local` is excluded on purpose.
3. **Deploy on Vercel**, importing the repository and adding the environment
   variables from section 6 *before* pressing Deploy.
4. **Run the migration.** Supabase → SQL Editor → paste
   `supabase/migrations/0002_tiers.sql` → Run. (On a brand new project run
   `0001_init.sql` first.) Order does not matter much: deploy first and your
   existing customers stay Pro, but nobody can buy Max until this is run.
5. **Tell Supabase the site address** — Authentication → URL Configuration,
   Site URL and Redirect URLs.
6. **Become the administrator**: sign up on the live site with the address in
   `ADMIN_EMAIL`, open `/admin` to confirm, then delete `ADMIN_EMAIL` from
   Vercel and redeploy. You stay an admin; the shortcut closes behind you.
7. **Take one real payment by hand** with a second account, and check
   `/account` shows the plan.
8. **Only then** turn on **Enforce the daily limit** in `/admin`. A site nobody
   uses yet does not need a limit — it needs visitors.

Leave `payments_enabled` off until a provider account exists and you have seen
one sandbox payment settle.

---

## How this was checked

Every suite was run against this commit:

| Suite | Checks |
| --- | --- |
| `npm run test:config` | 19 |
| `npm run test:layout` | 18 (including a real `unzip -t` on an archive we wrote) |
| `npm run test:money` | 27 |
| `npm run test:payments` | 39 |
| `npm run test:tools` | 48 (a real browser, real files) |
| `npm run test:db` | 31 guarantees against real PostgreSQL |

**182 checks, all passing**, plus a clean `tsc --noEmit` and a successful
production build.

Passing tests are cheap to write, so the new ones were checked by breaking the
code on purpose — sixteen deliberate mutations this session (the tier maths,
the ZIP writer, the pre-migration fallback). Every one was caught by a test
that then named the actual problem. One mutation survived at first; the test
that let it through was the one rewritten in section 3.
