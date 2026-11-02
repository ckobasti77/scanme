// ScanMe Menu V1 (K26) — encryption of the venue mailbox tokens (plan
// docs/meni/planovi/K24.md K24-17). The AES-256-GCM primitives are the ones
// of the admin mailbox (./adminMailCrypto.ts, imported, never changed); the
// key is MENU_MAIL_TOKEN_KEY and the additional data binds a ciphertext to
// its purpose, Menu service, provider and mailbox address (or, for the PKCE
// verifier, the hash of its one-time state). A ciphertext copied to another
// service, provider, address or slot does not decrypt.

import {
  decryptAdminMailSecret,
  encryptAdminMailSecret,
  importAdminMailKey,
  type AdminMailCiphertext,
} from "./adminMailCrypto";

export const MENU_MAIL_KEY_VERSION = 1;

export type MenuMailSecretPurpose = "refresh" | "access" | "verifier";

export function menuMailAad(args: {
  purpose: MenuMailSecretPurpose;
  menuServiceId: string;
  provider: string;
  /** The mailbox address (tokens) or the state hash (the PKCE verifier). */
  binding: string;
}): string {
  return `scanme-menu-mail:v${MENU_MAIL_KEY_VERSION}:${args.purpose}:${args.menuServiceId}:${args.provider}:${args.binding.toLowerCase()}`;
}

export async function sealMenuMailSecret(rawKey: Uint8Array, plaintext: string, aad: string): Promise<AdminMailCiphertext> {
  return await encryptAdminMailSecret(await importAdminMailKey(rawKey), plaintext, aad);
}

/** Throws AdminMailCryptoError (no detail) for a wrong key, binding or damaged record. */
export async function openMenuMailSecret(rawKey: Uint8Array, sealed: AdminMailCiphertext, aad: string): Promise<string> {
  return await decryptAdminMailSecret(await importAdminMailKey(rawKey), sealed, aad);
}
