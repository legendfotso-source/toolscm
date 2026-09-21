"use client";

import { useCallback, useEffect, useState } from "react";
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
  prices: null,
};

export function useUsage() {
  // With no database configured there is nothing to ask and nothing to wait
  // for, so the answer is known from the first render — no request, no effect.
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<UsageState>({ ...NO_LIMIT, known: !configured });

  const refresh = useCallback(async () => {
    if (!configured) return;
    try {
      const response = await fetch(`/api/usage?deviceId=${encodeURIComponent(deviceId())}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setState({ ...NO_LIMIT, known: true });
        return;
      }
      const data = (await response.json()) as Omit<UsageState, "known">;
      setState({ ...NO_LIMIT, ...data, known: true });
    } catch {
      // Offline, or the endpoint is unreachable. Showing no counter is better
      // than showing a wrong one.
      setState({ ...NO_LIMIT, known: true });
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    // The state update happens after the await, once the server has answered —
    // this effect subscribes to an external system rather than cascading a
    // render.
    void (async () => {
      if (cancelled) return;
      await refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, refresh]);

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
          setState((previous) => ({ ...previous, ...data, known: true }));
          return { allowed: false, remaining: 0 };
        }

        if (!response.ok) return { allowed: true, remaining: -1 };

        const data = (await response.json()) as Omit<UsageState, "known">;
        setState((previous) => ({ ...previous, ...data, known: true }));
        return { allowed: true, remaining: data.remaining };
      } catch {
        return { allowed: true, remaining: -1 };
      }
    },
    [configured],
  );

  return { ...state, refresh, claim };
}
