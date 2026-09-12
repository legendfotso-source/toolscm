# Tools.cm

**Vos fichiers. Votre appareil. Votre vie privée.**

PDF and image tools that run entirely in the browser. Built for people on
mid-range Android phones and limited connections — Cameroon first, then the
rest of the world.

Twenty tools that genuinely work, plus accounts, a server-enforced usage
limit, an admin dashboard, Mobile Money payments taken by hand, NotchPay and
Stripe integrations, receipts, renewal reminders, four guides and contentless
analytics.

**What is not proven:** no payment has yet been taken through NotchPay or
Stripe against a live account, and the two background-removal tools could not
be exercised in the build sandbox. Both are stated plainly below rather than
left to be discovered. Nothing in the interface pretends otherwise: the
payment providers stay switched off until someone turns them on deliberately.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No environment variables are needed. Every published tool works with no
configuration, because the processing happens on the visitor's device.

```bash
npm run build        # production build
npm start            # serve the production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test:tools   # drive every tool in a real browser (see Verification)
```

`npm run assets` (run automatically before `dev` and `build`) copies the pdf.js
runtime data and the image-compression worker into `public/`, so the app never
fetches them from a third-party CDN. Those copies are generated, not committed.

---

## Deploy to Vercel

1. Push this repository to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Accept the detected settings (Next.js, `npm run build`). No environment
   variables are required for a first deployment.
4. Deploy. You get a live URL in about two minutes.
5. Once you have a domain, set `NEXT_PUBLIC_SITE_URL` to it so `sitemap.xml`,
   `robots.txt` and the canonical tags point at the right place.

See `.env.example` for every variable, including the ones Phase 3 will need.

---

## What actually works

Twenty tools are published. Every one of them was driven end-to-end in a real
browser and the downloaded file was inspected — see **Verification** below.

### PDF

| Tool | What it does |
| --- | --- |
| Compresser un PDF | Lossless re-serialisation, or raster compression at 150/110/80 DPI |
| Fusionner des PDF | Concatenates any number of PDFs, with reordering |
| Diviser un PDF | Extracts a page range, or splits into one file per page |
| JPG en PDF | Multiple images into one PDF (A4/Letter/fit, orientation, margin) |
| PDF en JPG | Renders pages to JPG or PNG at 96/150/300 DPI |
| Pivoter un PDF | 90/180/270°, whole document or selected pages |
| Supprimer des pages | Removes the pages you name, keeps the rest |
| Extraire le texte | Pulls out the real text layer, as `.txt` |

### Images

| Tool | What it does |
| --- | --- |
| Supprimer l'arrière-plan *(bêta)* | On-device segmentation, transparent PNG or solid background |
| Flouter l'arrière-plan *(bêta)* | Same segmentation, sharp subject over a blurred copy |
| Compresser une image | Quality + maximum dimension, JPG/WebP output |
| Redimensionner | Exact pixels, or presets (Instagram, WhatsApp, profile, HD) |
| Recadrer | Drag-and-drop frame, free or fixed ratio |
| Photo d'identité | 4×4 cm, 35×45 mm, 2×2 in or custom, at 300 DPI |
| Ajouter un filigrane | Text, position, size, opacity, colour |
| JPG en PNG / PNG en JPG | Both directions, with background flattening |

### Utilities

QR code generator, QR code reader, age calculator, word counter, case
converter. All instant, none of them touch a file or a server.

### Deliberately not built

`PDF → Word`, `Word → PDF`, `Protéger un PDF` and `Déverrouiller un PDF` are
listed as **Bientôt disponible**. Their pages explain honestly why, are marked
`noindex`, and offer no upload zone. There is no fake processing anywhere in
this codebase.

---

## Privacy: what the claim actually means

The badge on every tool page is driven by the tool's declared
`processingMode`, not hard-coded, so it cannot drift away from the truth.

- **No file is ever uploaded.** There is no upload endpoint, and no server-side
  file handling anywhere. The API routes are `/api/usage` (a random device id
  and a tool name), `/api/events` (a tool id, an outcome, a duration and one of
  our own error keys — no free-form field exists, so a filename cannot pass
  through it even by mistake), `/api/checkout`, `/api/payments/verify`, the two
  webhook receivers, and the two admin routes. Not one of them accepts a file,
  a filename, or anything drawn from a file's contents. They are all short
  enough to read.
- **One third-party request, disclosed.** The two background tools download a
  ~40 MB segmentation model from `staticimgly.com` on first use. The model
  comes to the device; the photo never leaves it. This is stated on the tool
  page itself, in the FAQ, and in the privacy policy. Set
  `NEXT_PUBLIC_IMGLY_PUBLIC_PATH` to self-host the model and remove even that.
- **Everything else is served from our own origin** — pdf.js, its CMaps and
  fonts, and the image-compression worker are copied into `public/` rather than
  loaded from a CDN.
- **What is stored in the browser**: the chosen language (`toolscm.locale`),
  and — once a database is configured — a random device id (`toolscm.device`)
  used only to count free operations. Neither contains anything about you.

---

## Architecture

```
src/
  app/                    routes: /, /tool/[id], /blog, /pricing, /account, /admin,
                          /payment/return, /reset-password, api/*, legal, sitemap, robots
  components/
    tools/                one component per tool — the actual processing lives here
    ToolWorkbench.tsx     shared state machine: select → validate → run → result
    ToolRunner.tsx        id → dynamically-imported tool component
    ...                   Header, Footer, UploadZone, ResultCard, CropSurface, …
  lib/
    tools/catalog/        the tool registry (pure data: metadata, SEO copy, FAQ)
    tools/                pdf-utils, canvas, segmentation helpers
    i18n/                 locale store + dictionaries
    supabase/             config, browser / server / service-role clients
    usage/                device id, server-side counting, the useUsage hook
    payments/             plans, term arithmetic, receipts, reminders,
                          signature verification, the NotchPay and Stripe adapters
    blog/                 the guides, as structured data
    entitlement.ts        "is this caller Pro?", answered from the database
  locales/                fr.json, en.json
  types/tool.ts           the tool contract
  proxy.ts                refreshes the session cookie (Next 16's middleware)
supabase/migrations/      the schema, RLS policies and grants
```

**Adding a tool** is three steps: add a `ToolDefinition` to the right catalog
file, write a component that renders `<ToolWorkbench>` with an options
descriptor and a `run()` function, and register its id in `ToolRunner`. The
homepage, search, sitemap, footer, category pages and SEO metadata all pick it
up from the registry automatically.

### Decisions worth knowing about

- **pdf.js legacy build.** The modern build of pdf.js 6 uses JavaScript that
  Chrome 141 does not have yet, and throws on anything older. Our users are
  several Chrome versions behind. The legacy build is transpiled and
  polyfilled — for this audience that is the difference between working and
  failing, not a nicety.
- **No web font.** A typeface is 30–100 KB and a render delay on every first
  visit. The system stack renders instantly and looks native on Android.
- **Everything heavy is dynamically imported.** A test asserts that no PDF
  library appears in the homepage bundle.
- **Real progress only.** The progress bar shows a percentage only where the
  underlying work reports one (pages rendered, bytes fetched). Everywhere else
  it is indeterminate. No invented "87%".
- **Honest results.** Sizes are measured on the bytes actually produced. When
  compression makes a file bigger — which happens with an already-optimised
  PDF — the interface says so and tells you to keep your original.

---

## Verification

`npm run test:tools` builds nothing itself; run `npm run build` first, then it
starts the production server, drives Chromium through every tool, downloads the
resulting files and inspects their bytes. A tool that quietly handed back its
input would fail.

At the last run: **38 / 38 checks passed**, including

- a scanned-style PDF compressed from **2.8 MB to 212 KB**, page count intact;
- a text PDF that *grows* when rasterised — asserting the interface reports the
  increase and explains it, rather than presenting it as a win;
- `merge` producing a 2-page document from two 1-page files;
- `split` producing five genuinely single-page PDFs;
- `rotate` writing a real 90° rotation into the page objects;
- `pdf-to-jpg` rendering 1240×1753 JPEGs at 150 DPI;
- extracted text containing the words that were really in the file;
- a 3.2 MB photo compressed to 320 KB;
- `resize` producing exactly 600×450, `crop` exactly 960×720, passport photo
  exactly 472×472 (4 cm at 300 DPI);
- a QR code generated and then decoded back to the identical string;
- corrupted, empty and wrong-type files each producing a readable French
  sentence with no library exception leaking through;
- no PDF library in the homepage bundle;
- no horizontal overflow at 320 px, and every control at least 44 px tall.

The Chromium in the build sandbox cannot reach `staticimgly.com`, so the two
background tools were verified for **disclosure and graceful failure** rather
than for a successful cut-out. **Test those two on a real device before
launch** — everything else has been exercised against real files.

`npm run screenshots` (`node tests/screenshots.mjs`) captures the main pages at
390 px and 1280 px for review.

---

## The business layer (Phase 3, partly built)

**Built and working:** the Supabase schema with row level security, accounts
(email/password and Google), the server-enforced daily limit, the paywall, and
the admin dashboard at `/admin`.

**Off by default, on purpose.** With no Supabase keys the site behaves exactly
as it does without a database: every tool free, no limits, no accounts. Adding
keys switches the layer on — and even then the daily limit stays off until you
set `limits_enabled` in `/admin`. Nothing starts turning people away by
accident.

### Setting it up

1. Create a Supabase project (free tier is enough).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor. It is written to
   be safely re-runnable, so running it twice does no harm.
3. Copy `.env.example` to `.env.local` and fill in the three Supabase values
   plus a random `USAGE_HASH_SALT`.
4. `npm run test:supabase` — proves the limit really limits and that the
   browser cannot reach the tables or the functions that decide it. It skips
   cleanly when no keys are present. The checks that matter most need only the
   *publishable* key, so you can run them without handling the secret one.
5. To make yourself an admin:
   `update public.profiles set is_admin = true where email = 'you@example.com';`

### A hole this found

The migration originally ended with `revoke execute on function … from anon,
authenticated` and looked locked down. It was not, and probing the live
database with nothing but the public key proved it: every function answered
`200` to an anonymous caller.

PostgreSQL grants `EXECUTE` to the `PUBLIC` pseudo-role on every new function.
`anon` inherits from `PUBLIC`, so revoking from it *by name* removes a
privilege it never held directly and leaves the inherited one in place. Because
these functions are `security definer` they ignore table grants and row level
security — so a visitor could write `usage_logs` through `consume_operation`
even though `usage_logs` itself was unreachable, burning someone else's
allowance or handing themselves an unlimited one.

The migration now revokes from `PUBLIC`, where the privilege actually lives,
grants it back to `service_role` alone, and sets default privileges so a later
function cannot reintroduce it. Four checks in `test:supabase` assert it,
because the lesson is that a revoke you did not test is a revoke you did not
make.

### Taking money today, without a payment provider

NotchPay and Stripe are not integrated, and pretending otherwise would be the
one thing this project refuses to do. What *is* built is the flow that actually
works in Cameroon right now.

**The customer** sees both operators on the pricing page and in the paywall:

| Operator | Number | Name |
| --- | --- | --- |
| MTN | +237 652 11 64 11 | Gakam Sylvie |
| Orange | +237 699 74 49 70 | Epse Simo Gakam Sylvie |

Both are shown deliberately. Someone on Orange sending to an MTN number pays a
cross-network transfer fee on top of the 2,000 FCFA, and enough of them will
abandon the payment rather than pay it. One tap opens WhatsApp with a
part-filled message asking for the operator, the transaction id and their
account email.

**You** open `/admin`, enter their email, the transaction id from the SMS and
their WhatsApp number, and press Activate. Pro is granted, a real `payment` row
is recorded so the revenue figure counts it, and a **receipt** appears with a
one-tap *Send on WhatsApp* button:

```
*Tools.cm — Reçu de paiement*

Référence : TCM-FA8W-4QG8
Compte : client@example.com
Montant : 2 000 XAF
Payé le : 12 septembre 2026 à 10:30
Durée : 30 jours
Pro actif jusqu'au : 12 octobre 2026

Votre accès Pro est activé. Merci d'utiliser Tools.cm 🙏
Conservez cette référence : elle nous permet de retrouver votre paiement.
```

The receipt is not decoration. Someone who has just sent money to a personal
phone number has no proof of anything until you give them some, and one message
with a reference and an end date is the difference between a customer who
renews and one who quietly decides the whole thing felt dodgy. The same
receipts appear on the customer's own `/account` page, so they can find them at
2am without messaging anyone.

Details that matter, all covered by `npm run test:payments`:

- The reference is derived from the payment's own id, so re-issuing a receipt
  gives the **same** reference. It uses Crockford base32 — no I, L, O or U —
  because these get read aloud over the phone and copied off cracked screens.
- Times are shown in **Africa/Douala**, not UTC. A payment at 23:30 UTC would
  otherwise be stamped with yesterday's date on the one document meant to
  reassure the customer.
- `652116411`, `652 11 64 11`, `+237652116411` and `00237652116411` all produce
  the same WhatsApp link. Get this wrong and the thank-you silently goes
  nowhere.
- Entering the same transaction id twice grants nothing extra — the unique
  index on `(provider, transaction_id)` sees to that — and still returns the
  *original* receipt, so a customer asking for it again gets the same reference.
- Renewing early **extends** the term instead of restarting it. Paying on the
  20th while covered until the 30th must give until the 30th of next month.

This is slower than an API and completely honest: nothing is granted until the
money has arrived. When a provider is wired up later it calls the same
`grantPro` with a different `provider` value, and the idempotency guarantee is
already in place.

### Payment providers

NotchPay and Stripe are integrated and **not yet exercised against a live
account** — that is the one remaining unknown, and it is stated here rather
than discovered later. Both are inert without keys and gated a second time by
`payments_enabled` in `/admin`, so nothing switches on by accident.

The rule throughout is that the browser never says whether a payment
succeeded:

- `/api/checkout` takes the customer from the session cookie and the price from
  settings. The browser chooses only the provider and the plan length.
- The reference is generated server-side and stored as a `pending` payment
  **before** the customer leaves, which is what lets a webhook arriving minutes
  later be matched to an account without trusting the return URL.
- Both webhook handlers verify the signature against the **raw** body, then
  call the provider back and ask what the status really is. A leaked signing
  key is still not enough to grant anything.
- `/payment/return` sends a reference, never a verdict. `?status=success` is
  something anyone can type and is never read.

Idempotency is a conditional update on `status = 'pending'`. Two webhooks
racing, or a webhook racing the customer's return, both attempt it; exactly one
matches a row and the other stops.

Thirteen checks in `npm run test:payments` cover the signature verification,
including the two mistakes that would matter most: signing Stripe's body
without the timestamp prefix, and failing **open** when no secret is set.

### Guides, and why they exist

`/blog` is not decoration. The binding constraint on this project is traffic,
not features — a tool nobody finds earns nothing. Each guide is written to be
the page that actually answers a real search ("réduire taille pdf", "photo 4x4
identité"), in French, for someone on a phone with an immediate problem, and
each one ends at a tool that does the thing.

A test walks every guide, checks it renders without overflow at 320px, and
follows every tool link to make sure it reaches a tool that is actually built —
a guide pointing at a "coming soon" page wastes the visit that SEO paid for.

### Knowing what people use

`/api/events` records a tool id, an outcome, a duration and one of our own
error keys. There is no free-form field, so a filename cannot be sent through
it even by mistake. It is fire-and-forget over `sendBeacon`, and silent
failure — a visitor's tool must never break, or even slow down, because an
analytics row could not be written.

This matters because the usage counters only fill up once the daily limit is
switched on, and the whole point of leaving it off at the start is to learn
what people want before charging for it. `/admin` shows runs, failures and the
**median** duration per tool — a mean would be dragged out of shape by one
large file on one slow phone.

### How the limit is enforced

The browser never decides anything. Before a tool runs it calls `/api/usage`,
which reads the session cookie, asks the database, and answers. There is no
`isPro` flag in any request for anyone to edit in dev tools.

Two counters run, for different reasons. A random device id in local storage
carries the real limit. A **salted hash** of IP and user agent carries a much
looser ceiling as anti-abuse — deliberately loose, because mobile networks in
Cameroon share IP addresses between very many people and a tight per-network
limit would turn away innocent users. Raw IP addresses are never stored.

Clearing local storage resets the device counter, and we know it. The free
limit is a speed bump, not a wall, and the product is not designed to depend on
it being unbeatable.

## What is built but unproven

Written, reviewed and unit-tested, but never exercised against the real thing.
This is the honest list, not a disclaimer:

- **No payment has been taken through NotchPay or Stripe.** The signature
  verification, idempotency and settlement logic are tested; the HTTP calls to
  the providers are written from their published APIs and have never received
  a real response. Take one test payment before switching `payments_enabled`
  on. The Mobile Money flow taken by hand *is* proven end to end, because it
  involves no API at all.
- **The two background-removal tools were never run.** The build sandbox
  cannot reach `staticimgly.com`, where the ~40 MB model lives. Every other
  tool was driven in a real browser and its output bytes inspected. Test these
  two on an actual phone before launch.
- **Google sign-in needs OAuth credentials** in the Supabase dashboard.
  Email and password work today.

## Still not built

- Email beyond what Supabase Auth sends: no expiry notice by email, no
  receipts by email. Reminders and receipts go out over WhatsApp, by hand.
- AdSense. `AdSlot` renders nothing at all until `NEXT_PUBLIC_ADSENSE_CLIENT`
  is set — no empty placeholder boxes, ever.
- Automatic recurring billing. Every renewal is a fresh payment, which is
  simply how Mobile Money works here.

---

## Licence

Private. © 2026 Tools.cm
