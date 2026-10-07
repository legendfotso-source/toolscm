"use client";

import { useState } from "react";
import Link from "next/link";

import type { UserDetail } from "@/lib/admin-users";
import type { Role } from "@/lib/auth/owner";
import type { AccountStatus, GrantTier } from "@/lib/accounts";
import { ACTION_LABEL } from "@/lib/audit-labels";
import { Button, Card, Notice, SectionHeading } from "../ui";

/**
 * One account, in full, with the actions that change it.
 *
 * Built in the site's existing card style rather than as a new design: the
 * brief asks for the current visual identity to be preserved, and an admin
 * page that looks like a different product is one more thing to learn.
 *
 * Every action reloads from the server rather than updating the row in place.
 * Optimistic updates are pleasant and they lie: a grant that the database
 * refused would still appear to have worked, and on this page the whole value
 * is that what is shown is what is true.
 */

const STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Actif",
  suspended: "Suspendu",
  blocked: "Bloqué",
  deactivated: "Désactivé",
};

const STATUS_TONE: Record<AccountStatus, "info" | "warn" | "danger" | "success"> = {
  active: "success",
  suspended: "warn",
  blocked: "danger",
  deactivated: "info",
};

const TIER_LABEL: Record<string, string> = {
  free: "Gratuit",
  pro: "Pro",
  max: "Max",
  owner: "Illimité",
};

function when(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function day(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function UserDetailView({ detail, role }: { detail: UserDetail; role: Role }) {
  const { account } = detail;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setProblem(
          payload.error === "protected"
            ? "Le compte propriétaire ne peut pas être modifié ici — c'est voulu."
            : payload.error === "forbidden"
              ? "Seul le propriétaire peut faire ça."
              : payload.error === "not_found"
                ? "Ce compte n'existe plus."
                : "L'action n'a pas abouti. Rien n'a été changé.",
        );
        return;
      }
      // Reload rather than patch the view: what is on screen must be what the
      // database says, not what we hoped it would say.
      window.location.reload();
    } catch {
      setProblem("Pas de connexion. Rien n'a été changé.");
    } finally {
      setBusy(false);
    }
  };

  const grant = (tier: GrantTier, days: number | null) =>
    act({
      action: "grant",
      userId: account.id,
      tier,
      reason: reason.trim() || undefined,
      expiresAt:
        days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString(),
    });

  const liveGrants = detail.grants.filter(
    (row) =>
      !row.revokedAt && (!row.expiresAt || new Date(row.expiresAt) > new Date()),
  );

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <Link href="/admin" className="text-[14px] text-violet-deep underline">
            ← Retour à l&apos;administration
          </Link>
          <h1 className="mt-2 break-all text-2xl font-semibold tracking-tight">
            {account.email || "(sans adresse)"}
          </h1>
          <p className="mt-1 text-[14px] text-ink-soft">
            Compte créé le {day(account.joinedAt)}
            {account.isAdmin ? " · administrateur" : ""}
          </p>
        </div>

        {problem ? <Notice tone="danger">{problem}</Notice> : null}

        {/* Access — the first thing anybody opens this page to see. */}
        <Card className="p-4 sm:p-5">
          <SectionHeading
            title="Accès"
            description="Ce dont ce compte dispose en ce moment, et d'où ça vient."
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-violet-light px-3 py-1.5 text-[14px] font-semibold text-[#4c1d95]">
              {TIER_LABEL[account.tier] ?? account.tier}
            </span>
            <span className="text-[14px] text-ink-soft">
              {account.source === "grant"
                ? account.until
                  ? `accordé à la main, jusqu'au ${day(account.until)}`
                  : "accordé à la main, sans date de fin"
                : account.source === "subscription"
                  ? `payé, jusqu'au ${day(account.until)}`
                  : "aucun accès payant ni accordé"}
            </span>
          </div>
          <Notice tone={STATUS_TONE[account.status]} className="mt-3">
            Statut du compte : <strong>{STATUS_LABEL[account.status]}</strong>
            {account.status !== "active"
              ? " — ce compte ne peut pas utiliser les outils, quel que soit son abonnement."
              : ""}
          </Notice>
        </Card>

        {/* Actions */}
        <Card className="p-4 sm:p-5">
          <SectionHeading
            title="Actions"
            description="Un accès accordé ici n'enregistre aucun paiement : il n'apparaît pas dans le chiffre d'affaires."
          />

          <label className="mt-3 block text-[14px] font-medium">
            Motif (facultatif, conservé dans le journal)
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-[15px]"
              placeholder="Testeur, geste commercial, promotion de lancement…"
            />
          </label>

          <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            Accorder un accès
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => grant("pro", 30)}>
              Pro · 30 jours
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => grant("max", 30)}>
              Max · 30 jours
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => grant("max", 365)}>
              Max · 1 an
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => grant("unlimited", null)}>
              Illimité · à vie
            </Button>
          </div>

          <p className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            Statut du compte
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["active", "suspended", "blocked", "deactivated"] as AccountStatus[])
              .filter((status) => status !== account.status)
              .map((status) => (
                <Button
                  key={status}
                  variant={status === "blocked" ? "danger" : "secondary"}
                  disabled={busy}
                  onClick={() =>
                    act({
                      action: "status",
                      userId: account.id,
                      status,
                      reason: reason.trim() || undefined,
                    })
                  }
                >
                  {STATUS_LABEL[status]}
                </Button>
              ))}
          </div>

          {role === "owner" ? (
            <>
              <p className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
                Rôle — propriétaire uniquement
              </p>
              <div className="mt-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    act({
                      action: "admin",
                      userId: account.id,
                      makeAdmin: !account.isAdmin,
                      reason: reason.trim() || undefined,
                    })
                  }
                >
                  {account.isAdmin
                    ? "Retirer les droits d'administrateur"
                    : "Nommer administrateur"}
                </Button>
              </div>
            </>
          ) : null}
        </Card>

        {/* Grants, live and historical */}
        <Card className="p-4 sm:p-5">
          <SectionHeading
            title="Accès accordés"
            description="Y compris ceux qui ont expiré ou été retirés : ce qui a été donné puis repris est l'essentiel de l'historique."
          />
          {detail.grants.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-soft">Aucun accès accordé à la main.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.grants.map((row) => {
                const expired = row.expiresAt && new Date(row.expiresAt) <= new Date();
                const live = !row.revokedAt && !expired;
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[14px]"
                  >
                    <strong>{TIER_LABEL[row.tier] ?? row.tier}</strong>
                    <span className="text-ink-soft">{row.kind}</span>
                    <span className="text-ink-soft">
                      {row.expiresAt ? `jusqu'au ${day(row.expiresAt)}` : "à vie"}
                    </span>
                    {row.reason ? (
                      <span className="text-ink-soft">· {row.reason}</span>
                    ) : null}
                    <span
                      className={
                        live
                          ? "rounded bg-success-light px-2 py-0.5 text-[12px] text-[#166534]"
                          : "rounded bg-surface-alt px-2 py-0.5 text-[12px] text-ink-soft"
                      }
                    >
                      {row.revokedAt ? "retiré" : expired ? "expiré" : "actif"}
                    </span>
                    {live ? (
                      <Button
                        variant="danger"
                        disabled={busy}
                        className="ml-auto"
                        onClick={() =>
                          act({
                            action: "revoke",
                            grantId: row.id,
                            reason: reason.trim() || undefined,
                          })
                        }
                      >
                        Retirer
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {liveGrants.length > 1 ? (
            <Notice tone="info" className="mt-3">
              Plusieurs accès sont actifs : c&apos;est le plus fort qui s&apos;applique.
            </Notice>
          ) : null}
        </Card>

        {/* Payments */}
        <Card className="p-4 sm:p-5">
          <SectionHeading
            title="Paiements"
            description="Les transactions réelles. Un accès accordé à la main n'en crée aucune."
          />
          {detail.payments.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-soft">Aucun paiement enregistré.</p>
          ) : (
            <div className="mt-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[520px] text-left text-[14px]">
                <thead className="text-[12px] uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Montant</th>
                    <th className="pb-2 pr-3">Moyen</th>
                    <th className="pb-2 pr-3">État</th>
                    <th className="pb-2">Référence</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.payments.map((row) => (
                    <tr key={row.id} className="border-t border-line">
                      <td className="py-2 pr-3 whitespace-nowrap">{day(row.createdAt)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {row.amount.toLocaleString("fr-FR")} {row.currency}
                      </td>
                      <td className="py-2 pr-3">{row.provider}</td>
                      <td className="py-2 pr-3">{row.status}</td>
                      <td className="py-2 break-all text-ink-soft">{row.transactionId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Usage — honestly absent */}
        <Card className="p-4 sm:p-5">
          <SectionHeading title="Usage" description="Ce que ce compte a fait sur le site." />
          <p className="mt-3 text-[14px] text-ink-soft">
            Non disponible, et c&apos;est voulu. L&apos;usage est compté par appareil, avec un
            identifiant qui change chaque nuit — le site peut dire combien de personnes sont
            venues aujourd&apos;hui, jamais ce qu&apos;une personne donnée a fait la semaine
            dernière. Afficher « 0 » ici serait faux pour quelqu&apos;un qui a utilisé les
            outils quarante fois.
          </p>
        </Card>

        {/* Notes */}
        <Card className="p-4 sm:p-5">
          <SectionHeading
            title="Notes internes"
            description="Jamais visibles par la personne concernée."
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Accès illimité accordé : testeur de la version mobile."
              className="w-full rounded-xl border border-line px-3 py-2.5 text-[15px]"
            />
            <Button
              disabled={busy || note.trim().length === 0}
              onClick={() => act({ action: "note", userId: account.id, body: note.trim() })}
            >
              Ajouter
            </Button>
          </div>
          {detail.notes.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-soft">Aucune note.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.notes.map((row) => (
                <li key={row.id} className="rounded-xl border border-line px-3 py-2.5 text-[14px]">
                  <p>{row.body}</p>
                  <p className="mt-1 text-[12px] text-ink-soft">
                    {row.authorEmail ?? "—"} · {when(row.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Audit */}
        <Card className="p-4 sm:p-5">
          <SectionHeading
            title="Historique administratif"
            description="Ce qui a été fait à ce compte, par qui. Ces lignes ne peuvent être ni modifiées ni effacées."
          />
          {detail.audit.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-soft">Rien pour l&apos;instant.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.audit.map((row) => (
                <li key={row.id} className="text-[14px]">
                  <span className="text-ink-soft">{when(row.createdAt)}</span>{" "}
                  <strong>{ACTION_LABEL[row.action] ?? row.action}</strong>{" "}
                  <span className="text-ink-soft">
                    par {row.actorEmail ?? "—"}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
