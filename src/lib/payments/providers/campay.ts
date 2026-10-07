import "server-only";

/**
 * CamPay — Cameroonian, built for MTN and Orange Money.
 *
 * Written against their published API and their own SDKs:
 *
 *   POST {host}/api/token/                  { username, password } → { token }
 *   POST {host}/api/get_payment_link/       → { link, reference }
 *   GET  {host}/api/transaction/{reference} → { status, amount, currency,
 *                                               external_reference, ... }
 *
 * Every call after the token carries `Authorization: Token <token>`.
 * Hosts: https://demo.campay.net while testing, https://campay.net live.
 *
 * ONE IMPORTANT DIFFERENCE from the other providers. CamPay does not publish a
 * webhook signing scheme, so this integration never trusts a webhook. The
 * notification is treated as nothing more than a nudge saying "go and look";
 * the answer always comes from the status endpoint, over an authenticated
 * call, using CamPay's own reference.
 *
 * That is safe by construction rather than by secrecy: a forged notification
 * causes us to ask CamPay about a payment, and CamPay says PENDING or FAILED,
 * and nothing is granted. It costs one extra HTTP request and removes the need
 * to guess at a signature format — guessing would be the dangerous option,
 * because a signature check that is subtly wrong feels safe while protecting
 * nothing.
 */

const LIVE = "https://campay.net";
const SANDBOX = "https://demo.campay.net";

function host(): string {
  if (process.env.CAMPAY_BASE_URL) return process.env.CAMPAY_BASE_URL.replace(/\/$/, "");
  // Sandbox unless someone deliberately says otherwise. Defaulting to live
  // would mean a mistyped variable quietly takes real money.
  return process.env.CAMPAY_ENVIRONMENT === "PROD" ? LIVE : SANDBOX;
}

export function campayConfigured(): boolean {
  return Boolean(process.env.CAMPAY_USERNAME && process.env.CAMPAY_PASSWORD);
}

/** Which CamPay this deployment is talking to, in one word. */
export function campayEnvironment(): "live" | "sandbox" {
  return host() === LIVE ? "live" : "sandbox";
}

export type CampayDiagnosis = {
  configured: boolean;
  environment: "live" | "sandbox";
  host: string;
  /** null when the credentials were never tried, because there are none. */
  credentials: "accepted" | "refused" | "unreachable" | null;
  /** Safe to show: the HTTP status and CamPay's own words, never a secret. */
  detail: string;
};

/**
 * Can this deployment actually talk to CamPay?
 *
 * There are three ways the payment path is broken that look identical from
 * outside, and the one visible symptom of all three is a customer saying the
 * payment page did not open:
 *
 *   no credentials at all — checkout never starts;
 *   credentials for the OTHER environment — demo username against the live
 *     host, or the reverse, which is the most likely mistake of the three
 *     because the two accounts are separate and the variables are not;
 *   credentials that were revoked or mistyped.
 *
 * Asking for a token distinguishes them, and a token request is the cheapest
 * authenticated call CamPay has. The token itself is thrown away — the point
 * is whether one was issued, never its value.
 *
 * The module-level token cache is deliberately NOT consulted or filled here: a
 * cached token would make this report that credentials are accepted for up to
 * five minutes after they stopped being, which is the opposite of what a
 * diagnostic is for.
 */
export async function campayDiagnosis(): Promise<CampayDiagnosis> {
  const environment = campayEnvironment();
  const base = host();

  if (!campayConfigured()) {
    return {
      configured: false,
      environment,
      host: base,
      credentials: null,
      detail: "CAMPAY_USERNAME and CAMPAY_PASSWORD are not both set",
    };
  }

  try {
    const response = await fetch(`${base}/api/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.CAMPAY_USERNAME,
        password: process.env.CAMPAY_PASSWORD,
      }),
      cache: "no-store",
      // The admin page awaits this. Without a ceiling, a CamPay outage would
      // stop /admin rendering at all — and /admin is where you go to find out
      // that CamPay is down.
      signal: AbortSignal.timeout(6000),
    });

    const payload = (await response.json().catch(() => null)) as
      | { token?: string; detail?: string; non_field_errors?: string[] }
      | null;

    if (response.ok && payload?.token) {
      return {
        configured: true,
        environment,
        host: base,
        credentials: "accepted",
        detail: `${base} issued a token`,
      };
    }

    const said =
      payload?.detail ??
      payload?.non_field_errors?.join(" ") ??
      "no token in the response";

    return {
      configured: true,
      environment,
      host: base,
      credentials: "refused",
      detail: `${base} answered ${response.status}: ${said}`,
    };
  } catch (error) {
    // A network fault is not a credential fault, and saying so matters: the
    // fix for one is a new API password and the fix for the other is waiting.
    return {
      configured: true,
      environment,
      host: base,
      credentials: "unreachable",
      detail: `could not reach ${base}: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

/**
 * Fetch an access token.
 *
 * Cached for a few minutes because every other call needs one, and asking for
 * a fresh token on each request would double the latency of checkout on a
 * connection that is already slow. Short enough that a rotated credential
 * takes effect quickly.
 */
let cached: { token: string; until: number } | null = null;
const TOKEN_TTL_MS = 5 * 60 * 1000;

async function token(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;

  const response = await fetch(`${host()}/api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.CAMPAY_USERNAME,
      password: process.env.CAMPAY_PASSWORD,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as { token?: string } | null;
  if (!response.ok || !payload?.token) {
    throw new Error(
      `CamPay refused the credentials (${response.status}). Check CAMPAY_USERNAME and CAMPAY_PASSWORD, and the environment.`,
    );
  }

  cached = { token: payload.token, until: Date.now() + TOKEN_TTL_MS };
  return payload.token;
}

export type CampayLink = {
  url: string;
  /** CamPay's own reference. The status endpoint takes this, not ours. */
  providerReference: string;
};

/**
 * Create a payment page for the customer.
 *
 * `external_reference` is our reference — the one already stored against the
 * user as a pending payment. CamPay echoes it back in the status response,
 * which is how a notification is matched to an account without trusting
 * anything in the redirect.
 */
export async function createPaymentLink(input: {
  amount: number;
  currency: string;
  description: string;
  externalReference: string;
  email: string;
  redirectUrl: string;
  failureRedirectUrl: string;
}): Promise<CampayLink> {
  const response = await fetch(`${host()}/api/get_payment_link/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // CamPay rejects decimals outright (their error ER201), and XAF has no
      // minor unit anyway, so this is always a whole number of francs.
      amount: String(Math.round(input.amount)),
      currency: input.currency,
      description: input.description,
      external_reference: input.externalReference,
      redirect_url: input.redirectUrl,
      failure_redirect_url: input.failureRedirectUrl,
      email: input.email,
      // Both, so the customer chooses at CamPay's page rather than here. A
      // person on Orange should never be shown only an MTN option.
      payment_options: "MOMO,CARD",
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    link?: string;
    reference?: string;
    message?: string;
  } | null;

  if (!response.ok || !payload?.link || !payload.reference) {
    throw new Error(
      `CamPay refused the payment link (${response.status}): ${payload?.message ?? "no link returned"}`,
    );
  }

  return { url: payload.link, providerReference: payload.reference };
}

/** The only status meaning the money actually arrived. */
const SETTLED = "SUCCESSFUL";

export type CampayStatus = {
  paid: boolean;
  status: string;
  amount: number | null;
  currency: string | null;
  /** Our own reference, echoed back — how the payment is matched to an account. */
  externalReference: string | null;
};

/**
 * Ask CamPay what really happened.
 *
 * This is the only thing in the CamPay path that is believed. Anything that
 * arrives by webhook or in a redirect is a hint that this should be called.
 */
export async function verifyPayment(providerReference: string): Promise<CampayStatus> {
  const response = await fetch(
    `${host()}/api/transaction/${encodeURIComponent(providerReference)}/`,
    {
      headers: { Authorization: `Token ${await token()}` },
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    status?: string;
    amount?: number | string;
    currency?: string;
    external_reference?: string;
  } | null;

  if (!response.ok || !payload) {
    return {
      paid: false,
      status: `unreachable_${response.status}`,
      amount: null,
      currency: null,
      externalReference: null,
    };
  }

  const status = String(payload.status ?? "unknown").toUpperCase();
  const amount = typeof payload.amount === "string" ? Number(payload.amount) : payload.amount;

  return {
    // Strict equality. PENDING, FAILED and anything they add later all mean
    // "do not grant".
    paid: status === SETTLED,
    status,
    amount: Number.isFinite(amount) ? (amount as number) : null,
    currency: payload.currency ?? null,
    externalReference: payload.external_reference ?? null,
  };
}
