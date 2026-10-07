"use client";

import { useState } from "react";

import { Button, Notice } from "../ui";

/**
 * Run the daily job now.
 *
 * The first question anybody asks about a scheduled job is "does it work",
 * and without this the only way to answer it is to wait until tomorrow
 * morning and look again. A job you cannot try is a job you do not trust.
 *
 * It calls the same endpoint the platform calls, with no secret: the route
 * accepts a signed-in administrator as its second way in. So this button
 * exercises the real path rather than a test-only copy of it, which is the
 * only kind of "try it" worth having.
 *
 * The result is shown as the route's own sentence per job — "2 reminders
 * sent", "0 abandoned checkouts closed" — because a bare "done" would leave
 * the owner exactly as uncertain as before they pressed it.
 */
export function RunScheduledNow() {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setLines(null);
    try {
      const response = await fetch("/api/cron/daily", { method: "POST" });
      if (!response.ok) {
        // 404 here means the session is not an administrator any more — the
        // same answer a stranger gets, by design.
        setFailed(true);
        setLines([`Le serveur a répondu ${response.status}.`]);
        return;
      }
      const payload = (await response.json()) as {
        ok?: boolean;
        results?: { job: string; ok: boolean; detail: string }[];
      };
      setFailed(payload.ok === false);
      setLines((payload.results ?? []).map((result) => `${result.job} — ${result.detail}`));
    } catch {
      setFailed(true);
      setLines(["La requête n'a pas abouti."]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <Button type="button" variant="secondary" onClick={run} disabled={busy}>
        {busy ? "En cours…" : "Lancer le travail planifié maintenant"}
      </Button>
      {lines ? (
        <Notice tone={failed ? "danger" : "success"} className="mt-3">
          <ul className="space-y-1">
            {lines.map((line) => (
              <li key={line} className="break-words text-xs">
                {line}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Envoie les rappels d&apos;échéance dus et ferme les paiements abandonnés. Sans effet si
        rien n&apos;est dû — chaque rappel ne part qu&apos;une fois par échéance.
      </p>
    </div>
  );
}
