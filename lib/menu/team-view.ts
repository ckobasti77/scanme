// ScanMe Menu V1 (K28) — what Tim i pristupi shows and allows (master §10.6;
// plan docs/meni/planovi/K24.md §4.6). The rights of every role are read from
// the one matrix (lib/menu/permissions.ts), never written twice: the screen
// lists `pravaUloge(uloga)` and Convex checks the same `roleCan`.
// Pure and dependency-free apart from the matrix.

import { canAssignRole, roleCan, type MenuActor, type MenuPermission, type MenuRole } from "./permissions";

/** The four roles the screen explains, strongest first. `staff` is a PIN identity of the waiter panel. */
export const TIM_ULOGE = ["owner", "manager", "editor", "staff"] as const satisfies readonly MenuActor[];
export type TimUloga = (typeof TIM_ULOGE)[number];

/**
 * The rights a person can understand, each tied to ONE permission of the
 * matrix. `vlasnistvo` is the one right that is not a permission: only an
 * Owner may give the Owner role (canAssignRole).
 */
export const PRAVA = [
  { kljuc: "meni", dozvola: "menu.publish" },
  { kljuc: "funkcionalnosti", dozvola: "features.edit" },
  { kljuc: "lokal", dozvola: "venue.edit" },
  { kljuc: "operativa", dozvola: "operations.read" },
  { kljuc: "konobar", dozvola: "waiter.work" },
  { kljuc: "zone", dozvola: "waiter.assignZones" },
  { kljuc: "osoblje", dozvola: "staff.pin" },
  { kljuc: "tim", dozvola: "team.manage" },
  { kljuc: "podesavanja", dozvola: "settings.edit" },
  { kljuc: "analitika", dozvola: "analytics.read" },
] as const satisfies readonly { kljuc: string; dozvola: MenuPermission }[];
export type PravoKljuc = (typeof PRAVA)[number]["kljuc"] | "vlasnistvo";

/** The rights of a role, in the order of PRAVA; `vlasnistvo` last, for whoever may give the Owner role. */
export function pravaUloge(uloga: TimUloga): PravoKljuc[] {
  const prava: PravoKljuc[] = PRAVA.filter((pravo) => roleCan(uloga, pravo.dozvola)).map((pravo) => pravo.kljuc);
  if (uloga !== "staff" && canAssignRole(uloga, "owner")) prava.push("vlasnistvo");
  return prava;
}

/**
 * May `actor` change or remove a member who holds `uloga`, giving them
 * `nova` (when given)? Nobody touches their own row; a Manager never gives or
 * takes away the Owner role. Convex (convex/menuTeam.ts) uses the same rule.
 */
export function smeUpravljati(actor: MenuActor, uloga: MenuRole, opcije: { svoj: boolean; nova?: MenuRole }): boolean {
  if (opcije.svoj) return false;
  if (!roleCan(actor, "team.manage")) return false;
  if (!canAssignRole(actor, uloga)) return false;
  return opcije.nova === undefined || canAssignRole(actor, opcije.nova);
}

/** The roles `actor` may offer in "Pozovi člana", strongest first. */
export function ulogeZaPoziv(actor: MenuActor): MenuRole[] {
  if (!roleCan(actor, "team.manage")) return [];
  return (["owner", "manager", "editor"] as const).filter((uloga) => canAssignRole(actor, uloga));
}

export type ClanStatus = "aktivan" | "pozvan" | "istekao";

/** The status a member row shows at `now` (a pending invitation past its term is `istekao`). */
export function statusClana(
  red: { status: "invited" | "active"; inviteExpiresAt: number | null },
  now: number,
): ClanStatus {
  if (red.status === "active") return "aktivan";
  return red.inviteExpiresAt !== null && now >= red.inviteExpiresAt ? "istekao" : "pozvan";
}
