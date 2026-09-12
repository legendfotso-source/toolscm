"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { type Receipt, receiptMessage } from "@/lib/payments/receipt";
import { Button, ButtonLink, Card, Notice, SectionHeading } from "./ui";

type State =
  | { kind: "checking" }
  | { kind: "paid"; receipt: Receipt | null }
  | { kind: "pending" }
  | { kind: "unknown" }
  | { kind: "signin" };

/**
 * Where the customer lands after paying.
 *
 * The query string is treated as a pointer, never as an answer. A URL saying
 * `status=success` is something anyone can type; this component sends only the
 * reference to the server, and the server asks the payment provider.
 *
 * Mobile Money confirmations can take a minute, and a customer on 3G staring
 * at a phone will refresh, or leave. So it polls — slowly, with a ceiling —
 * and when it gives up it says something true and useful rather than
 * "failed": the money is not lost, the webhook will still land, and here is
 * how to ask.
 */
export function PaymentReturn({
  provider,
  reference,
}: {
  provider: "notchpay" | "stripe" | null;
  reference: string | null;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [state, setState] = useState<State>({ kind: "checking" });
  const [attempts, setAttempts] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (!provider || !reference) {
      setState({ kind: "unknown" });
      return true;
    }

    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, reference }),
      });

      if (response.status === 401) {
        setState({ kind: "signin" });
        return true;
      }
      if (response.status === 404) {
        setState({ kind: "unknown" });
        return true;
      }

      const data = (await response.json()) as { status?: string; receipt?: Receipt | null };
      if (data.status === "paid") {
        setState({ kind: "paid", receipt: data.receipt ?? null });
        return true;
      }

      setState({ kind: "pending" });
      return false;
    } catch {
      setState({ kind: "pending" });
      return false;
    }
  }, [provider, reference]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settled = await check();
      // Back off rather than hammering: 2s, 4s, 6s… up to eight tries, roughly
      // a minute and a half. Enough for a Mobile Money confirmation, not so
      // much that a forgotten tab keeps polling all afternoon.
      if (!settled && !cancelled && attempts < 8) {
        timer.current = setTimeout(
          () => {
            if (!cancelled) setAttempts((n) => n + 1);
          },
          2000 + attempts * 2000,
        );
      }
    })();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [check, attempts]);

  const copy = async (receipt: Receipt) => {
    try {
      await navigator.clipboard.writeText(receiptMessage(receipt, fr ? "fr" : "en"));
    } catch {
      /* clipboard unavailable — the receipt is still on screen */
    }
  };

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-lg">
        {state.kind === "checking" || (state.kind === "pending" && attempts < 8) ? (
          <Card className="p-6 text-center">
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-violet-border border-t-violet-deep"
              role="status"
              aria-label={fr ? "Vérification en cours" : "Checking"}
            />
            <h1 className="mt-4 text-[18px] font-bold text-ink">
              {fr ? "Vérification de votre paiement" : "Checking your payment"}
            </h1>
            <p className="mt-1.5 text-[14px] leading-6 text-ink-soft">
              {fr
                ? "Ne fermez pas cette page. La confirmation Mobile Money peut prendre une minute."
                : "Do not close this page. A Mobile Money confirmation can take a minute."}
            </p>
          </Card>
        ) : null}

        {state.kind === "paid" ? (
          <>
            <SectionHeading
              title={fr ? "Paiement confirmé" : "Payment confirmed"}
              description={
                fr
                  ? "Votre accès Pro est actif. Merci d'utiliser Tools.cm."
                  : "Your Pro access is on. Thank you for using Tools.cm."
              }
              align="center"
            />
            {state.receipt ? (
              <Card className="p-5">
                <pre className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">
                  {receiptMessage(state.receipt, fr ? "fr" : "en")}
                </pre>
                <Button
                  variant="secondary"
                  size="lg"
                  className="mt-4 w-full"
                  onClick={() => copy(state.receipt!)}
                >
                  {fr ? "Copier le reçu" : "Copy the receipt"}
                </Button>
              </Card>
            ) : null}
            <ButtonLink href="/" size="lg" className="mt-5 w-full">
              {fr ? "Utiliser les outils" : "Start using the tools"}
            </ButtonLink>
          </>
        ) : null}

        {state.kind === "pending" && attempts >= 8 ? (
          <Card className="p-6">
            <h1 className="text-[18px] font-bold text-ink">
              {fr ? "Paiement pas encore confirmé" : "Payment not confirmed yet"}
            </h1>
            <Notice tone="info" className="mt-3">
              {fr
                ? "Si l'argent est sorti de votre compte, il n'est pas perdu. La confirmation peut arriver avec quelques minutes de retard, et votre accès s'activera automatiquement."
                : "If the money left your account, it is not lost. The confirmation can arrive a few minutes late, and your access will switch on by itself."}
            </Notice>
            <p className="mt-3 text-[13.5px] leading-6 text-ink-soft">
              {fr ? "Votre référence : " : "Your reference: "}
              <span className="font-mono font-bold text-ink">{reference}</span>
            </p>
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
              <Button size="lg" className="flex-1" onClick={() => setAttempts(0)}>
                {fr ? "Vérifier à nouveau" : "Check again"}
              </Button>
              <ButtonLink href="/contact" variant="secondary" size="lg" className="flex-1">
                {fr ? "Nous contacter" : "Contact us"}
              </ButtonLink>
            </div>
          </Card>
        ) : null}

        {state.kind === "signin" ? (
          <Card className="p-6">
            <h1 className="text-[18px] font-bold text-ink">
              {fr ? "Connectez-vous pour continuer" : "Sign in to continue"}
            </h1>
            <p className="mt-2 text-[14px] leading-6 text-ink-soft">
              {fr
                ? "Votre paiement est enregistré. Connectez-vous avec le compte utilisé pour payer et il sera appliqué."
                : "Your payment is recorded. Sign in with the account you paid with and it will be applied."}
            </p>
            <ButtonLink href="/signin" size="lg" className="mt-4 w-full">
              {fr ? "Se connecter" : "Sign in"}
            </ButtonLink>
          </Card>
        ) : null}

        {state.kind === "unknown" ? (
          <Card className="p-6">
            <h1 className="text-[18px] font-bold text-ink">
              {fr ? "Paiement introuvable" : "Payment not found"}
            </h1>
            <p className="mt-2 text-[14px] leading-6 text-ink-soft">
              {fr
                ? "Nous ne trouvons pas ce paiement sur ce compte. Si vous avez payé, écrivez-nous avec la référence reçue par SMS — rien n'est perdu."
                : "We cannot find this payment on this account. If you paid, write to us with the reference from your SMS — nothing is lost."}
            </p>
            <ButtonLink href="/contact" size="lg" className="mt-4 w-full">
              {fr ? "Nous contacter" : "Contact us"}
            </ButtonLink>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
