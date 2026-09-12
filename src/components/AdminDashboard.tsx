"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { AdminStats } from "@/lib/admin";
import type { AdminSettings } from "@/lib/settings";
import { getTool } from "@/lib/tools/registry";
import { AdminProAccess } from "./AdminProAccess";
import { AdminReminders } from "./AdminReminders";
import { AdminActivity } from "./AdminActivity";
import { Button, Card, Notice, SectionHeading, cx } from "./ui";

export function AdminDashboard({
  stats,
  settings,
}: {
  stats: AdminStats;
  settings: AdminSettings;
}) {
  const { locale, tx } = useLocale();
  const [draft, setDraft] = useState<AdminSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fr = locale === "fr";
  const number = (value: number) => value.toLocaleString(fr ? "fr-FR" : "en-GB");

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(String(response.status));
      setSaved(true);
    } catch {
      setError(fr ? "L'enregistrement a échoué." : "Saving failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page py-8">
      <SectionHeading
        title={fr ? "Administration" : "Administration"}
        description={
          fr
            ? "Chiffres calculés à partir des enregistrements réels. Aucun contenu de fichier n'est stocké ni affiché ici."
            : "Figures computed from real rows. No file content is stored or shown here."
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label={fr ? "Opérations aujourd'hui" : "Operations today"}
          value={number(stats.operationsToday)}
          highlight
        />
        <Stat label={fr ? "Appareils aujourd'hui" : "Devices today"} value={number(stats.devicesToday)} />
        <Stat label={fr ? "Opérations (7 j)" : "Operations (7d)"} value={number(stats.operations7d)} />
        <Stat label={fr ? "Abonnés Pro actifs" : "Active Pro"} value={number(stats.activeSubscriptions)} />
        <Stat
          label={fr ? "Encaissé (XAF)" : "Collected (XAF)"}
          value={number(stats.revenueXaf)}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[16px] font-bold text-ink">
            {fr ? "Outils les plus utilisés (7 jours)" : "Most used tools (7 days)"}
          </h2>

          {stats.topTools.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-soft">
              {fr
                ? "Aucune opération enregistrée pour l'instant."
                : "No operations recorded yet."}
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {stats.topTools.map((entry) => {
                const tool = getTool(entry.tool);
                const share = Math.max(
                  2,
                  Math.round((entry.count / stats.topTools[0].count) * 100),
                );
                return (
                  <li key={entry.tool}>
                    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span className="truncate text-ink">
                        {tool ? tx(tool.name) : entry.tool}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-soft">
                        {number(entry.count)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className="h-full rounded-full bg-violet-deep"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-[16px] font-bold text-ink">
            {fr ? "Réglages" : "Settings"}
          </h2>

          <div className="mt-4 space-y-4">
            <NumberField
              label={fr ? "Limite gratuite par jour" : "Free daily limit"}
              value={draft.free_daily_limit}
              onChange={(value) => setDraft({ ...draft, free_daily_limit: value })}
            />
            <NumberField
              label={fr ? "Plafond par réseau (anti-abus)" : "Per-network ceiling (abuse)"}
              hint={
                fr
                  ? "Volontairement très élevé : au Cameroun, de nombreux abonnés mobiles partagent une même adresse IP."
                  : "Deliberately high: in Cameroon many mobile subscribers share one IP address."
              }
              value={draft.network_daily_limit}
              onChange={(value) => setDraft({ ...draft, network_daily_limit: value })}
            />
            <NumberField
              label={fr ? "Prix Pro (FCFA / mois)" : "Pro price (FCFA / month)"}
              value={draft.price_xaf}
              onChange={(value) => setDraft({ ...draft, price_xaf: value })}
            />

            <ToggleField
              label={fr ? "Appliquer la limite quotidienne" : "Enforce the daily limit"}
              hint={
                fr
                  ? "Tant que c'est désactivé, tous les outils restent illimités pour tout le monde."
                  : "While this is off, every tool stays unlimited for everyone."
              }
              checked={draft.limits_enabled}
              onChange={(value) => setDraft({ ...draft, limits_enabled: value })}
            />
            <ToggleField
              label={fr ? "Paiements actifs" : "Payments live"}
              hint={
                fr
                  ? "N'activez ceci qu'une fois un paiement de test réellement vérifié de bout en bout."
                  : "Only switch this on once a test payment has genuinely been verified end to end."
              }
              checked={draft.payments_enabled}
              onChange={(value) => setDraft({ ...draft, payments_enabled: value })}
            />
            <ToggleField
              label={fr ? "Mode maintenance" : "Maintenance mode"}
              checked={draft.maintenance_mode}
              onChange={(value) => setDraft({ ...draft, maintenance_mode: value })}
            />
          </div>

          {error ? (
            <Notice tone="danger" className="mt-4">
              {error}
            </Notice>
          ) : null}
          {saved ? (
            <Notice tone="success" className="mt-4">
              {fr ? "Réglages enregistrés." : "Settings saved."}
            </Notice>
          ) : null}

          <Button size="lg" className="mt-5 w-full" onClick={save} disabled={busy}>
            {busy ? (fr ? "Enregistrement..." : "Saving...") : fr ? "Enregistrer" : "Save"}
          </Button>
        </Card>

        <AdminProAccess priceXaf={settings.price_xaf} />

        <AdminReminders expiring={stats.expiring} priceXaf={settings.price_xaf} />

        <AdminActivity stats={stats} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-[14px] border p-4",
        highlight ? "border-violet-border bg-violet-light" : "border-line bg-white",
      )}
    >
      <p
        className={cx(
          "text-[24px] font-extrabold tabular-nums",
          highlight ? "text-violet-deep" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[12px] leading-4 text-ink-soft">{label}</p>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[14px] font-medium text-ink">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
      />
      {hint ? <p className="mt-1 text-[12px] leading-4 text-ink-soft">{hint}</p> : null}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-line accent-[#6D28D9]"
      />
      <span>
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-4 text-ink-soft">{hint}</span> : null}
      </span>
    </label>
  );
}
