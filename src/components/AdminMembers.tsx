"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Member } from "@/lib/admin";
import { tierName, tierPriceXaf } from "@/lib/payments/tiers";
import { Badge, Button, Card, Notice } from "./ui";

/**
 * Everyone who created an account.
 *
 * This is the one screen in the project that shows real email addresses, which
 * is why the page around it returns notFound() to anybody who is not an admin
 * rather than a 403 — a stranger should not even learn that this list exists.
 *
 * It is also, deliberately, not "your users". Every tool works without an
 * account, so the people here are the small minority who wanted a
 * subscription. Reading this list as the size of the audience would be reading
 * it wrong, and the note at the bottom says so.
 */
export function AdminMembers({
  members,
  priceXaf,
}: {
  members: Member[];
  priceXaf: number;
}) {
  const { locale } = useLocale();
  const router = useRouter();
  const fr = locale === "fr";
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  /**
   * Grant or end Pro from the row itself.
   *
   * No transaction id is sent. The server then derives a reference that is
   * stable for this person for today, so a second tap extends nothing — which
   * matters, because this button will mostly be pressed on a phone and phones
   * produce double taps.
   */
  const send = async (member: Member, body: Record<string, unknown>, success: string) => {
    setBusy(member.email);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: member.email, ...body }),
      });
      const data = (await response.json()) as { ok?: boolean; duplicate?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setMessage({ tone: "danger", text: explain(data.error, fr) });
        return;
      }

      setMessage({
        tone: "success",
        text: data.duplicate
          ? fr
            ? `${member.email} avait déjà été activé aujourd'hui — rien n'a été ajouté.`
            : `${member.email} was already activated today — nothing was added.`
          : success,
      });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: fr ? "L'opération a échoué." : "The operation failed." });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Give this person a plan, from the row itself.
   *
   * No transaction id is sent. The server then derives a reference that is
   * stable for this person for today, so a second tap extends nothing — which
   * matters, because this button will mostly be pressed on a phone and phones
   * produce double taps. The amount sent is the real price of the tier chosen,
   * so the revenue figure on this page stays true.
   */
  const grant = (member: Member, tier: "pro" | "max") =>
    send(
      member,
      { action: "grant", tier, amount: tierPriceXaf(priceXaf, tier), currency: "XAF" },
      fr
        ? `${member.email} est passé en ${tierName(tier, true)}.`
        : `${member.email} is now ${tierName(tier, false)}.`,
    );

  const revoke = (member: Member) =>
    send(
      member,
      { action: "revoke" },
      fr
        ? `L'accès payant de ${member.email} a été retiré.`
        : `Paid access for ${member.email} has been removed.`,
    );

  /**
   * The no-limits switch.
   *
   * Deliberately NOT one of the plan buttons: it is not a plan, there is no
   * payment behind it and no date it runs out. It is for the owner's own
   * account and for anybody Fortune decides to hand the whole site to.
   */
  const setUnlimited = (member: Member, enabled: boolean) =>
    send(
      member,
      { action: "unlimited", enabled },
      enabled
        ? fr
          ? `${member.email} n'a plus aucune limite.`
          : `${member.email} now has no limits at all.`
        : fr
          ? `Les limites normales s'appliquent à nouveau à ${member.email}.`
          : `The normal limits apply to ${member.email} again.`,
    );

  const date = (value: string) =>
    new Date(value).toLocaleDateString(fr ? "fr-FR" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) => member.email.toLowerCase().includes(needle));
  }, [members, query]);

  const proCount = members.filter((member) => member.proStatus === "active").length;

  return (
    <Card className="p-5">
      <h2 className="text-[16px] font-bold text-ink">
        {fr ? "Comptes créés" : "Accounts created"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">
        {fr
          ? "Les personnes qui ont ouvert un compte. Adresses email réelles : cette page n'est visible que par un administrateur."
          : "The people who opened an account. Real email addresses: this page is visible to an administrator only."}
      </p>

      {members.length === 0 ? (
        <Notice tone="info" className="mt-4">
          {fr
            ? "Personne n'a encore créé de compte. Un compte est nécessaire pour utiliser les outils : les premiers inscrits apparaîtront ici."
            : "Nobody has created an account yet. An account is needed to use the tools, so the first sign-ups will appear here."}
        </Notice>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={fr ? "Chercher une adresse…" : "Search an address…"}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-violet-deep"
            />
            <span className="shrink-0 text-[12.5px] text-ink-soft">
              {fr
                ? `${members.length} compte${members.length > 1 ? "s" : ""} · ${proCount} payant${proCount > 1 ? "s" : ""}`
                : `${members.length} account${members.length > 1 ? "s" : ""} · ${proCount} paying`}
            </span>
          </div>

          {shown.length === 0 ? (
            <p className="mt-4 text-[13px] text-ink-soft">
              {fr ? "Aucune adresse ne correspond." : "No address matches."}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
                    <th className="pb-2 font-semibold">{fr ? "Adresse" : "Address"}</th>
                    <th className="pb-2 font-semibold">{fr ? "Inscrit le" : "Joined"}</th>
                    <th className="pb-2 font-semibold">{fr ? "Accès" : "Access"}</th>
                    <th className="pb-2 text-right font-semibold">{fr ? "Action" : "Action"}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((member) => (
                    <tr key={member.email + member.joinedAt} className="border-b border-line/60">
                      <td className="py-2.5 pr-3">
                        <span className="break-all text-ink">{member.email || "—"}</span>
                        {member.isAdmin ? (
                          <Badge tone="violet" className="ml-2 align-middle">
                            {fr ? "admin" : "admin"}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-ink-soft">
                        {date(member.joinedAt)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Access member={member} fr={fr} date={date} />
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* Pro and Max side by side rather than one button
                              that cycles. An admin confirming a 5,000 FCFA
                              transfer should be able to grant Max in one tap,
                              not grant Pro and then upgrade it. */}
                          <Button
                            variant={member.tier === "pro" ? "secondary" : "primary"}
                            className="!min-h-9 !px-3 !text-[12.5px]"
                            disabled={busy === member.email}
                            onClick={() => grant(member, "pro")}
                          >
                            {busy === member.email ? "…" : "Pro"}
                          </Button>
                          <Button
                            variant={member.tier === "max" ? "secondary" : "primary"}
                            className="!min-h-9 !px-3 !text-[12.5px]"
                            disabled={busy === member.email}
                            onClick={() => grant(member, "max")}
                          >
                            {busy === member.email ? "…" : "Max"}
                          </Button>
                          <Button
                            variant={member.isUnlimited ? "danger" : "secondary"}
                            className="!min-h-9 !px-3 !text-[12.5px]"
                            disabled={busy === member.email}
                            onClick={() => setUnlimited(member, !member.isUnlimited)}
                            title={
                              fr
                                ? "Aucune limite : ni quota, ni taille de fichier, ni lot. Ne se périme pas."
                                : "No limits at all: no quota, no file size, no batch. Never expires."
                            }
                          >
                            {busy === member.email
                              ? "…"
                              : member.isUnlimited
                                ? fr
                                  ? "Retirer illimité"
                                  : "Remove unlimited"
                                : fr
                                  ? "Illimité"
                                  : "Unlimited"}
                          </Button>
                          {member.proStatus === "active" ? (
                            <Button
                              variant="danger"
                              className="!min-h-9 !px-3 !text-[12.5px]"
                              disabled={busy === member.email}
                              onClick={() => revoke(member)}
                            >
                              {busy === member.email ? "…" : fr ? "Retirer" : "Remove"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {message ? (
            <Notice tone={message.tone} className="mt-4">
              {message.text}
            </Notice>
          ) : null}

          <p className="mt-4 text-[12px] leading-5 text-ink-soft">
            {fr
              ? `« Pro » et « Max » enregistrent un paiement manuel (${tierPriceXaf(priceXaf, "pro").toLocaleString("fr-FR")} ou ${tierPriceXaf(priceXaf, "max").toLocaleString("fr-FR")} FCFA) et donnent un mois. Appuyer deux fois le même jour n'ajoute rien. « Illimité » n'est pas une formule : aucun paiement, aucune date de fin, aucune limite. Pour enregistrer l'identifiant Mobile Money, utilisez le bloc plus haut — ou approuvez la demande du client dans « Paiements à confirmer ».`
              : `"Pro" and "Max" record a manual payment (${tierPriceXaf(priceXaf, "pro").toLocaleString("en-GB")} or ${tierPriceXaf(priceXaf, "max").toLocaleString("en-GB")} FCFA) and grant one month. Pressing one twice on the same day adds nothing. "Unlimited" is not a plan: no payment, no end date, no caps. To record the Mobile Money reference, use the block above — or approve the customer's own request in "Payments to confirm".`}
          </p>

          <p className="mt-2 text-[12px] leading-5 text-ink-soft">
            {fr
              ? "Tous ceux qui utilisent un outil ont un compte et figurent ici. Les visiteurs qui lisent seulement les pages, sans compte, n'y figurent pas."
              : "Everyone who uses a tool has an account and appears here. Visitors who only read the pages, without an account, do not."}
          </p>
        </>
      )}
    </Card>
  );
}

/**
 * What went wrong, in a sentence an admin can act on.
 *
 * `migration_missing` is the one worth naming: the usual cause of a refused
 * "Illimité" is that 0003_claims_and_unlimited.sql has not been run in the
 * Supabase SQL editor yet, and "the operation failed" gives nobody a way to
 * guess that.
 */
function explain(error: string | undefined, fr: boolean): string {
  if (error === "no_such_account") {
    return fr ? "Aucun compte avec cette adresse." : "No account with that address.";
  }
  if (error === "migration_missing") {
    return fr
      ? "La base n'a pas encore la colonne « is_unlimited ». Exécutez 0003_claims_and_unlimited.sql dans l'éditeur SQL Supabase, puis réessayez."
      : "The database does not have the \u201cis_unlimited\u201d column yet. Run 0003_claims_and_unlimited.sql in the Supabase SQL editor, then try again.";
  }
  return fr ? "L'opération a échoué." : "The operation failed.";
}

function Access({
  member,
  fr,
  date,
}: {
  member: Member;
  fr: boolean;
  date: (value: string) => string;
}) {
  // The flag wins over everything, because that is what it does: an unlimited
  // account is unlimited whether or not it also has a subscription, and
  // showing "Pro until the 12th" for one would be wrong in the direction that
  // makes somebody re-grant a plan nobody needs.
  if (member.isUnlimited) {
    return <Badge tone="violet">{fr ? "Illimité" : "Unlimited"}</Badge>;
  }

  if (member.proStatus === "active") {
    const plan = tierName(member.tier, fr);
    return (
      <Badge tone="success">
        {member.proUntil
          ? fr
            ? `${plan} jusqu'au ${date(member.proUntil)}`
            : `${plan} until ${date(member.proUntil)}`
          : plan}
      </Badge>
    );
  }

  if (member.proStatus === "expired") {
    return <Badge tone="warn">{fr ? "Accès expiré" : "Access expired"}</Badge>;
  }

  if (member.proStatus === "pending") {
    return <Badge tone="neutral">{fr ? "En attente" : "Pending"}</Badge>;
  }

  return <span className="text-ink-soft">{fr ? "Gratuit" : "Free"}</span>;
}
