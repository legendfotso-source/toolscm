/**
 * Who may use the tools.
 *
 * Tools.cm requires an account to USE a tool. Everything else — the home page,
 * each tool's page and explanations, pricing, guides, the legal pages, sign-in
 * and sign-up — stays public, so search engines can still index the site and
 * a visitor can see what they get before creating an account.
 *
 * With no Supabase configured there are no accounts at all (local development,
 * or a deployment that has not been set up yet). Requiring one then would lock
 * everybody out of a site that has no way to let them in, so the rule applies
 * only when accounts exist.
 *
 * Where it is enforced, stated honestly:
 *   - in the browser, the tool is replaced by a sign-in panel and its code is
 *     never even downloaded;
 *   - on the server, /api/usage refuses to authorise an operation without a
 *     signed-in session, and every tool that takes a file asks it first.
 * The files themselves are processed in the browser and never reach the
 * server, so someone who rewrites the page's JavaScript on their own machine
 * can still run it there. That is the price of the privacy promise, and it is
 * the same for the daily limit.
 */

/** Must the visitor be signed in to use a tool? */
export function accountRequired(accountsConfigured: boolean): boolean {
  return accountsConfigured;
}

/** The server's answer to "may this caller run an operation?" */
export function signInGate(
  accountsConfigured: boolean,
  userId: string | null,
): "ok" | "sign_in_required" {
  return accountRequired(accountsConfigured) && !userId ? "sign_in_required" : "ok";
}

/**
 * A path on THIS site to go back to after signing in, or the fallback.
 *
 * `next` arrives in a URL anyone can craft. Anything that is not a plain local
 * path is refused: "//evil.example" and "/\evil.example" both start with a
 * slash and are both read by browsers as a different website — the classic
 * open redirect, which would let a phishing link carry our address.
 */
export function safeNext(value: string | null | undefined, fallback = "/account"): string {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  // Control characters (tab, newline) are stripped by URL parsers, which can
  // turn "/\t/evil.example" into "//evil.example" after this check.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return fallback;
  }
  return value;
}

/** The sign-in (or sign-up) address that brings the visitor back to `path`. */
export function signInHref(path: string, page: "signin" | "signup" = "signin"): string {
  return `/${page}?next=${encodeURIComponent(safeNext(path, "/"))}`;
}
