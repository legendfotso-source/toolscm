# Tools.cm — production audit and upgrade report

21 September 2026. Written against the code in this repository, in the same
commit as this file.

The brief was: audit first, change only what needs changing, keep every
working feature, and report honestly at the end. This is that report. Where
something has not been verified, it says so.

This report was itself reviewed before being sent. That review found two real
pricing bugs, two features the first draft described that were missing from
the code, and several sentences that claimed more than had been checked. All of
them are fixed, and section 3 lists them rather than hiding them.

---

## 1 — What was already working

I read the codebase before changing it. Most of the 48-point brief was already
built. The honest summary is that this work added a plan, not a product.

**The tools: 26 of them, all real.**

| Category | Tools | Status |
| --- | --- | --- |
| PDF | 12 | all available |
| Image | 9 | 7 available, 2 in beta |
| Utility | 5 | all available |

22 of them take a file, and all 22 process it in the browser. The file is
never uploaded, which is why the privacy page can say so. The other 4 (QR code
generator, age calculator, word counter, case converter) take no file at all.
The two background tools (remove and blur) download an AI model from a
third-party server the first time they are used; your photo stays on your
device, and the tool page and the privacy policy both say so.

`tests/run-tool-tests.mjs` checks this with a real browser: it uploads real
files to the tools and opens what comes back.

**Already in place:**

- **French and English, complete.** 270 strings in each language after this
  work, none missing on either side (checked again today).
- **SEO.** A title, description and keywords for every tool, a generated
  `sitemap.xml` and `robots.txt`, and four written guides that link to live
  tools.
- **Mobile.** Tool pages render at 320 px wide without sideways scrolling, and
  tap targets are at least 44 px. Both are checked by tests in a real browser.
- **Accounts.** Email/password and Google, through Supabase.
- **Row level security.** This includes a `security definer` hole that was
  found by probing the live database with only the public key, and closed in
  commit `fc0f22a`. Thirty-one database guarantees are verified against real
  PostgreSQL.
- **A daily limit enforced by the server**, using salted fingerprints, so the
  browser cannot grant itself more.
- **An admin dashboard at `/admin`**: visitor counts, accounts, prices, and two
  switches (`limits_enabled`, `payments_enabled`) that are both **off** by
  default.
- **Three payment providers in the code**: CamPay, NotchPay and Stripe. Their
  webhooks are signature-verified where the provider offers signatures, and a
  unique index on `(provider, transaction_id)` stops a payment being counted
  twice.
- **Manual Mobile Money.** The customer sends money to an MTN or Orange number,
  you activate the plan in `/admin` against the transaction id, and a receipt
  is produced to send on WhatsApp. This works in the tests. It has never been
  used online or with real money (see section 7).

**None of this was rebuilt, and no working feature was removed.**

---

## 2 — What I changed

The site sold one paid plan. You asked for three.

**One table that every limit comes from:** `src/lib/payments/tiers.ts`. For
each of Free, Pro and Max it sets operations per day, files per batch, the file
size ceiling, and whether a batch can be downloaded as one ZIP. The comparison
table on the pricing page is **generated from this file**, so it cannot show a
number the code does not use.

**The plans you chose:**

| | Free | Pro | Max |
| --- | --- | --- | --- |
| Price (default) | 0 | 2,000 FCFA / month | 5,000 FCFA / month |
| Operations per day | 3 | unlimited | unlimited |
| Files per batch | 3 | 10 | 50 |
| File size | the tool's own limit | ×2 | ×4 |
| Download a batch as ZIP | no | yes | yes |

Free keeps batches of three, as you asked. Merge PDF is one of the most-used
tools on the site, and limiting it to one file in order to sell it back would
take something away from the plan most people use.

**Where each limit is enforced, stated plainly:**

- The **daily allowance** is decided by the server, and the browser cannot
  override it.
- The **batch and file-size limits** apply in the browser. The files never
  reach the server (that is the privacy promise), so the server has nothing to
  count. Someone who edits the page's JavaScript can get round these limits on
  their own device. They are product limits, not security barriers, and
  nothing that costs you money depends on them. The pricing page now says this
  under the comparison table.

**One price, everywhere.** Both paid prices come from the single `price_xaf`
setting in `/admin` (and `price_usd` for cards). Max is calculated from it
(×2.5, rounded to the nearest 500 FCFA; card prices to the nearest 50 cents).
It is never typed in a second place. A single function, `plansForTier()`,
turns the settings into prices, built on the same rounding rule
(`tierPriceXaf()`), and **every place a price appears uses them**: the pricing
cards, the checkout buttons, the Mobile Money instructions, the paywall inside
a tool, the account page, `/admin`, and the checkout API that actually
charges. What a customer reads is, by construction, what they are charged.
Pro's price is never rounded: if you type 2,250, the site shows 2,250.

**The plan travels the whole way**: checkout → provider → webhook → payment →
subscription → what the site shows. Two rules are enforced and tested. An
upgrade in the middle of a term **raises** the plan on the same subscription.
A cheaper renewal **never demotes** someone who has already paid for Max until
a date that has not arrived yet.

**ZIP download without a new dependency:** `src/lib/tools/zip.ts`. JSZip would
add about 100 KB (gzipped) that every visitor downloads, including the ones who
never pay, on a site whose main promise is loading fast on a cheap Android
phone. The archive is written directly, uncompressed, because PDFs and JPEGs
are already compressed and compressing them again saves under 2%. The code
protects against Zip Slip, renames duplicate filenames instead of losing one,
and refuses to write a corrupt archive past 4 GB.

**Pro or Max everywhere a plan is bought or shown:**

- the checkout lets the customer choose Pro or Max;
- the Mobile Money instructions let them choose too, and the pre-filled
  WhatsApp message names the plan, so you know what to activate;
- `/admin` has a Pro/Max selector, and the amount follows it;
- the receipt says which plan was bought;
- `/account` shows the plan name and what it includes.

**Also:** `supabase/migrations/0002_tiers.sql`, 28 new strings in each
language (and the two that held Pro's price as fixed text removed), and
DEPLOY.md and README updated.

---

## 3 — What was fixed

**Found while reviewing this report:**

1. **Choosing Max at checkout showed Pro's prices.** The server would have
   charged Max's. Payments are switched off, so nobody was affected, but this
   is exactly the "fake price" the brief forbids. Fixed: the buttons now follow
   the chosen plan.
2. **The Max card said $12, but a card would have been charged $12.50.** The
   card prices were text typed into the translation files, so they also stopped
   matching whenever the price in `/admin` changed. Fixed: every displayed price
   is calculated, and a test fails if a price is ever typed into a translation
   file again.
3. **The `/admin` plan selector and the plan name on `/account` were missing.**
   The first draft of this report described both. They had been lost during
   testing, when a command meant to undo a deliberate test error also undid
   uncommitted work, and the draft was not checked against the code afterwards.
   Both are now built. Until then, **Max could not be activated from `/admin`
   at all**, while the Mobile Money instructions only mentioned Pro.
4. **"Commercial use permitted" appeared on the Max card.** I had written it.
   Your terms say nothing of the kind, and it implied that Free and Pro forbid
   commercial use. Removed.
5. **The pricing page said every limit is enforced by the server.** This was
   false (see section 2). Corrected.
6. **On a phone, the Max column of the comparison table was hidden** behind a
   sideways scroll that nothing pointed to. The table now fits a 320 px screen.
7. **Smaller display fixes:** "2 000 FCFA" wrapped over two lines on the
   cards; the "Recommended" badge was white text on pale violet and unreadable;
   `/account` still said "one file at a time" for Free.

**Found while building:**

8. **Paying customers could have been downgraded without anyone noticing.**
   Vercel redeploys as soon as you push, but `0002_tiers.sql` is run by hand
   afterwards. In between, the new code asked for a column that did not exist
   yet, and the failure path returned the **free** plan, with nothing in any
   log. Now the code notices and asks again without that column, and a test
   recreates that situation.
9. **The test database stand-in returned whole rows** whatever columns were
   requested, so it could not have caught bug 8. It now behaves like the real
   one. This showed that one of my own new tests had been passing for the
   wrong reason; it was rewritten.
10. **Invisible characters in source code.** The tool that wrote `zip.ts` turned
    the escape codes for "any control character" into three literal invisible
    bytes. That quietly narrowed "remove control characters" to "remove three
    specific ones". Rewritten.

---

## 4 — Which payment provider

**Written and tested in code: three. Live: none.** That is waiting on accounts,
not on code.

| Provider | Built | What it needs from you |
| --- | --- | --- |
| **CamPay** | yes | a Cameroonian merchant account. This is the one to use. |
| **NotchPay** | yes | an account and its webhook hash |
| **Stripe** | yes | an account (see below) |

**CamPay is the right choice for Cameroon.** It is Cameroonian, built for MTN
and Orange Money, and customers pay from the phone they already have. CamPay
does not publish a way to sign its webhooks, so here a webhook is treated
**as a hint, not proof**. It only triggers an authenticated check with CamPay's
own servers, and access is granted only if CamPay confirms `SUCCESSFUL`. A
forged notification achieves nothing. `CAMPAY_ENVIRONMENT` defaults to the
**sandbox**, so a mistyped setting runs a test payment instead of taking real
money.

NotchPay webhooks are signature-verified. Stripe webhooks are verified with the
`whsec_` secret.

**Stripe: not verified.** I could not open Stripe's list of supported countries
from this machine, and I have not confirmed whether a business registered in
Cameroon can open a Stripe account. Check
[stripe.com/global](https://stripe.com/global) before relying on it. The
integration is ready if it is available to you, or if you ever bill through a
company registered elsewhere.

**Nothing takes money automatically yet.** Each provider does nothing without
its keys, **and** is blocked a second time by `payments_enabled` in `/admin`,
which is off. Until you switch it on, customers see the Mobile Money
instructions, and you activate their plan by hand in `/admin`. That creates a
real receipt, and entering the same transaction id twice cannot grant a second
month.

---

## 5 — Database changes

One migration: **`supabase/migrations/0002_tiers.sql`**.

- Creates the type `public.plan_tier` (`free`, `pro`, `max`).
- Adds `tier` to `public.subscriptions`: required, default `'pro'`.
- Adds `tier` to `public.payments`, so a refund or dispute can be traced to
  what was actually bought.
- Sets every existing subscription to `'pro'`, because every plan sold before
  this migration was a Pro plan.

It is safe to run more than once. No table was dropped and no security rule was
loosened.

**Run it immediately after deploying.** Until it has run, existing customers
stay Pro, but **no new payment of any kind can be recorded**, including one you
activate by hand. `/admin` shows an error in that case; it does not pretend to
succeed.

---

## 6 — Environment variables

**Required** for anything beyond the free tools:

| Name | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | the Supabase project address (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | **a real secret**: it bypasses every database rule. Put it in Vercel only. Never in GitHub, never in a chat, never behind `NEXT_PUBLIC_` |
| `USAGE_HASH_SALT` | any long random text you make up. Never change it afterwards |
| `ADMIN_EMAIL` | your email address, only until you have signed in once. Then delete it |

**Optional (the code has working defaults):** `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_MTN_NUMBER`, `NEXT_PUBLIC_MTN_NAME`,
`NEXT_PUBLIC_ORANGE_NUMBER`, `NEXT_PUBLIC_ORANGE_NAME`,
`NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_ADSENSE_CLIENT`.

**Only when a provider goes live:** `CAMPAY_USERNAME`, `CAMPAY_PASSWORD`,
`CAMPAY_ENVIRONMENT`; `NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY`,
`NOTCHPAY_WEBHOOK_HASH`; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

Prices are **not** environment variables. They live in `/admin`.

---

## 7 — What depends on something outside the code

None of this is unfinished code. Each item needs an identity, an account or a
decision that only you can provide.

1. **A CamPay merchant account.** The integration cannot be tested against a
   live account from here. The application is yours to submit.
2. **A NotchPay account**, if you want a second provider.
3. **Stripe**, depending on the check in section 4.
4. **The live site has not been checked.** The network this work was done on
   blocks `toolscm.vercel.app`, so I could not load a single page of your
   deployment. Everything in this report was checked against the code and the
   tests. **Nothing** in it describes what is currently running online.
5. **Google sign-in for everyone.** Until the Google Cloud consent screen is
   published, only test users can sign in with Google. Email/password is not
   affected.
6. **AdSense.** No ad code appears at all while `NEXT_PUBLIC_ADSENSE_CLIENT` is
   empty. Approval is Google's decision.
7. **The `tools.cm` domain** is held by someone else. The site runs fine on the
   Vercel address.
8. **A first real payment.** The payment code has run against a test database
   and against real PostgreSQL, but never with real money. Make one payment
   yourself, from a second account, before telling anyone about the site.
9. **Two sentences of marketing copy still contain a fixed price**: the home
   page's "Pro à 2 000 FCFA/mois" and the pricing page's search-engine
   description. Everything else follows `/admin`. If you change the price,
   update those two by hand (DEPLOY.md, "If something breaks", says where).

---

## 8 — How to deploy this version

`DEPLOY.md` has every step in detail. In short:

1. **Unzip it and check it runs:** `npm install`, then `npm run dev`, then open
   http://localhost:3000.
2. **Push to GitHub.** The history is already committed:
   `git remote add origin …`, `git branch -M main`, `git push -u origin main`.
   No secrets are in the repository; `.env.local` is excluded on purpose.
3. **Deploy on Vercel.** Import the repository and add the environment
   variables from section 6 **before** clicking Deploy.
4. **Run the migration right after the deploy.** In Supabase, open SQL Editor,
   paste `supabase/migrations/0002_tiers.sql`, and click Run. (On a brand-new
   project, run `0001_init.sql` first.)
5. **Tell Supabase the site's address**: Authentication → URL Configuration
   (Site URL and Redirect URLs).
6. **Become the administrator.** Sign up on the live site with the
   `ADMIN_EMAIL` address and open `/admin` to confirm it works. Then delete
   `ADMIN_EMAIL` in Vercel and redeploy.
7. **Make one real payment by hand**, from a second account, for Pro and then
   for Max. Check that `/account` shows the right plan and that the receipt
   names it.
8. **Only then** turn on **Enforce the daily limit** in `/admin`.

Leave `payments_enabled` off until you have a provider account and have seen
one sandbox payment go through.

---

## How this was checked

Every test suite was run against this version:

| Suite | Checks |
| --- | --- |
| `npm run test:config` | 19 |
| `npm run test:layout` | 18, including a real `unzip -t` on an archive the code wrote |
| `npm run test:money` | 27 |
| `npm run test:payments` | 45 |
| `npm run test:tools` | 48, in a real browser with real files |
| `npm run test:db` | 31 guarantees against real PostgreSQL |

That is **188 checks, all passing**, plus a clean type check, no lint errors,
a successful production build, and screenshots of the pricing page at 320 px
and 1280 px.

The new tests were checked by breaking the code on purpose: **21 deliberate
errors** (in plan pricing, the ZIP writer, the pre-migration fallback, and the
displayed-versus-charged price). The tests caught 20 on the first run. The
21st got through because of the test stand-in problem in section 3, item 9,
and is caught now.

**What the tests do not cover:** `/admin` and `/account` need a signed-in
session and a live database, so I have not seen their new plan selectors on
screen. They compile, type-check and use the same pricing function the tests
cover, but please look at them yourself in step 7 above.
