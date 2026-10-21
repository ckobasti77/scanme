// ScanMe Menu V1 (K28) — invitations into the team of one Menu service (plan
// docs/meni/planovi/K24.md K24-21). The same pattern as convex/lib/invitations.ts
// (a 256-bit token, only its hash in the database, a 7-day term, the same
// e-mail on acceptance), but over `menuMembers` alone: accepting never creates
// a `businessMemberships` row and never gives legacy access to the account.
// Pure (Web Crypto), shared by Convex and the panel.

import { normalizeEmail } from "./reservation-form";
import { sha256Hex } from "./tokens";

/** How long an invitation link is valid. */
export const MENU_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The stored hash of an invitation token; its own namespace (never a session, device or cancel hash). */
export async function inviteTokenHash(token: string): Promise<string> {
  return await sha256Hex(`menu-team-invite:${token}`);
}

/** The address an invitation is for: trimmed, lowercase, at most 254 characters; null when it is not an e-mail. */
export function normalizeInviteEmail(value: unknown): string | null {
  return normalizeEmail(value);
}

/** The panel path of an invitation link. */
export function invitePath(slug: string, token: string): string {
  return `/${slug}/client-panel/meni/poziv/${token}`;
}

export type InviteRowState = {
  status: "invited" | "active" | "removed";
  inviteTokenHash?: string;
  inviteExpiresAt?: number;
};

export type InviteState = "valid" | "expired" | "invalid";

/**
 * What an invitation row means at `now`: `valid` (pending, inside its term),
 * `expired` (pending, past its term) or `invalid` (revoked, already used, or
 * a member row without an invitation).
 */
export function inviteState(row: InviteRowState, now: number): InviteState {
  if (row.status !== "invited" || row.inviteTokenHash === undefined || row.inviteExpiresAt === undefined) {
    return "invalid";
  }
  return now < row.inviteExpiresAt ? "valid" : "expired";
}
