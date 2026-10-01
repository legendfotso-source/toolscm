"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { browserClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { initialFor, useAuthUser } from "@/lib/useAuthUser";
import { useUsage } from "@/lib/usage/useUsage";
import { cx } from "./ui";

/**
 * The way into an account, from every page.
 *
 * This is here because it was missing, and its absence looked like a much
 * bigger bug than it was: sign-in worked perfectly, Google included, but
 * nothing on the site linked to /signin. Somebody opening Tools.cm could not
 * find the door, so the honest report was "there is no Google sign-in" — and
 * from the outside that is exactly what it looked like.
 *
 * With no database configured the whole thing renders nothing: there are no
 * accounts to sign in to, and an account button that leads to a page saying
 * "accounts are not available" is worse than no button.
 */
export function AccountMenu({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const { t } = useLocale();
  const router = useRouter();
  const { user, known } = useAuthUser();
  const { isAdmin } = useUsage();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // Close on a click anywhere else, and on Escape. A menu that traps you is a
  // menu people learn not to open.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!isSupabaseConfigured()) return null;

  // Nothing is rendered until Supabase has answered. Flashing "Se connecter"
  // at somebody who is already signed in reads as a broken site.
  if (!known) {
    return <span className={variant === "desktop" ? "h-9 w-9" : "h-11 w-full"} aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        href="/signin"
        className={cx(
          "font-medium text-ink-soft transition-colors hover:text-ink",
          variant === "desktop"
            ? "rounded-lg px-3 py-2 text-[14px] hover:bg-surface-alt"
            : "rounded-lg px-3 py-3 text-[15px] text-ink hover:bg-surface-alt",
        )}
      >
        {t("auth.signIn")}
      </Link>
    );
  }

  const signOut = async () => {
    setSigningOut(true);
    await browserClient()?.auth.signOut();
    setOpen(false);
    setSigningOut(false);
    // Refresh rather than push: server components that read the session (the
    // account page, /admin) have to be re-rendered, not just navigated past.
    router.refresh();
    router.push("/");
  };

  // On a phone the menu is already a vertical list, so a second dropdown
  // inside it would be a menu inside a menu. The links go straight in.
  if (variant === "mobile") {
    return (
      <>
        <Link
          href="/account"
          className="flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-surface-alt"
        >
          <Avatar user={user} size={28} />
          <span className="min-w-0 flex-1 truncate">{user.email}</span>
        </Link>
        {isAdmin ? (
          <Link
            href="/admin"
            className="rounded-lg px-3 py-3 text-[15px] font-semibold text-violet-deep hover:bg-surface-alt"
          >
            {t("auth.adminLink")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="rounded-lg px-3 py-3 text-left text-[15px] font-medium text-ink-soft hover:bg-surface-alt hover:text-ink disabled:opacity-60"
        >
          {t("auth.signOut")}
        </button>
      </>
    );
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("auth.account")}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line transition-colors hover:border-violet-border"
      >
        <Avatar user={user} size={32} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-line bg-white shadow-lg"
        >
          <div className="border-b border-line px-4 py-3">
            {user.name ? (
              <p className="truncate text-[13.5px] font-bold text-ink">{user.name}</p>
            ) : null}
            <p className="truncate text-[12.5px] text-ink-soft">{user.email}</p>
          </div>

          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[13.5px] font-medium text-ink hover:bg-surface-alt"
          >
            {t("auth.account")}
          </Link>

          {/* The way in to /admin from anywhere on the site. It is a signpost
              and nothing more: /admin and both of its endpoints still answer
              notFound() to anybody the server does not know as an
              administrator, whatever the browser believes. */}
          {isAdmin ? (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-[13.5px] font-semibold text-violet-deep hover:bg-surface-alt"
            >
              {t("auth.adminLink")}
            </Link>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="block w-full px-4 py-2.5 text-left text-[13.5px] font-medium text-ink-soft hover:bg-surface-alt hover:text-ink disabled:opacity-60"
          >
            {t("auth.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The person's picture, or the first letter of their name.
 *
 * Google's avatar is a plain `img` rather than next/image on purpose: it comes
 * from a host we do not control and would otherwise need to be added to the
 * image config, where a change on their side becomes a broken build on ours.
 */
function Avatar({ user, size }: { user: { avatarUrl: string | null; email: string; name: string | null }; size: number }) {
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-full bg-violet-light font-bold text-violet-deep"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
    >
      {initialFor({ ...user, id: "", provider: "" })}
    </span>
  );
}
