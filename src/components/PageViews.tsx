"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

/**
 * Counts one view per page the visitor actually lands on.
 *
 * It renders nothing and is mounted once in the root layout. Two details that
 * look small and are not:
 *
 *   - `usePathname` rather than a one-off effect, because moving from the home
 *     page to a tool never reloads the document. Without this, everything
 *     after the first page of a visit would be invisible.
 *   - a ref holding the last path counted, because React runs effects twice in
 *     development and would otherwise double every figure the admin reads.
 *
 * /admin counts itself out. The one person guaranteed to open it every day is
 * the owner, and an audience report that quietly includes the owner is a
 * report that flatters him.
 */
export function PageViews() {
  const pathname = usePathname();
  const lastCounted = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;
    if (lastCounted.current === pathname) return;

    lastCounted.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
