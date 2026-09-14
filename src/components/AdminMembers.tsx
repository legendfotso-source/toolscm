"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Member } from "@/lib/admin";
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
  const setPro = async (member: Member, grant: boolean) => {
    setBusy(member.email);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          grant
            ? { action: "grant", email: member.email, amount: priceXaf, currency: "XAF" }
            : { action: "revoke", email: member.email },
        ),
      });
      const data = (await response.json()) as { ok?: boolean; duplicate?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setMessage({
          tone: "danger",
          text:
            data.error === "no_such_account"
              ? fr
                ? "Aucun compte avec cette adresse."
                : "No account with that address."
              : fr
                ? "L'opération a échoué."
                : "The operation failed.",
        });
        return;
      }

      setMessage({
        tone: "success",
        text: data.duplicate
          ? fr
            ? `${member.email} avait déjà été activé aujourd'hui — rien n'a été ajouté.`
            : `${member.email} was already activated today — nothing was added.`
          : grant
            ? fr
              ? `${member.email} est passé en Pro.`
              : `${member.email} is now Pro.`
            : fr
              ? `L'accès Pro de ${member.email} a été retiré.`
              : `Pro access for ${member.email} has been removed.`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: fr ? "L'opération a échoué." : "The operation failed." });
    } finally {
      setBusy(null);
    }
  };

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
            ? "Personne n'a encore créé de compte. C'est normal : tous les outils fonctionnent sans compte, et un compte ne sert qu'à gérer un abonnement Pro."
            : "Nobody has created an account yet. That is expected: every tool works without one, and an account only exists to manage a Pro subscription."}
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
                ? `${members.length} compte${members.length > 1 ? "s" : ""} · ${proCount} Pro`
                : `${members.length} account${members.length > 1 ? "s" : ""} · ${proCount} Pro`}
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
                      <td className="py-2.5 text-right">
                        <Button
                          variant={member.proStatus === "active" ? "danger" : "primary"}
                          className="!min-h-9 !px-3 !text-[12.5px]"
                          disabled={busy === member.email}
                          onClick={() => setPro(member, member.proStatus !== "active")}
                        >
                          {busy === member.email
                            ? "…"
                            : member.proStatus === "active"
                              ? fr
                                ? "Retirer Pro"
                                : "Remove Pro"
                              : fr
                                ? "Activer Pro"
                                : "Make Pro"}
                        </Button>
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
              ? `« Activer Pro » enregistre un paiement manuel de ${priceXaf.toLocaleString("fr-FR")} FCFA et donne un mois. Appuyer deux fois le même jour n'ajoute rien. Pour enregistrer l'identifiant de transaction Mobile Money, utilisez le bloc « Activer Pro » plus haut.`
              : `"Make Pro" records a manual payment of ${priceXaf.toLocaleString("en-GB")} FCFA and grants one month. Pressing it twice on the same day adds nothing. To record the Mobile Money transaction id, use the "Activate Pro" block above.`}
          </p>

          <p className="mt-2 text-[12px] leading-5 text-ink-soft">
            {fr
              ? "Ce n'est pas le nombre de personnes qui utilisent le site : les outils fonctionnent sans compte, et la plupart des visiteurs n'apparaîtront jamais ici."
              : "This is not how many people use the site: the tools work without an account, and most visitors will never appear here."}
          </p>
        </>
      )}
    </Card>
  );
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
  if (member.proStatus === "active") {
    return (
      <Badge tone="success">
        {member.proUntil
          ? fr
            ? `Pro jusqu'au ${date(member.proUntil)}`
            : `Pro until ${date(member.proUntil)}`
          : "Pro"}
      </Badge>
    );
  }

  if (member.proStatus === "expired") {
    return <Badge tone="warn">{fr ? "Pro expiré" : "Pro expired"}</Badge>;
  }

  if (member.proStatus === "pending") {
    return <Badge tone="neutral">{fr ? "En attente" : "Pending"}</Badge>;
  }

  return <span className="text-ink-soft">{fr ? "Gratuit" : "Free"}</span>;
}
