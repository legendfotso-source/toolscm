import "server-only";

/**
 * Who owns this platform — decided from the environment, never from the
 * database.
 *
 * This is one small module on purpose. Before it, "is this person the owner"
 * was answered in two different places, and both of them answered it by
 * reading a row with the service-role client. That has two consequences, one
 * of which cost days:
 *
 * **It makes the owner a database fact, so an ordinary admin operation can
 * take it away.** A column somebody else can UPDATE is not ownership. The
 * brief for this upgrade asks that the owner account "never be accidentally
 * downgraded, blocked, deleted, or restricted by ordinary admin operations",
 * and the only way to mean that is for the answer to live somewhere no
 * in-app operation can reach. An environment variable is that place: changing
 * it requires the Vercel dashboard, which is the platform account itself.
 *
 * **It makes the owner unreachable exactly when he is most needed.** If the
 * service-role key is missing, rotated, or rejected, `adminClient()` returns
 * null, `isAdmin()` returns false, and `/admin` answers 404 — the same 404 a
 * stranger gets. The person who could fix it is locked out by the fault he
 * would be fixing, and the page tells him nothing. On 1 October 2026 that cost
 * Fortune several days of looking in the wrong place, because the site was
 * also quietly serving unlimited free usage at the time (`getSettings()` falls
 * back to defaults with limits off, so the symptom was "no limits and no
 * admin" rather than "the database is unreachable").
 *
 * So: the owner is whoever `OWNER_EMAILS` names, full stop. No query, no
 * column, no round trip. The session is still verified — `currentUser()` calls
 * `getUser()`, which revalidates the token with Supabase rather than trusting
 * a cookie — so this is not a way in without signing in. It is a way for the
 * one named account to stay in.
 *
 * This is NOT a backdoor and must not become one. There is no hidden address,
 * no password, no header, no query parameter. The only thing that grants it is
 * a variable the platform owner sets on his own deployment, and the brief's
 * rule stands: nobody can escalate themselves to OWNER through a request.
 */

/** The addresses named as owners, lower-cased, in the order they were given. */
export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Is this address an owner?
 *
 * Case-insensitive and trimmed, because an address typed into a dashboard
 * field arrives with whatever spacing and capitalisation the person used, and
 * "Legendfotso@Gmail.com " must not be a different person.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const mine = (email ?? "").trim().toLowerCase();
  if (!mine) return false;
  return ownerEmails().includes(mine);
}

/** Is an owner configured at all? Used by the health page to say so. */
export function ownerConfigured(): boolean {
  return ownerEmails().length > 0;
}

/**
 * The three roles, weakest first.
 *
 * `USER` is everybody. `ADMIN` is operational: it comes from
 * `profiles.is_admin`, can be granted and revoked in the app, and is what a
 * future colleague would get. `OWNER` is the platform account itself and comes
 * only from the environment.
 *
 * Kept as a string union rather than a database enum because the two sources
 * are different in kind — one is a row, one is a deployment variable — and a
 * single enum column would invite writing `role = 'owner'` into a row, which
 * is exactly the escalation this module exists to prevent.
 */
export type Role = "user" | "admin" | "owner";

export const ROLE_RANK: Record<Role, number> = { user: 0, admin: 1, owner: 2 };

/** True when `have` is at least as privileged as `need`. */
export function roleAtLeast(have: Role, need: Role): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[need];
}
