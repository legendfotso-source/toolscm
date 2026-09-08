"use client";

import { useEffect } from "react";

/**
 * Registers the service worker after the page is interactive, so it never
 * competes with the first paint on a slow device.
 *
 * Development is deliberately excluded: a stale cached bundle during local
 * work costs more time than the offline shell saves.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration is not worth interrupting anyone over: the
        // site works exactly the same without it.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
