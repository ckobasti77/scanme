// ScanMe Menu V1 (K33, security review B3) — the gateway argument a Next
// handler adds to its call of a public Menu function that takes a hash of the
// caller IP. Convex trusts that hash only together with the same secret
// (convex/lib/menuGateway.ts); without the env value nothing is sent and
// Convex behaves as before K33. Server-only by use: the value is not a
// NEXT_PUBLIC_ variable, so a browser bundle would only ever see undefined.

/** `{ gateway }` when MENU_GATEWAY_SECRET is set in the Next env, otherwise `{}`. */
export function menuGatewayArg(): { gateway?: string } {
  const secret = process.env.MENU_GATEWAY_SECRET?.trim();
  return secret ? { gateway: secret } : {};
}
