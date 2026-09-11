"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { browserClient } from "@/lib/supabase/browser";
import { Badge, Button, ButtonLink, Notice, SectionHeading } from "./ui";
import { Breadcrumbs } from "./Breadcrumbs";

export function AccountContent({
  email,
  isPro,
  proUntil,
  configured,
}: {
  email: string | null;
  isPro: boolean;
  proUntil: string | null;
  configured: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    const client = browserClient();
    if (!client) return;
    setBusy(true);
    await client.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const until = proUntil
    ? new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(proUntil))
    : null;

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-lg">
        <Breadcrumbs items={[{ label: t("auth.accountTitle") }]} />
        <SectionHeading title={t("auth.accountTitle")} />

        {!configured ? (
          <Notice tone="warn">{t("auth.notConfigured")}</Notice>
        ) : (
          <>
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-[13px] uppercase tracking-wide text-ink-soft">
                {t("auth.email")}
              </p>
              <p className="mt-1 text-[15px] font-medium text-ink">{email}</p>

              <div className="mt-5 border-t border-line pt-5">
                <p className="text-[13px] uppercase tracking-wide text-ink-soft">
                  {t("auth.plan")}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[17px] font-bold text-ink">
                    {isPro ? t("auth.planPro") : t("auth.planFree")}
                  </span>
                  {isPro ? <Badge tone="violet">{t("auth.planPro")}</Badge> : null}
                </div>
                {isPro && until ? (
                  <p className="mt-1 text-[13.5px] text-ink-soft">
                    {t("auth.proUntil", { date: until })}
                  </p>
                ) : null}
              </div>
            </div>

            {!isPro ? (
              <Notice tone="info" className="mt-4">
                {t("pricing.comingSoonText")}
              </Notice>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/pricing" variant="secondary" size="lg" className="flex-1">
                {t("nav.pricing")}
              </ButtonLink>
              <Button variant="ghost" size="lg" onClick={signOut} disabled={busy}>
                {t("auth.signOut")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
