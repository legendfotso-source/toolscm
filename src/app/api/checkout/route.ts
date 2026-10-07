import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server-client";
import { getSettings } from "@/lib/settings";
import { planForTier } from "@/lib/payments/plans";
import { tierName, type TierId } from "@/lib/payments/tiers";
import { attachProviderRef, createPendingPayment } from "@/lib/payments/core";
import { initialisePayment, notchpayConfigured } from "@/lib/payments/providers/notchpay";
import { campayConfigured, createPaymentLink } from "@/lib/payments/providers/campay";
import { createCheckoutSession, stripeConfigured } from "@/lib/payments/providers/stripe";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.enum(["notchpay", "campay", "stripe"]),
  plan: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  // The browser may choose WHICH paid plan, but not what it costs — the
  // price is computed below from the server's own settings.
  tier: z.enum(["pro", "max"]).default("pro"),
});

/**
 * Start a payment.
 *
 * Three things are decided here, all on the server: who the customer is (from
 * the session cookie, never from the request body), what the plan costs (from
 * settings, never from the request body), and what reference the payment
 * carries (generated here, stored against the user before they leave).
 *
 * The browser chooses only the provider and the plan length — the two things
 * it is allowed to have an opinion about.
 */
export async function POST(request: Request) {
  const settings = await getSettings();
  if (!settings.payments_enabled) {
    return NextResponse.json({ error: "payments_disabled" }, { status: 409 });
  }

  const user = await currentUser();
  if (!user?.email) {
    // Payments need an account: without one there is nothing to attach the
    // subscription to, and no way for the customer to prove later what they
    // bought.
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { provider, plan: planId, tier } = parsed.data;

  // The same function the pricing page and the checkout buttons use, so the
  // amount charged here is the amount the customer was shown.
  const plan = planForTier(settings, tier, planId);

  if (provider === "notchpay" && !notchpayConfigured()) {
    return NextResponse.json({ error: "provider_unavailable" }, { status: 409 });
  }
  if (provider === "campay" && !campayConfigured()) {
    return NextResponse.json({ error: "provider_unavailable" }, { status: 409 });
  }
  if (provider === "stripe" && !stripeConfigured()) {
    return NextResponse.json({ error: "provider_unavailable" }, { status: 409 });
  }

  // Stripe is billed in USD; NotchPay in XAF. Mixing them into one number
  // would make the revenue figure meaningless, so each payment records the
  // currency it was actually taken in.
  //
  // Both amounts come from the SAME plan, so the discount the button advertises
  // is the discount the card is charged. Computing the dollar price separately
  // here is how that silently stopped being true once already.
  const currency = provider === "stripe" ? "USD" : "XAF";
  const amount = provider === "stripe" ? Math.max(50, plan.amountUsdCents) : plan.amountXaf;

  const reference = `tcm_${randomUUID().replace(/-/g, "")}`;

  try {
    await createPendingPayment({
      userId: user.id,
      provider,
      reference,
      amount,
      currency,
      days: plan.days,
      tier,
      meta: { plan: planId },
    });

    const returnUrl = `${SITE_URL}/payment/return?provider=${provider}&reference=${encodeURIComponent(reference)}`;

    if (provider === "campay") {
      const link = await createPaymentLink({
        amount,
        currency,
        description: `Tools.cm ${tierName(tier as TierId, true)} — ${plan.days} jours`,
        externalReference: reference,
        email: user.email,
        redirectUrl: returnUrl,
        failureRedirectUrl: `${SITE_URL}/pricing?cancelled=1`,
      });

      // CamPay's status endpoint takes THEIR reference, which only exists
      // once the link has been created. Store it before the customer leaves.
      await attachProviderRef("campay", reference, link.providerReference);
      return NextResponse.json({ url: link.url });
    }

    if (provider === "notchpay") {
      const result = await initialisePayment({
        amount,
        currency,
        email: user.email,
        reference,
        description: `Tools.cm ${tierName(tier as TierId, true)} — ${plan.days} jours`,
        callbackUrl: returnUrl,
      });
      return NextResponse.json({ url: result.authorizationUrl });
    }

    const session = await createCheckoutSession({
      amount,
      currency,
      email: user.email,
      reference,
      description: `Tools.cm Pro — ${plan.days} days`,
      successUrl: returnUrl,
      cancelUrl: `${SITE_URL}/pricing?cancelled=1`,
    });

    // Stored before the customer leaves, exactly as CamPay's reference is.
    // This is what lets the return page ask Stripe whether the payment went
    // through, instead of waiting for a webhook that may never arrive.
    if (session.sessionId) {
      await attachProviderRef("stripe", reference, session.sessionId);
    }
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Tools.cm] checkout failed:", error);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
