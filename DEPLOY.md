# Putting Tools.cm online

Written in plain steps. You need two free accounts: **GitHub** (stores the
code) and **Vercel** (runs the website). Both are free for this.

Total time: about 30 minutes, most of it waiting.

---

## 1 — Open the folder in VS Code

Unzip `toolscm.zip`, then in VS Code: **File → Open Folder** → choose the
`toolscm` folder.

Open a terminal inside VS Code (**Terminal → New Terminal**) and run:

```bash
npm install
npm run assets
npm run dev
```

Open http://localhost:3000 — the site should appear. Press `Ctrl + C` in the
terminal to stop it.

If `npm` is not recognised, install Node.js from nodejs.org first, then close
and reopen VS Code.

---

## 2 — Send the code to GitHub

Create an empty repository at https://github.com/new. Name it `toolscm`. Do
**not** tick "Add a README" — the code already has one.

GitHub then shows you a page with commands. Ignore it and use these instead,
in the VS Code terminal, replacing `YOUR-USERNAME`:

```bash
git remote add origin https://github.com/YOUR-USERNAME/toolscm.git
git branch -M main
git push -u origin main
```

The code already has its full history committed, which is why there is no
`git init` or `git commit` here.

GitHub will ask you to sign in. If it asks for a password, it wants a
**personal access token**, not your account password — GitHub's own prompt
walks you through making one.

**Nothing secret is in this repository.** `.env.local` is excluded on purpose,
which is why the keys are entered in Vercel instead of committed.

---

## 3 — Deploy on Vercel

1. Go to https://vercel.com and sign in **with GitHub** — it connects the two.
2. **Add New → Project** → find `toolscm` → **Import**.
3. Leave every build setting exactly as detected. Next.js is recognised
   automatically.
4. **Before clicking Deploy**, open **Environment Variables** and add the
   values in the table below.
5. Click **Deploy** and wait about two minutes.

You get an address like `toolscm.vercel.app`. That is a real, working website.

### Environment variables

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hnmyekfjmqkscloyucas.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_LAqCU5FgKwOn_e9tJ-stNg_o0HsoTd6` |
| `SUPABASE_SERVICE_ROLE_KEY` | the **secret** key from Supabase → Settings → API Keys |
| `USAGE_HASH_SALT` | any long random text you invent. Never change it later. |
| `ADMIN_EMAIL` | `legendfotso@gmail.com` |

The first two are public by design — they are already inside the JavaScript
your visitors download. The third is a real secret: it bypasses every security
rule in the database. Never put it in a file that reaches GitHub, and never
paste it into a chat.

**Do not create a variable and leave the box empty.** Either give it a value or
do not add it at all. An empty setting used to fail the build with a confusing
"Invalid URL" error; the code now falls back sensibly instead, but a blank box
still means "I meant to fill this in and forgot".

---

## 4 — Tell Supabase where the site lives

Supabase refuses to send people back to an address it does not know, so
sign-in will fail until this is done.

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your Vercel address, e.g. `https://toolscm.vercel.app`
- **Redirect URLs**: add `https://toolscm.vercel.app/**`

---

## 5 — Become the administrator

1. Open your live site and **sign up** with `legendfotso@gmail.com`.
2. Open `https://your-site/admin`. It should open.
3. Go back to Vercel and **delete the `ADMIN_EMAIL` variable**, then redeploy.

You stay an administrator. The shortcut closes behind you.

If `/admin` shows "page not found", you are signed in with a different email —
that page deliberately reveals nothing to non-administrators.

---

## 6 — Take your first payment

Set these in Vercel so the payment instructions appear on the site:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_MTN_NUMBER` | `+237 652 11 64 11` |
| `NEXT_PUBLIC_MTN_NAME` | `Gakam Sylvie` |
| `NEXT_PUBLIC_ORANGE_NUMBER` | `+237 699 74 49 70` |
| `NEXT_PUBLIC_ORANGE_NAME` | `Epse Simo Gakam Sylvie` |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | `237652116411` |

These already have the same defaults in the code, so the site works without
them — set them only if you want to change a number without touching the code.

Then test the whole loop yourself, with a second account and real money:

1. Sign up with a different email.
2. Send 2,000 FCFA to your own MTN number from another phone.
3. In `/admin`, enter that email, the transaction id from the SMS, and the
   sender's WhatsApp number. Press **Activate Pro**.
4. A receipt appears. Send it on WhatsApp.
5. Sign in as that second account and check `/account` shows Pro.

**Do this before telling anyone about the site.** If something is wrong, you
want to be the one who finds it.

---

## 7 — Only now, switch the limit on

In `/admin`, turn on **Enforce the daily limit**.

Until you do, every tool is unlimited for everybody and nobody has a reason to
pay. After you do, free users get 3 operations a day.

Do not rush this. A site nobody uses yet does not need a limit — it needs
visitors.

---

## Later, when you have a domain

1. Buy the domain (roughly 10,000–15,000 FCFA a year).
2. In Vercel: **Settings → Domains → Add**, then follow their instructions.
3. Set `NEXT_PUBLIC_SITE_URL` to the new address so Google, sitemap.xml and
   robots.txt point at the right place.
4. Update the two Supabase URLs from step 4.
5. Finish Google publishing: Google Cloud → **Branding**, fill in
   home page `https://your-domain/`, privacy `https://your-domain/privacy`,
   terms `https://your-domain/terms`. Then **Audience → Publier
   l'application**. Google sign-in then works for everyone, not only test
   users.

---

## If something breaks

- **Build fails on Vercel** — open the build log and read the first red line.
  It is almost always a missing environment variable.
- **Sign-in loops back to the home page** — step 4 is missing or the address
  has a typo.
- **`/admin` says page not found** — wrong email, or `ADMIN_EMAIL` was removed
  before you first signed in.
- **A tool is slow on a phone** — that is real. Processing happens on the
  device, and a 200-page PDF is genuinely hard work for a cheap phone.
