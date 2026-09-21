"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { signInHref } from "@/lib/auth/access";
import { ButtonLink } from "./ui";

/**
 * Shown in place of a tool to a visitor who is not signed in.
 *
 * It takes the tool's place rather than covering it: nothing behind it is
 * usable, so nothing behind it is drawn. Both buttons bring the visitor back
 * to this exact tool once they are in, so the account costs them a detour,
 * not the thing they came for.
 */
export function SignInRequired({
  path,
  expired = false,
}: {
  /** The page to come back to after signing in. */
  path: string;
  /** The visitor WAS signed in and the session ran out mid-visit. */
  expired?: boolean;
}) {
  const { t } = useLocale();

  return (
    <div
      className="rounded-2xl border-2 border-dashed border-violet-border bg-violet-light px-5 py-10 text-center"
      role="region"
      aria-label={t("access.title")}
    >
      <p className="text-[17px] font-bold text-ink">
        {expired ? t("access.expiredTitle") : t("access.title")}
      </p>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-ink-soft">
        {expired ? t("access.expiredText") : t("access.text")}
      </p>
      <div className="mx-auto mt-5 flex max-w-md flex-col gap-2.5 sm:flex-row">
        <ButtonLink href={signInHref(path, "signup")} size="lg" className="flex-1">
          {t("auth.signUp")}
        </ButtonLink>
        <ButtonLink href={signInHref(path, "signin")} variant="secondary" size="lg" className="flex-1">
          {t("auth.signIn")}
        </ButtonLink>
      </div>
      {expired ? null : (
        <p className="mt-4 text-[12.5px] leading-5 text-ink-soft">{t("access.free")}</p>
      )}
    </div>
  );
}
