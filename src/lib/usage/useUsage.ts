"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { TierId } from "@/lib/payments/tiers";
import { deviceId } from "./device";

export type UsageState = {
  /** -1 means no limit applies (Pro, limits off, or no database configured). */
  remaining: number;
  used: number;
  isPro: boolean;
  /** Which plan the SERVER says this person is on. Never set by the browser. */
  tier: TierId;
  /** Set by the server. A signpost to /admin, never the thing that guards it. */
  isAdmin: boolean;
  /**
   * Monthly price of each paid plan, as the server's settings have it. Null
   * until the server has answered, and when there is no server to ask.
   */
  prices: { pro: number; max: number } | null;
  /** False until we have heard from the server at least once. */
  known: boolean;
};

const NO_LIMIT: Omit<UsageState, "known"> = {
  remaining: -1,
  used: 0,
  isPro: false,
  // Free until the server says otherwise. Defaulting the other way would
  // hand out Pro batch sizes to everyone for the first second of every page.
  tier: "free",
  isAdmin: false,
  prices: null,
};

/**
 * One answer, shared by every component that asks.
 *
 * The plan is now needed in two places at once: the upload box, to print the
 * real size ceiling, and the header, to stop advertising Pro to somebody who
 * has already bought it. Two components calling this hook used to mean two
 * GETs of the same endpoint on every page load — on a free Supabase project,
 * doubled for nothing.
 *
 * So the state lives in the module and the components subscribe to it. The
 * first caller starts the request; the others wait for the same one. Anything
 * that learns something newer — a refresh, an operation that was counted —
 * publishes it to all of them, which is also why the counter in the header and
 * the counter on the page can no longer disagree.
 */
let shared: UsageState = { ...NO_LIMIT, known: false };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: UsageState): void {
  shared = next;
  for (const listener of listeners) listener();
}

async function load(): Promise<void> {
  try {
    const response = await fetch(`/api/usage?deviceId=${encodeURIComponent(deviceId())}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      publish({ ...NO_LIMIT, known: true });
      return;
    }
    const data = (await response.json()) as Omit<UsageState, "known">;
    publish({ ...NO_LIMIT, ...data, known: true });
  } catch {
    // Offline, or the endpoint is unreachable. Showing no counter is better
    // than showing a wrong one.
    publish({ ...NO_LIMIT, known: true });
  }
}

function subscribe(listener: () => void): () => void {
  const wrapped = () => listener();
  listeners.add(wrapped);
  return () => {
    listeners.delete(wrapped);
  };
}

/**
 * With no database configured there is nothing to ask and nothing to wait for.
 *
 * A module constant rather than a fresh object: `useSyncExternalStore` compares
 * snapshots by identity and would loop for ever on a new one each render.
 */
const NOTHING_TO_ASK: UsageState = { ...NO_LIMIT, known: true };

/**
 * The same, during server rendering.
 *
 * `known: false` on the server and on the first client render, so the markup
 * matches: a page rendered as "Max" on the server and "free" in the browser for
 * one frame is a hydration mismatch, and the components here all draw nothing
 * until `known` is true.
 */
const SERVER_SNAPSHOT: UsageState = { ...NO_LIMIT, known: false };

export function useUsage() {
  const configured = isSupabaseConfigured();

  const state = useSyncExternalStore(
    subscribe,
    () => (configured ? shared : NOTHING_TO_ASK),
    () => (configured ? SERVER_SNAPSHOT : NOTHING_TO_ASK),
  );

  const refresh = useCallback(async () => {
    if (!configured) return;
    inFlight = load().finally(() => {
      inFlight = null;
    });
    await inFlight;
  }, [configured]);

  useEffect(() => {
    // One request between all of them: a second component mounting while the
    // first one's call is still open waits for that call instead of making
    // another. Nothing is set here — `load` publishes to the store, and every
    // subscriber hears it.
    if (configured && !shared.known && !inFlight) {
      inFlight = load().finally(() => {
        inFlight = null;
      });
    }
  }, [configured]);

  /**
   * Ask permission for one operation.
   *
   * Returns true when the work may proceed. If the endpoint cannot be reached
   * at all, this deliberately returns true: a free file utility that refuses
   * to work because our counter is unreachable is worse than one that
   * occasionally gives away an extra operation.
   */
  const claim = useCallback(
    async (
      tool: string,
    ): Promise<{ allowed: boolean; remaining: number; signInRequired?: boolean }> => {
      if (!configured) return { allowed: true, remaining: -1 };

      try {
        const response = await fetch("/api/usage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId: deviceId(), tool }),
        });

        // The session has expired, or was never there. Unlike an unreachable
        // server, this is a real "no": the operation must not go ahead.
        if (response.status === 401) {
          return { allowed: false, remaining: 0, signInRequired: true };
        }

        if (response.status === 402) {
          const data = (await response.json()) as Omit<UsageState, "known">;
          // Merged, not replaced: the POST answer carries no prices, and the
          // paywall that opens next needs the ones the GET brought.
          publish({ ...shared, ...data, known: true });
          return { allowed: false, remaining: 0 };
        }

        if (!response.ok) return { allowed: true, remaining: -1 };

        const data = (await response.json()) as Omit<UsageState, "known">;
        publish({ ...shared, ...data, known: true });
        return { allowed: true, remaining: data.remaining };
      } catch {
        return { allowed: true, remaining: -1 };
      }
    },
    [configured],
  );

  return { ...state, refresh, claim };
}
