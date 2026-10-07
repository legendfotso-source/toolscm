import type { Check, Health } from "@/lib/health";
import type { Role } from "@/lib/auth/owner";
import { Card, SectionHeading } from "./ui";
import { RunScheduledNow } from "./admin/RunScheduledNow";

/**
 * The health checks, drawn in the site's own card style.
 *
 * A server component, deliberately: these lines carry the provider's raw error
 * text and the shape of a key, so the data must never be serialised into a
 * client bundle or an API response that something else could fetch. Rendering
 * on the server means the HTML reaches one authorised reader and nothing else
 * can ask for it.
 */

const TONE: Record<Health, { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-500", label: "OK" },
  warn: { dot: "bg-amber-500", label: "À VOIR" },
  fail: { dot: "bg-red-500", label: "EN PANNE" },
};

export function HealthPanel({ checks, role }: { checks: Check[]; role: Role }) {
  // Broken first. A list in declaration order buries the one line that matters
  // under six that say "ok", and the whole point of this panel is that the
  // fault should not have to be hunted for.
  const order: Record<Health, number> = { fail: 0, warn: 1, ok: 2 };
  const sorted = [...checks].sort((a, b) => order[a.state] - order[b.state]);
  const broken = checks.filter((check) => check.state !== "ok").length;

  return (
    <Card className="p-4 sm:p-5">
      <SectionHeading
        title="État du système"
        description={
          broken
            ? `${broken} point(s) à régler. Le détail vient de la base elle-même, pas d'une supposition.`
            : "Tout répond."
        }
      />
      <ul className="mt-4 space-y-3">
        {sorted.map((check) => (
          <li key={check.name} className="flex gap-3">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[check.state].dot}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{check.name}</span>
                <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                  {TONE[check.state].label}
                </span>
              </div>
              {/* break-words, because the useful content here is sometimes a
                  provider error long enough to push a card off a phone. */}
              <p className="mt-0.5 break-words text-xs text-muted-foreground">{check.detail}</p>
              {check.fix ? (
                <p className="mt-1 break-words text-xs text-foreground/80">→ {check.fix}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {/* Only the owner. An administrator can read this panel; triggering a
          run sends mail to customers, which is the owner's decision. */}
      {role === "owner" ? <RunScheduledNow /> : null}
      <p className="mt-4 text-[11px] text-muted-foreground">
        Aucune clé n&apos;est affichée ici : seulement sa longueur et son préfixe, de quoi
        distinguer « absente » de « présente mais fausse ».
        {role === "owner" ? " Vous êtes connecté en tant que propriétaire." : null}
      </p>
    </Card>
  );
}
