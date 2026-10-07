/**
 * Who may trigger the scheduled run.
 *
 * Its own module, with no imports at all, so it can be compiled and tested on
 * its own — and so the one decision that must never fail open can be asserted
 * directly rather than inferred from a route's behaviour under one particular
 * configuration. The route adds the second way in (the signed-in owner); this
 * is the machine's way in, and the only one a stranger could reach.
 *
 * `/api/cron/daily` sends mail to customers and writes to the database. It is
 * the only route in the project whose caller cannot be a session, so it is a
 * shared secret — and the whole security of it is in these few lines.
 *
 * **With no secret configured, nothing passes. Including the platform.** The
 * tempting alternative — "no secret set, so let the scheduler through" —
 * publishes an endpoint that anybody who can type a URL may use to send mail
 * to customers. A scheduled job that is not running is a problem the health
 * panel reports on the owner's own screen; an open one is a problem somebody
 * else finds first.
 *
 * The comparison looks at length first and then at every character, so how
 * long it takes does not depend on how many leading characters were guessed
 * right.
 */
export function bearerMatches(header: string | null | undefined, secret: string): boolean {
  const expected = (secret ?? "").trim();
  if (!expected) return false;

  const presented = (header ?? "").trim();
  if (!presented.startsWith("Bearer ")) return false;

  const token = presented.slice(7).trim();
  if (token.length !== expected.length) return false;

  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}
