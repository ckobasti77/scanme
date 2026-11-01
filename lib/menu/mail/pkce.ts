// ScanMe Menu V1 (K26) — PKCE helpers (RFC 7636) for the mail OAuth flow.
// Web APIs only (crypto, btoa, TextEncoder), so it runs in the browser and in the Convex default runtime.

export const PKCE_VERIFIER_LENGTH = 64;

// base64url without "=" padding
export function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 48 random bytes become exactly 64 base64url characters
export function newCodeVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

export function isCodeVerifier(value: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(value);
}

// S256: base64url(SHA-256(ASCII bytes of the verifier))
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlFromBytes(new Uint8Array(digest));
}
