// ScanMe Menu V1 — mapping existing memberships onto Menu roles (K01 §4.2).
// Extends the account model, never replaces it: account memberships keep
// working everywhere else, and a Menu role is DERIVED from them unless a
// `menuMembers` row grants an explicit (possibly stronger) role.
//
//   full_access          → owner
//   venue_management     → manager
//   finance, view_only   → no Menu access (K01 OTV 2)
//   legacy businessMembership (accessRole "viewer", pre-migration accounts)
//                        → manager (K01 OTV 1)
//
// The effective role is the stronger of the derived and the explicit one.

import { strongerRole, type MenuRole } from "./permissions";

export type AccountClientRole =
  | "full_access"
  | "venue_management"
  | "finance"
  | "view_only";

export type DerivedMembership =
  /** Migrated account: accountMemberships.role (venue scope already checked). */
  | { kind: "account"; role: AccountClientRole }
  /** Pre-migration business: an active businessMemberships row. */
  | { kind: "legacy" }
  /** No business access at all. */
  | { kind: "none" };

export function roleFromMembership(membership: DerivedMembership): MenuRole | null {
  switch (membership.kind) {
    case "account":
      if (membership.role === "full_access") return "owner";
      if (membership.role === "venue_management") return "manager";
      return null;
    case "legacy":
      return "manager";
    case "none":
      return null;
  }
}

export function effectiveMenuRole(input: {
  membership: DerivedMembership;
  explicitRole: MenuRole | null;
}): MenuRole | null {
  return strongerRole(roleFromMembership(input.membership), input.explicitRole);
}
