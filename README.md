# Tools.cm

**Vos fichiers. Votre appareil. Votre vie privée.**

PDF and image tools that run entirely in the browser. Built for people on
mid-range Android phones and limited connections — Cameroon first, then the
rest of the world.

This repository is **Phase 1 + Phase 2** of the product plan: the brand, the
design system, the tool engine, and twenty tools that genuinely work. Accounts,
usage limits, payments and the admin dashboard (Phase 3) and the blog and
analytics (Phase 4) are not built yet, and nothing in the interface pretends
they are.

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

- **No file is ever uploaded.** There is no upload endpoint. The app has no
  server-side file handling at all — you can verify this by looking for an
  `app/api` directory, which does not exist.
- **One third-party request, disclosed.** The two background tools download a
  ~40 MB segmentation model from `staticimgly.com` on first use. The model
  comes to the device; the photo never leaves it. This is stated on the tool
  page itself, in the FAQ, and in the privacy policy. Set
  `NEXT_PUBLIC_IMGLY_PUBLIC_PATH` to self-host the model and remove even that.
- **Everything else is served from our own origin** — pdf.js, its CMaps and
  fonts, and the image-compression worker are copied into `public/` rather than
  loaded from a CDN.
- **The only thing stored in the browser** is the chosen language, under
  `toolscm.locale`.

---

## Architecture

```
src/
  app/                    routes: /, /tool/[id], /pricing, /contact, legal, sitemap, robots, manifest
  components/
    tools/                one component per tool — the actual processing lives here
    ToolWorkbench.tsx     shared state machine: select → validate → run → result
    ToolRunner.tsx        id → dynamically-imported tool component
    ...                   Header, Footer, UploadZone, ResultCard, CropSurface, …
  lib/
    tools/catalog/        the tool registry (pure data: metadata, SEO copy, FAQ)
    tools/                pdf-utils, canvas, segmentation helpers
    i18n/                 locale store + dictionaries
  locales/                fr.json, en.json
  types/tool.ts           the tool contract
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

## Not built yet (Phase 3 and 4)

Deliberately absent, so that nothing claims to work when it does not:

- Accounts and Supabase (schema, RLS, profiles, subscriptions, payments,
  usage logs, admin settings)
- The 3-a-day free limit, and the paywall modal
- NotchPay and Stripe behind a provider abstraction, with signature-verified,
  idempotent webhooks
- The admin dashboard at `/admin`
- Blog, analytics events, AdSense

The pricing page says all of this in plain language today: payments are not
live, and the daily limit is not enforced yet. `.env.example` already lists
every variable these will need, and `AdSlot` renders nothing at all until
`NEXT_PUBLIC_ADSENSE_CLIENT` is set — no empty placeholder boxes.

---

## Licence

Private. © 2026 Tools.cm
