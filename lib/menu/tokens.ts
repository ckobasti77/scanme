// ScanMe Menu V1 (K20) — bearer tokens of the guest session and the guest
// device (plan K19 §1, K19-2). 256 random bits, base64url (43 characters).
// Only SHA-256 hashes reach the database; the raw token lives in an HttpOnly
// cookie. Pure Web Crypto (Convex runtime, Next handlers and tests alike).

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlOf(bytes: ArrayBuffer | Uint8Array): string {
  return base64Url(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/** A new 256-bit token. `random` is injectable for tests. */
export function newMenuToken(
  random: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length)),
): string {
  return base64Url(random(TOKEN_BYTES));
}

export function isMenuToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** Lowercase hex SHA-256 of a UTF-8 string. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The stored hash of a guest device key: scoped to ONE Menu service, so the
 * same browser is a different pseudonym in every venue (no cross-venue link).
 */
export async function deviceKeyHashFor(menuServiceId: string, deviceKey: string): Promise<string> {
  return await sha256Hex(`menu-device:${menuServiceId}:${deviceKey}`);
}

/** The stored hash of a session token. */
export async function sessionTokenHash(token: string): Promise<string> {
  return await sha256Hex(`menu-session:${token}`);
}
