// Admin UX Z1 — encryption of the personal Zoho mailbox tokens
// (ADMIN-UX-ZAHTEVI §10 "refresh token se čuva šifrovano"). AES-256-GCM with
// the key from the Convex env ZOHO_TOKEN_ENCRYPTION_KEY (base64, 32 bytes), a
// fresh 12-byte IV per record and additional data that binds the ciphertext to
// its owner, mailbox and purpose: a ciphertext copied to another admin's row,
// another mailbox or the other token slot does not decrypt. Web Crypto only —
// it runs in the default Convex runtime, no "use node".

export const ADMIN_MAIL_KEY_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type AdminMailTokenPurpose = "refresh" | "access";
export type AdminMailCiphertext = { ciphertext: string; iv: string };

/** Thrown for a wrong key, a wrong binding or a damaged record. Carries no detail. */
export class AdminMailCryptoError extends Error {
  constructor() {
    super("admin_mail_crypto_failed");
    this.name = "AdminMailCryptoError";
  }
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The raw key bytes, or null when the env value is missing or not 32 bytes of base64. */
export function decodeAdminMailKey(raw: string | undefined): Uint8Array | null {
  const value = raw?.trim();
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const bytes = base64ToBytes(value);
    return bytes.length === KEY_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

export function importAdminMailKey(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function adminMailTokenAad(args: {
  ownerUserId: string;
  primaryEmail: string;
  purpose: AdminMailTokenPurpose;
}) {
  return `scanme-admin-mail:v${ADMIN_MAIL_KEY_VERSION}:${args.purpose}:${args.ownerUserId}:${args.primaryEmail}`;
}

export async function encryptAdminMailSecret(
  key: CryptoKey,
  plaintext: string,
  aad: string,
): Promise<AdminMailCiphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: bytesToBase64(new Uint8Array(sealed)), iv: bytesToBase64(iv) };
}

export async function decryptAdminMailSecret(
  key: CryptoKey,
  sealed: AdminMailCiphertext,
  aad: string,
): Promise<string> {
  try {
    const iv = base64ToBytes(sealed.iv);
    if (iv.length !== IV_BYTES) throw new AdminMailCryptoError();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: new TextEncoder().encode(aad) },
      key,
      base64ToBytes(sealed.ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new AdminMailCryptoError();
  }
}

/** base64url nonce of the OAuth `state` (only its SHA-256 is stored). */
export function randomAdminMailState() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
