"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ClaimStatus } from "@/lib/payments/claims";
import { useAuthUser } from "@/lib/useAuthUser";
import { MOMO_ACCOUNTS } from "@/lib/site";
import type { PaidTier, PlanId } from "@/lib/payments/plans";
import { Button, Notice, cx } from "./ui";

type OwnClaim = {
  id: string;
  status: ClaimStatus;
  transactionId: string;
  decisionNote: string | null;
  createdAt: string;
};

/**
 * "I have paid" — step 3, which used to be a WhatsApp message and a hope.
 *
 * The customer has sent the money. Everything after that was off the site:
 * find the WhatsApp number, write a message, hope it is read, wait without
 * ever seeing a state change. The ones who gave up looked exactly like the
 * ones who never paid.
 *
 * So the reference goes in here, on the page they are already on, and the
 * page afterwards says *waiting for confirmation* with the reference they
 * gave. That sentence is most of the value: it is the difference between
 * waiting and wondering whether you have been robbed.
 *
 * What this form does NOT ask for is the amount. The server prices the plan
 * itself. A field for it would be a field to lie in, and it would make the
 * admin check two numbers instead of one.
 */
export function PaymentClaim({ tier, plan = "monthly" }: { tier: PaidTier; plan?: PlanId }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { user, known } = useAuthUser();

  const [reference, setReference] = useState("");
  const [operator, setOperator] = useState<string>(MOMO_ACCOUNTS[0]?.operator ?? "MTN");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * `undefined` until the server has answered: not the same as `null`, which
   * means "asked, and there is no earlier request". Keeping them apart is what
   * stops the form appearing for a second to somebody whose payment is already
   * waiting — they would send it twice and be told off for a duplicate.
   */
  const [mine, setMine] = useState<OwnClaim | null | undefined>(undefined);

  // What has already been asked for, so somebody coming back to the page is
  // told where their request stands instead of being invited to send it again.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/payments/claim", { cache: "no-store" });
        const data = response.ok
          ? ((await response.json()) as { claims?: OwnClaim[] })
          : { claims: [] };
        if (!cancelled) setMine((data.claims ?? [])[0] ?? null);
      } catch {
        // Not worth a message: the form below still works.
        if (!cancelled) setMine(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Nothing flashes before Supabase has answered once.
  if (!known) return null;

  if (!user) {
    return (
      <Notice tone="info" className="mt-3">
        {fr ? "Connectez-vous pour déclarer un paiement : " : "Sign in to declare a payment: "}
        <Link href="/signin?next=/pricing" className="underline underline-offset-2">
          {fr ? "se connecter" : "sign in"}
        </Link>
        {fr
          ? ". C'est ce qui nous permet de rattacher le paiement à votre compte."
          : ". That is what lets us attach the payment to your account."}
      </Notice>
    );
  }

  // Signed in, but the earlier requests have not come back yet.
  if (mine === undefined) return null;

  if (mine?.status === "pending") {
    return (
      <Notice tone="info" className="mt-3" data-testid="claim-pending">
        <p className="font-semibold">
          {fr ? "Paiement en attente de confirmation" : "Payment waiting for confirmation"}
        </p>
        <p className="mt-0.5">
          {fr ? "Référence : " : "Reference: "}
          <span className="font-mono">{mine.transactionId}</span>
          {fr
            ? ". Nous vérifions sur le relevé Mobile Money, en général en moins de 24 heures. Vos opérations gratuites continuent en attendant."
            : ". We check it against the Mobile Money statement, usually within 24 hours. Your free operations carry on in the meantime."}
        </p>
      </Notice>
    );
  }

  if (mine?.status === "rejected") {
    return (
      <Notice tone="warn" className="mt-3" data-testid="claim-rejected">
        <p className="font-semibold">
          {fr ? "Dernière demande refusée" : "Last request refused"}
        </p>
        <p className="mt-0.5">
          {mine.decisionNote
            ? mine.decisionNote
            : fr
              ? "La référence n'a pas été retrouvée sur le relevé."
              : "The reference was not found on the statement."}
        </p>
        <p className="mt-1.5">
          {fr
            ? "Si c'est une erreur de saisie, écrivez-nous — une même référence ne peut être déclarée qu'une fois."
            : "If it was a typo, write to us — the same reference can only be declared once."}
        </p>
      </Notice>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier, plan, transactionId: reference, operator, phone }),
      });
      const data = (await response.json()) as { ok?: boolean; claim?: OwnClaim; error?: string };

      if (!response.ok || !data.ok) {
        setError(
          data.error === "duplicate_reference"
            ? fr
              ? "Cette référence a déjà été déclarée."
              : "That reference has already been declared."
            : data.error === "already_pending"
              ? fr
                ? "Vous avez déjà une demande en attente."
                : "You already have a request waiting."
              : data.error === "sign_in_required"
                ? fr
                  ? "Votre session a expiré. Reconnectez-vous."
                  : "Your session has expired. Sign in again."
                : fr
                  ? "L'envoi a échoué. Réessayez."
                  : "Sending failed. Try again.",
        );
        return;
      }
      setMine(data.claim ?? null);
    } catch {
      setError(fr ? "L'envoi a échoué. Réessayez." : "Sending failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "mt-1 w-full rounded-xl border border-violet-border bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-violet-deep";

  return (
    <div className="mt-3 rounded-xl border border-violet-border bg-white p-3.5">
      <p className="text-[14px] font-bold text-ink">
        {fr ? "J'ai payé — déclarer le paiement" : "I have paid — declare the payment"}
      </p>
      <p className="mt-0.5 text-[12.5px] leading-5 text-ink-soft">
        {fr
          ? "Recopiez l'identifiant de transaction du SMS de confirmation. Il sera vérifié sur le relevé avant activation."
          : "Copy the transaction id from your confirmation SMS. It is checked against the statement before anything is activated."}
      </p>

      <label className="mt-3 block text-[12.5px] font-semibold text-ink">
        {fr ? "Identifiant de transaction" : "Transaction id"}
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder={fr ? "ex. MP260930.1432.A12345" : "e.g. MP260930.1432.A12345"}
          className={cx(field, "font-mono")}
          data-testid="claim-reference"
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-[12.5px] font-semibold text-ink">
          {fr ? "Opérateur" : "Operator"}
          <select
            value={operator}
            onChange={(event) => setOperator(event.target.value)}
            className={field}
          >
            {[...new Set(MOMO_ACCOUNTS.map((account) => account.operator))].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[12.5px] font-semibold text-ink">
          {fr ? "Numéro utilisé" : "Number you sent from"}
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            placeholder="6 XX XX XX XX"
            className={field}
          />
        </label>
      </div>

      <Button
        className="mt-3 w-full"
        // Three characters is the shortest reference any operator issues, and
        // it is what the database check constraint enforces as well.
        disabled={busy || reference.trim().length < 3}
        onClick={submit}
        data-testid="claim-submit"
      >
        {busy
          ? fr
            ? "Envoi…"
            : "Sending…"
          : fr
            ? "Envoyer la déclaration"
            : "Send the declaration"}
      </Button>

      {error ? (
        <Notice tone="danger" className="mt-3" data-testid="claim-error">
          {error}
        </Notice>
      ) : null}

      <p className="mt-2.5 text-[12px] leading-5 text-ink-soft">
        {fr
          ? "Déclarer n'active rien tout seul : un humain vérifie le paiement. Vous gardez vos opérations gratuites en attendant."
          : "Declaring activates nothing by itself: a person checks the payment. You keep your free operations in the meantime."}
      </p>
    </div>
  );
}
