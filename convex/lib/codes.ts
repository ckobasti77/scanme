// Public short codes (RFC-001 §2.4 C.4/C.9): Crockford base32, 8 characters,
// excluding I L O U so a printed code can be read back over the phone without
// ambiguity. Shared by `memoriesSpaces.code` (/m/[code]) and `cards.cardCode`
// (/r/[cardCode]). 32^8 ≈ 1.1e12 values — collisions are vanishingly rare, but
// insert paths must still verify uniqueness against their table's code index
// and retry with a fresh code (see cards.createCard / the Memories seeds).
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 8;

// `crypto.getRandomValues` is available in the default Convex runtime (and in
// the edge-runtime test environment). Rejection sampling is unnecessary: 256 %
// 32 === 0, so a plain modulo is exactly uniform over the alphabet.
export function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

// Normalize a user/URL-supplied code for lookup: uppercase, and map the
// excluded look-alikes to the digits they are mistaken for (Crockford decode
// rule: I/L → 1, O → 0; U is simply invalid). Returns null when the result is
// not a valid 8-character code, so resolvers can treat it as "unknown".
export function normalizeCode(raw: string): string | null {
  const mapped = raw
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (mapped.length !== CODE_LENGTH) return null;
  for (const char of mapped) {
    if (!CODE_ALPHABET.includes(char)) return null;
  }
  return mapped;
}
