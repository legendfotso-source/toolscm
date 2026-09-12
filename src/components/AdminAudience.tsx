"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Audience } from "@/lib/admin";
import { Card, Notice } from "./ui";

/**
 * How many people came, and where from.
 *
 * Everything on this panel is a count. There is deliberately no list of
 * visitors, because there is no such list in the database to show: the
 * identifier visits are counted against is re-salted every night, so a person
 * who comes back tomorrow is an entirely new number.
 *
 * That limit is stated on the panel itself rather than buried in the privacy
 * policy. An owner who believes he can see individual visitors will eventually
 * promise somebody that he can, and the honest version of this screen is the
 * one that says what it cannot do.
 */
export function AdminAudience({ audience }: { audience: Audience | null }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const number = (value: number) => value.toLocaleString(fr ? "fr-FR" : "en-GB");

  if (!audience) {
    return (
      <Card className="p-5">
        <h2 className="text-[16px] font-bold text-ink">{fr ? "Visiteurs" : "Visitors"}</h2>
        <Notice tone="warn" className="mt-4">
          {fr
            ? "Le comptage des visites n'est pas disponible : la base de données n'est pas jointe."
            : "Visit counting is unavailable: the database is not reachable."}
        </Notice>
      </Card>
    );
  }

  const busiest = Math.max(1, ...audience.daily.map((day) => day.views));
  const totalDevices = audience.devices.mobile + audience.devices.desktop;
  const mobileShare = totalDevices > 0 ? Math.round((audience.devices.mobile / totalDevices) * 100) : null;

  const shortDay = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(fr ? "fr-FR" : "en-GB", {
      weekday: "short",
      timeZone: "UTC",
    });

  return (
    <Card className="p-5">
      <h2 className="text-[16px] font-bold text-ink">
        {fr ? "Visiteurs (7 jours)" : "Visitors (7 days)"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">
        {fr
          ? "Des comptes, jamais des personnes. L'identifiant utilisé pour compter change chaque nuit : on peut savoir combien sont venus aujourd'hui, jamais qui est revenu."
          : "Counts, never people. The identifier used for counting changes every night: we can know how many came today, never who came back."}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label={fr ? "Visiteurs aujourd'hui" : "Visitors today"} value={number(audience.visitorsToday)} strong />
        <Figure label={fr ? "Pages vues aujourd'hui" : "Page views today"} value={number(audience.viewsToday)} />
        <Figure label={fr ? "Pages vues (7 j)" : "Page views (7d)"} value={number(audience.views7d)} />
        <Figure
          label={fr ? "Sur téléphone" : "On a phone"}
          value={mobileShare === null ? "—" : `${mobileShare} %`}
        />
      </div>

      {audience.views7d === 0 ? (
        <Notice tone="info" className="mt-4">
          {fr
            ? "Aucune visite enregistrée pour l'instant. Les chiffres apparaîtront dès que quelqu'un ouvrira le site."
            : "No visits recorded yet. Figures appear as soon as somebody opens the site."}
        </Notice>
      ) : (
        <>
          <ul className="mt-5 space-y-2">
            {audience.daily.map((day) => (
              <li key={day.day} className="flex items-center gap-3 text-[13px]">
                <span className="w-10 shrink-0 text-ink-soft">{shortDay(day.day)}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                  <span
                    className="block h-full bg-violet-deep"
                    style={{ width: `${Math.round((day.views / busiest) * 100)}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-ink-soft">
                  {number(day.visitors)}
                  <span className="ml-1 text-[11px]">{fr ? "vis." : "vis."}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <List
              title={fr ? "Pages les plus vues" : "Most viewed pages"}
              rows={audience.topPages.map((row) => ({ label: row.path, value: number(row.views) }))}
              empty={fr ? "Rien encore." : "Nothing yet."}
            />
            <List
              title={fr ? "D'où viennent les visiteurs" : "Where visitors come from"}
              rows={audience.referrers.map((row) => ({ label: row.host, value: number(row.views) }))}
              empty={
                fr
                  ? "Personne n'est encore arrivé par un lien externe."
                  : "Nobody has arrived from an outside link yet."
              }
            />
          </div>

          {audience.countries.length > 0 ? (
            <p className="mt-5 text-[12px] leading-5 text-ink-soft">
              {fr ? "Pays : " : "Countries: "}
              {audience.countries.map((row) => `${row.country} ${number(row.views)}`).join(" · ")}
            </p>
          ) : null}

          <p className="mt-3 text-[12px] leading-5 text-ink-soft">
            {fr
              ? `${number(audience.visitorDays7d)} visiteurs cumulés sur 7 jours — quelqu'un venu trois jours compte trois fois, puisque l'identifiant change chaque nuit. Le tableau de bord n'est pas compté dedans.`
              : `${number(audience.visitorDays7d)} visitors summed over 7 days — somebody who came on three days counts three times, since the identifier changes nightly. This dashboard is not counted in it.`}
          </p>
        </>
      )}
    </Card>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface-alt px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div
        className={
          strong
            ? "mt-1 text-[22px] font-bold tabular-nums text-violet-deep"
            : "mt-1 text-[22px] font-bold tabular-nums text-ink"
        }
      >
        {value}
      </div>
    </div>
  );
}

function List({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; value: string }[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-[13px] font-bold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12.5px] leading-5 text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-ink">{row.label}</span>
              <span className="shrink-0 tabular-nums text-ink-soft">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
