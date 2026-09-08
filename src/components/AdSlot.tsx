"use client";

import { ADSENSE_CLIENT } from "@/lib/site";

export type AdPlacement = "tool-top" | "tool-bottom" | "home-mid";

/**
 * Renders nothing at all until AdSense is genuinely configured and approved.
 *
 * No placeholder box, no "advertisement" frame, no reserved grey rectangle —
 * an empty slot pretending to be an ad is exactly the kind of dressing-up this
 * product is built to avoid. Set NEXT_PUBLIC_ADSENSE_CLIENT to switch it on.
 */
export function AdSlot({ placement }: { placement: AdPlacement }) {
  if (!ADSENSE_CLIENT) return null;

  return (
    <div className="my-6" data-ad-placement={placement}>
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
