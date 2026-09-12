"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ExpiringRow } from "@/lib/admin";
import { reminderMessage } from "@/lib/payments/reminders";
import { whatsappNumber } from "@/lib/payments/receipt";
import { Card, Notice } from "./ui";

/**
 * Who is about to lapse, and one tap to tell them.
 *
 * The most valuable list on this page. A subscriber who expires unnoticed is
 * the most expensive kind of lost customer — already convinced, already
 * paying, gone by accident — and on a Mobile Money flow there is no card on
 * file to charge again. Somebody telling them is the entire renewal mechanism.
 *
 * Sorted soonest-first, because that is the order you would work down it.
 */
export function AdminReminders({
  expiring,
  priceXaf,
}: {
  expiring: ExpiringRow[];
  priceXaf: number;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";

  const price = `${priceXaf.toLocaleString(fr ? "fr-FR" : "en-GB")} FCFA`;

  return (
    <Card className="p-5">
      <h2 className="text-[16px] font-bold text-ink">
        {fr ? "Abonnements qui expirent bientôt" : "Subscriptions expiring soon"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">
        {fr
          ? "Un abonné qui expire sans s'en rendre compte part par accident. Un message suffit souvent."
          : "A subscriber who lapses without noticing leaves by accident. One message is usually enough."}
      </p>

      {expiring.length === 0 ? (
        <Notice tone="success" className="mt-4">
          {fr
            ? "Personne n'expire dans les prochains jours."
            : "Nobody is expiring in the next few days."}
        </Notice>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {expiring.map((entry) => {
            const wa = entry.phone ? whatsappNumber(entry.phone) : null;
            const message = reminderMessage(entry, price, fr ? "fr" : "en");

            return (
              <li
                key={`${entry.email}-${entry.proUntil}`}
                className="rounded-xl border border-line bg-white p-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-medium text-ink">{entry.email}</span>
                  <span
                    className={[
                      "shrink-0 rounded px-1.5 py-0.5 text-[11.5px] font-bold",
                      entry.daysLeft <= 0
                        ? "bg-[#FEE2E2] text-[#991B1B]"
                        : entry.daysLeft <= 1
                          ? "bg-[#FEF3C7] text-[#92400E]"
                          : "bg-violet-light text-violet-deep",
                    ].join(" ")}
                  >
                    {entry.daysLeft <= 0
                      ? fr
                        ? "expiré"
                        : "expired"
                      : entry.daysLeft === 1
                        ? fr
                          ? "demain"
                          : "tomorrow"
                        : fr
                          ? `dans ${entry.daysLeft} j`
                          : `in ${entry.daysLeft}d`}
                  </span>
                </div>

                {wa ? (
                  <a
                    href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-deep px-3 text-[14px] font-semibold text-white transition-colors hover:bg-violet-mid"
                  >
                    {fr ? "Rappeler sur WhatsApp" : "Remind on WhatsApp"}
                  </a>
                ) : (
                  <p className="mt-1.5 text-[12.5px] leading-5 text-ink-soft">
                    {fr
                      ? "Aucun numéro enregistré pour cette personne — ajoutez-en un à la prochaine activation."
                      : "No number recorded for this person — add one at the next activation."}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
