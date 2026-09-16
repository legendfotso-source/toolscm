"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { type Plan, type PlanId, planName } from "@/lib/payments/plans";
import { TIERS, tierName, type TierId } from "@/lib/payments/tiers";
import { track } from "@/lib/analytics";
import { Button, Notice, cx } from "./ui";

/**
 * Choose a length, choose a way to pay, go.
 *
 * The browser sends only two things: which plan and which provider. The price,
 * the customer and the payment reference are all decided on the server — so
 * editing this component in dev tools changes nothing about what gets charged
 * or what gets granted.
 */
export function CheckoutButtons({
  plansAvailable,
  notchpay,
  campay,
  stripe,
  signedIn,
}: {
  plansAvailable: Plan[];
  notchpay: boolean;
  campay: boolean;
  stripe: boolean;
  signedIn: boolean;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";

  const router = useRouter();
  const [planId, setPlanId] = useState<PlanId>("monthly");
  const [tier, setTier] = useState<TierId>("pro");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = plansAvailable.find((plan) => plan.id === planId) ?? plansAvailable[0];

  const start = async (provider: "notchpay" | "campay" | "stripe") => {
    setBusy(provider);
    setError(null);
    // Contentless, like every other event: which plan and which provider, so
    // we can see where checkout is abandoned. No amount, no identity.
    track("checkout", "start", { tier, plan: planId, provider });
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, plan: planId, tier }),
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (response.status === 401) {
        // Send them to sign in and bring them straight back.
        router.push(`/signin?next=${encodeURIComponent("/pricing")}`);
        return;
      }

      if (!response.ok || !data.url) {
        const messages: Record<string, string> = {
          payments_disabled: fr
            ? "Les paiements ne sont pas encore activés."
            : "Payments are not switched on yet.",
          provider_unavailable: fr
            ? "Ce moyen de paiement n'est pas disponible pour l'instant."
            : "That payment method is not available right now.",
        };
        setError(
          messages[data.error ?? ""] ??
            (fr
              ? "Le paiement n'a pas pu démarrer. Réessayez dans un instant."
              : "The payment could not be started. Try again in a moment."),
        );
        setBusy(null);
        return;
      }

      // Deliberately a full navigation, not router.push: the destination is
      // the payment provider's own domain.
      window.location.assign(data.url);
    } catch {
      setError(
        fr
          ? "Connexion impossible. Vérifiez votre réseau et réessayez."
          : "Could not connect. Check your network and try again.",
      );
      setBusy(null);
    }
  };

  return (
    <div>
      <p className="text-[14px] font-semibold text-ink">
        {fr ? "Choisissez une durée" : "Choose a length"}
      </p>

      <div
        className="mt-2.5 grid gap-2 sm:grid-cols-2"
        role="group"
        aria-label={fr ? "Formule" : "Plan"}
      >
        {(["pro", "max"] as TierId[]).map((id) => {
          const active = id === tier;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTier(id)}
              aria-pressed={active}
              className={cx(
                "rounded-xl border px-3 py-2 text-left transition",
                active
                  ? "border-violet-mid bg-violet-soft/40 ring-1 ring-violet-mid"
                  : "border-line bg-white hover:border-violet-mid/60",
              )}
            >
              <span className="block text-sm font-semibold">{tierName(id, fr)}</span>
              <span className="block text-[12.5px] text-ink-soft">
                {fr
                  ? `${TIERS[id].batchFiles} fichiers à la fois`
                  : `${TIERS[id].batchFiles} files at a time`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
        {plansAvailable.map((plan) => {
          const active = plan.id === planId;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setPlanId(plan.id)}
              aria-pressed={active}
              className={[
                "min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-violet-deep bg-violet-light"
                  : "border-line bg-white hover:border-violet-border",
              ].join(" ")}
            >
              <span className="block text-[14px] font-bold text-ink">
                {planName(plan.id, fr)}
              </span>
              <span className="block text-[13px] tabular-nums text-ink-soft">
                {plan.amountXaf.toLocaleString(fr ? "fr-FR" : "en-GB")} FCFA
              </span>
              {plan.savingPercent > 0 ? (
                <span className="mt-0.5 inline-block rounded bg-violet-deep px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {fr ? `−${plan.savingPercent} %` : `−${plan.savingPercent}%`}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected && selected.savingPercent > 0 ? (
        <p className="mt-2 text-[12.5px] leading-5 text-ink-soft">
          {fr
            ? "Payer pour plusieurs mois d'un coup évite aussi les frais de transfert Mobile Money à chaque fois."
            : "Paying for several months at once also avoids the Mobile Money transfer fee each time."}
        </p>
      ) : null}

      {error ? (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      ) : null}

      <div className="mt-4 space-y-2.5">
        {/* Only one Mobile Money button is ever shown. Two buttons that do the
            same thing through different companies is a choice the customer has
            no way to make, and every extra decision loses people at checkout. */}
        {campay ? (
          <Button
            size="lg"
            className="w-full"
            onClick={() => start("campay")}
            disabled={busy !== null}
          >
            {busy === "campay"
              ? fr
                ? "Ouverture..."
                : "Opening..."
              : fr
                ? "Payer avec MTN ou Orange Money"
                : "Pay with MTN or Orange Money"}
          </Button>
        ) : notchpay ? (
          <Button
            size="lg"
            className="w-full"
            onClick={() => start("notchpay")}
            disabled={busy !== null}
          >
            {busy === "notchpay"
              ? fr
                ? "Ouverture..."
                : "Opening..."
              : fr
                ? "Payer avec Mobile Money"
                : "Pay with Mobile Money"}
          </Button>
        ) : null}

        {stripe ? (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => start("stripe")}
            disabled={busy !== null}
          >
            {busy === "stripe"
              ? fr
                ? "Ouverture..."
                : "Opening..."
              : fr
                ? "Payer par carte bancaire"
                : "Pay by card"}
          </Button>
        ) : null}
      </div>

      {!signedIn ? (
        <p className="mt-3 text-center text-[12.5px] leading-5 text-ink-soft">
          {fr
            ? "Vous devrez vous connecter : c'est ce qui rattache l'abonnement à votre compte."
            : "You will need to sign in — that is what attaches the subscription to your account."}
        </p>
      ) : null}
    </div>
  );
}
