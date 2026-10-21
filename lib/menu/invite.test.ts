// ScanMe Menu V1 (K28) — the invitation helpers of Tim i pristupi: the stored hash lives in its own namespace, the address is
// normalized, the path is the panel route and the state of a row is decided at the exact boundary of its term.

import { describe, expect, test } from "vitest";
import {
  MENU_INVITE_TTL_MS,
  invitePath,
  inviteState,
  inviteTokenHash,
  normalizeInviteEmail,
  type InviteRowState,
} from "./invite";
import {
  deviceKeyHashFor,
  newMenuToken,
  reservationCancelTokenHash,
  sessionTokenHash,
  sha256Hex,
  staffSessionTokenHash,
} from "./tokens";

describe("inviteTokenHash", () => {
  test("is deterministic, 64 lowercase hex characters, and depends on the token", async () => {
    const token = newMenuToken();
    const first = await inviteTokenHash(token);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await inviteTokenHash(token)).toBe(first);
    expect(await inviteTokenHash(newMenuToken())).not.toBe(first);
  });

  test("differs from the hashes of every other namespace for the same token", async () => {
    const token = newMenuToken();
    const hash = await inviteTokenHash(token);
    expect(hash).not.toBe(await sessionTokenHash(token));
    expect(hash).not.toBe(await staffSessionTokenHash(token));
    expect(hash).not.toBe(await reservationCancelTokenHash(token));
    expect(hash).not.toBe(await deviceKeyHashFor("service", token));
    expect(hash).not.toBe(await sha256Hex(token));
  });

  test("never contains the raw token", async () => {
    const token = newMenuToken();
    expect(await inviteTokenHash(token)).not.toContain(token);
  });
});

describe("normalizeInviteEmail", () => {
  test("trims and lowercases a valid address", () => {
    expect(normalizeInviteEmail("  Ana@Example.COM ")).toBe("ana@example.com");
    expect(normalizeInviteEmail("marko@example.com")).toBe("marko@example.com");
  });

  test("answers null for anything that is not an e-mail address", () => {
    for (const value of ["", "   ", "ana", "ana@", "@example.com", "ana@example", "a b@example.com", undefined, null, 42, {}]) {
      expect(normalizeInviteEmail(value)).toBeNull();
    }
  });

  test("refuses an address longer than 254 characters", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(normalizeInviteEmail(long)).toBeNull();
  });
});

describe("invitePath and the term", () => {
  test("the path is the panel route of the invitation", () => {
    expect(invitePath("demo-restoran", "T".repeat(43))).toBe(`/demo-restoran/client-panel/meni/poziv/${"T".repeat(43)}`);
  });

  test("an invitation is valid for seven days", () => {
    expect(MENU_INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("inviteState", () => {
  const NOW = 1_800_000_000_000;
  const pending = (expiresAt: number): InviteRowState => ({ status: "invited", inviteTokenHash: "h", inviteExpiresAt: expiresAt });

  test("a pending invitation inside its term is valid", () => {
    expect(inviteState(pending(NOW + 1), NOW)).toBe("valid");
    expect(inviteState(pending(NOW + MENU_INVITE_TTL_MS), NOW)).toBe("valid");
  });

  test("at the exact boundary (now == expiresAt) it is expired, one millisecond before it is still valid", () => {
    expect(inviteState(pending(NOW), NOW)).toBe("expired");
    expect(inviteState(pending(NOW + 1), NOW)).toBe("valid");
    expect(inviteState(pending(NOW - 1), NOW)).toBe("expired");
  });

  test("an active, removed or hash-less row is invalid, whatever its term says", () => {
    expect(inviteState({ status: "active", inviteTokenHash: "h", inviteExpiresAt: NOW + 1000 }, NOW)).toBe("invalid");
    expect(inviteState({ status: "removed", inviteTokenHash: "h", inviteExpiresAt: NOW + 1000 }, NOW)).toBe("invalid");
    expect(inviteState({ status: "invited", inviteExpiresAt: NOW + 1000 }, NOW)).toBe("invalid");
    expect(inviteState({ status: "invited", inviteTokenHash: "h" }, NOW)).toBe("invalid");
    expect(inviteState({ status: "invited" }, NOW)).toBe("invalid");
    expect(inviteState({ status: "active" }, NOW)).toBe("invalid");
  });
});
