// ScanMe Menu V1 — stable entity keys (K01 A3). Every draft entity carries a
// `key` that never changes: published versions, QR links, requests and
// analytics refer to keys, so restoring a version or migrating data never
// breaks them. 12 characters of lowercase Crockford base32 (60 bits) after a
// per-type prefix; collisions inside one service are negligible.

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const KEY_LENGTH = 12;

export const MENU_KEY_PREFIX = {
  page: "pg",
  section: "sc",
  article: "ar",
  roomServiceCategory: "rc",
} as const;
export type MenuKeyKind = keyof typeof MENU_KEY_PREFIX;

export type RandomBytes = (length: number) => Uint8Array;

const cryptoRandomBytes: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));

/** A new key, e.g. `ar_5k2m9q0x7c1d`. `random` is injectable for tests. */
export function newMenuKey(
  kind: MenuKeyKind,
  random: RandomBytes = cryptoRandomBytes,
): string {
  const bytes = random(KEY_LENGTH);
  let body = "";
  for (let index = 0; index < KEY_LENGTH; index += 1) {
    body += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return `${MENU_KEY_PREFIX[kind]}_${body}`;
}

const KEY_PATTERN = /^(pg|sc|ar|rc)_[0-9a-hjkmnp-tv-z]{12}$/;

export function isMenuKey(value: string, kind?: MenuKeyKind): boolean {
  if (!KEY_PATTERN.test(value)) return false;
  return kind ? value.startsWith(`${MENU_KEY_PREFIX[kind]}_`) : true;
}
