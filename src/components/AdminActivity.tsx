"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { AdminStats } from "@/lib/admin";
import { getTool } from "@/lib/tools/registry";
import { Card, Notice } from "./ui";

/**
 * What people actually use, and what is actually breaking.
 *
 * This is the table that answers "what should I build next" and "what is
 * quietly losing me customers", and it works even with the daily limit
 * switched off — unlike the usage counters, which only fill up once people are
 * being limited.
 *
 * The failure rate is shown next to the run count on purpose. A tool used 400
 * times with 90 failures is a more urgent problem than one used twice and
 * never run again, and the two look identical on a chart of usage alone.
 */
export function AdminActivity({ stats }: { stats: AdminStats }) {
  const { locale, tx } = useLocale();
  const fr = locale === "fr";
  const number = (value: number) => value.toLocaleString(fr ? "fr-FR" : "en-GB");

  const busiest = Math.max(1, ...stats.activity.map((row) => row.runs + row.failures));

  const seconds = (ms: number | null) => {
    if (ms === null) return "—";
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  };

  return (
    <Card className="p-5">
      <h2 className="text-[16px] font-bold text-ink">
        {fr ? "Activité réelle (7 jours)" : "Real activity (7 days)"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">
        {fr
          ? "Comptes d'événements, sans aucun contenu de fichier. Fonctionne même quand la limite quotidienne est désactivée."
          : "Event counts, with no file content whatsoever. Works even while the daily limit is off."}
      </p>

      {stats.activity.length === 0 ? (
        <Notice tone="info" className="mt-4">
          {fr
            ? "Aucun événement enregistré pour l'instant. Les chiffres apparaîtront dès que quelqu'un utilisera un outil."
            : "No events recorded yet. Figures appear as soon as somebody uses a tool."}
        </Notice>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {stats.activity.map((row) => {
              const tool = getTool(row.tool);
              const total = row.runs + row.failures;
              const failureRate = total > 0 ? row.failures / total : 0;

              return (
                <li key={row.tool}>
                  <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="truncate text-ink">{tool ? tx(tool.name) : row.tool}</span>
                    <span className="shrink-0 tabular-nums text-ink-soft">
                      {number(row.runs)}
                      {row.failures > 0 ? (
                        <span
                          className={
                            failureRate > 0.15
                              ? "ml-2 font-bold text-danger"
                              : "ml-2 text-ink-soft"
                          }
                        >
                          {fr ? `${number(row.failures)} échecs` : `${number(row.failures)} failed`}
                        </span>
                      ) : null}
                      <span className="ml-2 text-ink-soft">{seconds(row.medianMs)}</span>
                    </span>
                  </div>
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-alt">
                    <div
                      className="h-full bg-violet-deep"
                      style={{ width: `${Math.max(1, Math.round((row.runs / busiest) * 100))}%` }}
                    />
                    {row.failures > 0 ? (
                      <div
                        className="h-full bg-danger"
                        style={{
                          width: `${Math.max(1, Math.round((row.failures / busiest) * 100))}%`,
                        }}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-[12px] leading-5 text-ink-soft">
            {fr
              ? `${number(stats.eventsTotal)} événements sur 7 jours. La durée indiquée est la médiane — une valeur moyenne serait faussée par un seul gros fichier sur un téléphone lent.`
              : `${number(stats.eventsTotal)} events over 7 days. The time shown is the median — an average would be skewed by one large file on one slow phone.`}
          </p>
        </>
      )}
    </Card>
  );
}
