"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ButtonLink } from "./ui";

export function OfflineContent() {
  const { locale } = useLocale();

  return (
    <div className="container-page py-20 text-center">
      <div className="mx-auto max-w-md">
        <span className="text-[40px]" aria-hidden="true">
          📡
        </span>
        <h1 className="mt-3 text-[24px] font-bold text-ink">
          {locale === "fr" ? "Vous êtes hors connexion" : "You are offline"}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-ink-soft">
          {locale === "fr"
            ? "Cette page n'a pas encore été consultée, nous ne pouvons donc pas l'afficher sans connexion. Les pages que vous avez déjà ouvertes restent accessibles."
            : "This page has not been visited yet, so we cannot show it without a connection. Pages you have already opened remain available."}
        </p>
        <ButtonLink href="/" size="lg" className="mt-6">
          {locale === "fr" ? "Retour à l'accueil" : "Back to home"}
        </ButtonLink>
      </div>
    </div>
  );
}
