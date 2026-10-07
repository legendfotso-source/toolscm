/**
 * Is this an address we could actually reply to?
 *
 * Its own module, with no imports at all, so it can be compiled and tested on
 * its own — and so nothing about it depends on a database, a provider or a
 * request. Not marked server-only: the browser runs the same check to disable
 * the button, and the two agreeing is the point.
 *
 * Deliberately not an RFC 5322 regex. Those either reject real addresses —
 * which, on a contact form, means turning away the customer who most wants to
 * reach you — or accept everything anyway after enough patching. The only
 * thing worth asserting is the shape that makes a reply possible: something,
 * an @, something, a dot, something, and no spaces.
 */
export function looksLikeEmail(value: string): boolean {
  const trimmed = (value ?? "").trim();
  if (trimmed.length < 3 || trimmed.length > 320) return false;
  if (/\s/.test(trimmed)) return false;
  // A single @, and at least one dot after it: "user@gmail" has nowhere to
  // deliver to, however plausible it looks.
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(trimmed);
}
