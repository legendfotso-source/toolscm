"use client";

const STORAGE_KEY = "toolscm.device";

/**
 * An anonymous identifier for this browser.
 *
 * It is a random value with no personal information in it, generated on the
 * device and never derived from anything about the person. It exists to count
 * free operations, nothing else.
 *
 * Clearing browser storage resets it, and we know that. The server also keeps
 * a much looser ceiling per network as abuse protection, but that ceiling can
 * never be tight — mobile networks in Cameroon share IP addresses between very
 * many people, and blocking on that basis would turn away innocent users. The
 * honest position is that the free limit is a speed bump, not a wall, and the
 * product is not designed to depend on it being unbeatable.
 */
export function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-z0-9-]{16,64}$/i.test(existing)) return existing;

    const created = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Private browsing, or storage disabled. A per-session id still lets the
    // page work; it simply does not persist.
    return sessionDeviceId();
  }
}

let sessionId: string | null = null;

function sessionDeviceId(): string {
  sessionId ??= crypto.randomUUID();
  return sessionId;
}
