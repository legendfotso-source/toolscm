"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { browserClient } from "@/lib/supabase/browser";
import { Button, Card, Notice, SectionHeading } from "./ui";
import { Breadcrumbs } from "./Breadcrumbs";

/**
 * Forgotten passwords.
 *
 * The one support request that arrives whether or not you are ready for it,
 * and the one that cannot be answered by hand without asking someone to trust
 * you with their password. Supabase sends the email; this is the two screens
 * around it.
 *
 * `request` asks for the address. `set` runs after the emailed link has put a
 * recovery session in place, and sets the new password.
 *
 * The request screen answers identically whether or not the address exists.
 * Saying "no account with that email" would turn this form into a way to test
 * whether a given person has an account here.
 */
export function PasswordReset({ step }: { step: "request" | "set" }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const client = browserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(step !== "set");

  const fieldClass =
    "w-full rounded-xl border border-line bg-white px-3 py-3 text-[15px] text-ink placeholder:text-ink-soft focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light";

  // On the "set" screen, a recovery session has to exist before a new password
  // can be saved. Supabase establishes it from the link; if someone opens this
  // page directly there is nothing to update, and saying so beats a confusing
  // failure after they have typed a password.
  useEffect(() => {
    if (step !== "set" || !client) return;
    let cancelled = false;

    void (async () => {
      const { data } = await client.auth.getSession();
      if (!cancelled) setReady(Boolean(data.session));
    })();

    return () => {
      cancelled = true;
    };
  }, [step, client]);

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client) return;
    setBusy(true);
    setError(null);

    // The result is deliberately ignored: same answer either way.
    await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password/set`,
    });

    setSent(true);
    setBusy(false);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client) return;
    setBusy(true);
    setError(null);

    const { error: failed } = await client.auth.updateUser({ password });
    if (failed) {
      setError(
        /password/i.test(failed.message)
          ? fr
            ? "Le mot de passe doit comporter au moins 6 caractères."
            : "The password must be at least 6 characters."
          : fr
            ? "Le lien a peut-être expiré. Demandez-en un nouveau."
            : "The link may have expired. Ask for a new one.",
      );
      setBusy(false);
      return;
    }

    setDone(true);
    setBusy(false);
    setTimeout(() => {
      router.push("/account");
      router.refresh();
    }, 1200);
  };

  if (!client) {
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-md">
          <Notice tone="warn">
            {fr
              ? "Les comptes ne sont pas configurés sur ce déploiement."
              : "Accounts are not configured on this deployment."}
          </Notice>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-md">
        <Breadcrumbs
          items={[{ label: fr ? "Mot de passe oublié" : "Forgotten password" }]}
        />

        {step === "request" ? (
          <>
            <SectionHeading
              title={fr ? "Mot de passe oublié" : "Forgotten password"}
              description={
                fr
                  ? "Saisissez votre adresse e-mail. Si un compte existe, vous recevrez un lien pour choisir un nouveau mot de passe."
                  : "Enter your email address. If an account exists, you will get a link to choose a new password."
              }
            />

            {sent ? (
              <Card className="p-5">
                <Notice tone="success">
                  {fr
                    ? "Si un compte existe pour cette adresse, le lien est parti. Vérifiez aussi vos spams."
                    : "If an account exists for that address, the link is on its way. Check your spam folder too."}
                </Notice>
                <p className="mt-3 text-[13.5px] leading-6 text-ink-soft">
                  {fr
                    ? "Le lien est valable une heure et ne fonctionne qu'une fois."
                    : "The link lasts an hour and works once."}
                </p>
              </Card>
            ) : (
              <form onSubmit={request} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="mb-1.5 block text-[14px] font-medium text-ink">
                    {fr ? "Adresse e-mail" : "Email address"}
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={fieldClass}
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy
                    ? fr
                      ? "Envoi..."
                      : "Sending..."
                    : fr
                      ? "Envoyer le lien"
                      : "Send the link"}
                </Button>
              </form>
            )}

            <p className="mt-5 text-center text-[14px] text-ink-soft">
              <Link href="/signin" className="font-semibold text-violet-deep underline underline-offset-2">
                {fr ? "Retour à la connexion" : "Back to sign in"}
              </Link>
            </p>
          </>
        ) : (
          <>
            <SectionHeading
              title={fr ? "Nouveau mot de passe" : "New password"}
              description={
                fr
                  ? "Choisissez un mot de passe que vous n'utilisez nulle part ailleurs."
                  : "Choose a password you do not use anywhere else."
              }
            />

            {!ready ? (
              <Card className="p-5">
                <Notice tone="warn">
                  {fr
                    ? "Ce lien n'est plus valable. Demandez-en un nouveau."
                    : "This link is no longer valid. Ask for a new one."}
                </Notice>
                <Link
                  href="/reset-password"
                  className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-deep px-4 text-[15px] font-semibold text-white"
                >
                  {fr ? "Demander un nouveau lien" : "Ask for a new link"}
                </Link>
              </Card>
            ) : done ? (
              <Notice tone="success">
                {fr
                  ? "Mot de passe modifié. Redirection vers votre compte..."
                  : "Password changed. Taking you to your account..."}
              </Notice>
            ) : (
              <form onSubmit={save} className="space-y-4">
                {error ? <Notice tone="danger">{error}</Notice> : null}
                <div>
                  <label
                    htmlFor="new-password"
                    className="mb-1.5 block text-[14px] font-medium text-ink"
                  >
                    {fr ? "Nouveau mot de passe" : "New password"}
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={fieldClass}
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy
                    ? fr
                      ? "Enregistrement..."
                      : "Saving..."
                    : fr
                      ? "Enregistrer"
                      : "Save"}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
