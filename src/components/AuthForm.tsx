"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeNext, signInHref } from "@/lib/auth/access";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { browserClient } from "@/lib/supabase/browser";
import { Button, Notice, SectionHeading } from "./ui";
import { Breadcrumbs } from "./Breadcrumbs";

type Mode = "signin" | "signup";

/**
 * Where to go once signed in: the `next` the visitor arrived with (a tool
 * they tried to use, the pricing page), or their account.
 *
 * Read from the address bar at the moment it is needed rather than through
 * useSearchParams, which would force this statically rendered page into a
 * Suspense boundary for one value only an event handler reads. Always passed
 * through safeNext: `next` is part of a URL anyone can craft.
 */
function nextPath(): string {
  if (typeof window === "undefined") return "/account";
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

/** The /auth/callback address that ends at `nextPath()`. */
function callbackUrl(): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const { t } = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const client = browserClient();

  const fieldClass =
    "w-full rounded-xl border border-line bg-white px-3 py-3 text-[15px] text-ink placeholder:text-ink-soft focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light";

  /** Map Supabase's English error strings onto our own translated messages. */
  const describe = (message: string): string => {
    const lower = message.toLowerCase();
    if (lower.includes("invalid login")) return t("auth.invalidCredentials");
    if (lower.includes("password")) return t("auth.weakPassword");
    if (lower.includes("already registered") || lower.includes("already exists")) {
      return t("auth.emailTaken");
    }
    return t("auth.unexpected");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client) return;

    setBusy(true);
    setError(null);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl() },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          // Email confirmation is switched off in Supabase, so the account is
          // usable at once. Telling this person to go and check their inbox
          // for a message that will never come would strand them — and now
          // that the tools need an account, strand them outside every tool.
          router.push(nextPath());
          router.refresh();
          return;
        }
        setSent(true);
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.push(nextPath());
        router.refresh();
      }
    } catch (caught) {
      setError(describe(caught instanceof Error ? caught.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    if (!client) return;
    setBusy(true);
    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) {
      setError(t("auth.unexpected"));
      setBusy(false);
    }
  };

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-md">
        <Breadcrumbs
          items={[{ label: mode === "signup" ? t("auth.signUp") : t("auth.signIn") }]}
        />

        <SectionHeading
          title={mode === "signup" ? t("auth.signUpTitle") : t("auth.signInTitle")}
          description={t("auth.signInSubtitle")}
        />

        {!client ? (
          <Notice tone="warn">{t("auth.notConfigured")}</Notice>
        ) : sent ? (
          <Notice tone="success">{t("auth.checkEmail")}</Notice>
        ) : (
          <>
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={withGoogle}
              disabled={busy}
            >
              <GoogleGlyph />
              {t("auth.continueGoogle")}
            </Button>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[12.5px] text-ink-soft">{t("auth.or")}</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[14.5px] font-medium text-ink">
                  {t("auth.email")}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={fieldClass}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-[14.5px] font-medium text-ink"
                >
                  {t("auth.password")}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={fieldClass}
                />
              </div>

              {error ? <Notice tone="danger">{error}</Notice> : null}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? t("auth.working") : mode === "signup" ? t("auth.signUp") : t("auth.signIn")}
              </Button>

              {/* Only on sign-in: someone creating an account has no password
                  to have forgotten, and the extra link is one more thing to
                  read on a small screen. */}
              {mode === "signin" ? (
                <p className="text-center text-[13.5px]">
                  <Link
                    href="/reset-password"
                    className="text-ink-soft underline underline-offset-2 hover:text-violet-deep"
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </p>
              ) : null}
            </form>

            <p className="mt-5 text-center text-[13.5px] text-ink-soft">
              {mode === "signup" ? t("auth.hasAccount") : t("auth.noAccount")}{" "}
              <Link
                href={mode === "signup" ? "/signin" : "/signup"}
                // Switching between the two forms keeps the way back to the
                // tool the visitor came from.
                onClick={(event) => {
                  event.preventDefault();
                  router.push(signInHref(nextPath(), mode === "signup" ? "signin" : "signup"));
                }}
                className="font-semibold text-violet-deep underline-offset-2 hover:underline"
              >
                {mode === "signup" ? t("auth.signIn") : t("auth.signUp")}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}
