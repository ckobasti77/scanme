// Sajam 2026 B2 — the visitor cookie/HMAC helpers are server-only (MASTER §5:
// the token is never readable by client JS). Without a server condition the
// `server-only` marker throws, so a client bundle can never include them.

import { expect, test } from "vitest";

test("lib/fair-server modules refuse to load outside a server context", async () => {
  await expect(import("./visitor")).rejects.toThrow(/cannot be imported from a Client Component/);
  await expect(import("./gateway")).rejects.toThrow(/cannot be imported from a Client Component/);
});
