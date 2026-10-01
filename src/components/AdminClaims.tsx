"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Claim } from "@/lib/payments/claims";
import { formatXaf } from "@/lib/payments/format";
import { tierName } from "@/lib/payments/tiers";
import { Badge, Button, Card, Notice } from "./ui";

/**
 * Payments waiting to be confirmed.
 *
 * The missing half of the manual flow. A customer sends 2,000 FCFA by Mobile
 * Money, and until now had to find Fortune on WhatsApp and read a reference
 * down a phone line. Now they declare it on the site and it lands here, with
 * the operator, the number, the reference and what it should have cost — the
 * four things needed to check it against a Mobile Money statement.
 *
 * Fetched from the browser rather than rendered on the server, on purpose:
 * this is the one part of /admin that changes while somebody is looking at
 * it, and the whole point is that a customer who has just paid is waiting.
 *
 * Nothing here decides anything. Approving calls the server, which records
 * the payment under the customer's own reference and grants the term — and
 * does it once, however many times the button is pressed.
 */
export function AdminClaims() {
  const { locale } = useLocale();
  const router = useRouter();
  const fr = locale === "fr";

  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  /**
   * Read the queue.
   *
   * Returns the rows rather than writing state, so the effect below can drop
   * the answer if the component has gone away, and `decide` can refresh the
   * list straight after a decision. One function, two callers, no setState
   * reachable from an effect body.
   */
  const fetchClaims = useCallback(async (): Promise<Claim[]> => {
    try {
      const response = await fetch("/api/admin/claims", { cache: "no-store" });
      if (!response.ok) return [];
      const data = (await response.json()) as { claims?: Claim[] };
      return data.claims ?? [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchClaims();
      if (!cancelled) setClaims(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchClaims]);

  const decide = async (claim: Claim, action: "approve" | "reject") => {
    // A refusal needs a reason. Not for our records — for the customer, who
    // otherwise has no way to know whether to correct a mistyped reference or
    // give up on the site.
    let note: string | undefined;
    if (action === "reject") {
      const asked = window.prompt(
        fr
          ? "Pourquoi ? (la raison est enregistrée avec la demande)"
          : "Why? (the reason is stored with the request)",
        "",
      );
      // Cancel means cancel: no decision is sent.
      if (asked === null) return;
      note = asked.trim() || undefined;
    }

    setBusy(claim.id);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, claimId: claim.id, note }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        duplicate?: boolean;
        proUntil?: string | null;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        setMessage({
          tone: "danger",
          text:
            data.error === "not_pending"
              ? fr
                ? "Cette demande a déjà été traitée."
                : "That request has already been dealt with."
              : fr
                ? "L'opération a échoué."
                : "The operation failed.",
        });
        return;
      }

      setMessage({
        tone: "success",
        text:
          action === "reject"
            ? fr
              ? `Demande de ${claim.email || "ce compte"} refusée.`
              : `Request from ${claim.email || "that account"} refused.`
            : data.duplicate
              ? fr
                ? `Cette référence avait déjà été enregistrée — rien n'a été ajouté.`
                : `That reference had already been recorded — nothing was added.`
              : fr
                ? `${claim.email || "Le compte"} est passé en ${tierName(claim.tier, true)}${
                    data.proUntil ? ` jusqu'au ${date(data.proUntil, fr)}` : ""
                  }.`
                : `${claim.email || "The account"} is now ${tierName(claim.tier, false)}${
                    data.proUntil ? ` until ${date(data.proUntil, fr)}` : ""
                  }.`,
      });
      setClaims(await fetchClaims());
      // The members table and the revenue figures above are server-rendered.
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: fr ? "L'opération a échoué." : "The operation failed." });
    } finally {
      setBusy(null);
    }
  };

  const waiting = claims?.length ?? 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-bold text-ink">
          {fr ? "Paiements à confirmer" : "Payments to confirm"}
        </h2>
        {waiting > 0 ? <Badge tone="warn">{waiting}</Badge> : null}
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">
        {fr
          ? "Les clients qui disent avoir payé. Vérifiez la référence sur votre relevé Mobile Money, puis approuvez : le mois est ajouté et le paiement enregistré sous cette même référence."
          : "Customers who say they have paid. Check the reference against your Mobile Money statement, then approve: the month is added and the payment recorded under that same reference."}
      </p>

      {claims === null ? (
        <p className="mt-4 text-[13px] text-ink-soft">{fr ? "Chargement…" : "Loading…"}</p>
      ) : claims.length === 0 ? (
        <Notice tone="info" className="mt-4">
          {fr
            ? "Aucune demande en attente. Quand un client paie par Mobile Money et le déclare sur la page Tarifs, sa demande apparaît ici."
            : "Nothing waiting. When a customer pays by Mobile Money and declares it on the pricing page, their request appears here."}
        </Notice>
      ) : (
        <ul className="mt-4 space-y-3">
          {claims.map((claim) => (
            <li
              key={claim.id}
              className="rounded-xl border border-line bg-surface-alt p-3.5"
              data-testid="claim"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all text-[14px] font-semibold text-ink">
                    {claim.email || "—"}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-soft">
                    {tierName(claim.tier, fr)} · {claim.days} {fr ? "jours" : "days"} ·{" "}
                    {formatXaf(claim.amount, fr)}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-ink-soft">
                  {date(claim.createdAt, fr)}
                </span>
              </div>

              <dl className="mt-2.5 grid gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-2">
                <Line label={fr ? "Référence" : "Reference"} value={claim.transactionId} mono />
                <Line label={fr ? "Opérateur" : "Operator"} value={claim.operator} />
                <Line label={fr ? "Numéro" : "Number"} value={claim.phone} />
                <Line label={fr ? "Message" : "Message"} value={claim.note} />
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  className="!min-h-9 !px-3 !text-[12.5px]"
                  disabled={busy === claim.id}
                  onClick={() => decide(claim, "approve")}
                >
                  {busy === claim.id
                    ? "…"
                    : fr
                      ? `Approuver ${tierName(claim.tier, true)}`
                      : `Approve ${tierName(claim.tier, false)}`}
                </Button>
                <Button
                  variant="danger"
                  className="!min-h-9 !px-3 !text-[12.5px]"
                  disabled={busy === claim.id}
                  onClick={() => decide(claim, "reject")}
                >
                  {busy === claim.id ? "…" : fr ? "Refuser" : "Refuse"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {message ? (
        <Notice tone={message.tone} className="mt-4">
          {message.text}
        </Notice>
      ) : null}

      <p className="mt-4 text-[12px] leading-5 text-ink-soft">
        {fr
          ? "Une demande ne donne aucun accès par elle-même. Le montant affiché est le prix réel de la formule, calculé par le serveur — ce n'est pas un chiffre saisi par le client. Approuver deux fois la même demande n'ajoute qu'un mois."
          : "A request grants nothing on its own. The amount shown is the real price of the plan, computed by the server — not a figure the customer typed. Approving the same request twice adds one month, not two."}
      </p>
    </Card>
  );
}

function Line({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-ink-soft">{label} :</dt>
      <dd className={mono ? "break-all font-mono text-ink" : "break-all text-ink"}>{value}</dd>
    </div>
  );
}

function date(value: string, fr: boolean): string {
  return new Date(value).toLocaleString(fr ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
