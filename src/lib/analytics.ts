"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Recording that something happened, without ever recording what it was.
 *
 * Three rules, all of which matter more here than on a site whose visitors
 * have fast connections and unmetered data:
 *
 *   1. Never block. The call is fired and forgotten; a tool must never wait on
 *      it, and a failure must never surface to the visitor.
 *   2. Never cost the visitor anything noticeable. `sendBeacon` where it
 *      exists, so the request survives the page being closed and does not
 *      compete with the actual work for bandwidth.
 *   3. Never carry content. The payload can hold a tool id, an event name, a
 *      duration and one of our own error keys. There is no field a filename
 *      could occupy.
 */
export type ToolEvent = "start" | "success" | "error";

export function track(
  tool: string,
  event: ToolEvent,
  extra?: { durationMs?: number; errorKey?: string },
): void {
  // Nothing to send to, so do not even build the request.
  if (!isSupabaseConfigured()) return;

  send("/api/events", JSON.stringify({ tool, event, ...extra }));
}

/**
 * Count one page view.
 *
 * The path is the only thing sent. Everything that describes the visitor —
 * country, phone or computer, which site linked here — is read from the
 * request on the server, where the browser cannot influence it, and the
 * identifier it is counted against is re-salted every day.
 */
export function trackPageView(path: string): void {
  if (!isSupabaseConfigured()) return;

  send("/api/views", JSON.stringify({ path }));
}

/** Fire and forget, cheaply, and never let it surface to the visitor. */
function send(url: string, body: string): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* analytics are never worth an error a person can see */
    });
  } catch {
    /* likewise */
  }
}
