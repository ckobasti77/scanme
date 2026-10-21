// Izlog fixtures: the data behind Početna of the client panel (K27), invented
// and deterministic. Every time is relative to IZLOG_SADA (17 Oct 2026, 18:27 in
// Belgrade), so the same call always gives the same input for
// lib/menu/home-summary.ts `homeSummary`. Two states: "paznja" (several things
// need a look) and "mirno" (nothing does). Parts a role may not read are null,
// exactly as convex/menuPanel.ts `home` returns them.

import type { MenuTier } from "@/lib/menu/capabilities";
import type { HomeInput } from "@/lib/menu/home-summary";
import { roleCan, type MenuActor } from "@/lib/menu/permissions";
import { IZLOG_SADA } from "./lokal";

export type PocetnaSadrzaj = "paznja" | "mirno";

const MINUT = 60_000;
const SAT = 60 * MINUT;

/** The instant `minutes` before IZLOG_SADA. */
const ago = (minutes: number): number => IZLOG_SADA - minutes * MINUT;

// Belgrade is two hours ahead of UTC on the day of the fixtures (summer time until 25 Oct 2026).
const BELGRADE_OFFSET_HOURS = 2;
/** Belgrade wall-clock time on the day of IZLOG_SADA (dayOffset -1 = the day before). */
const belgrade = (hour: number, minute: number, dayOffset = 0): number =>
  Date.UTC(2026, 9, 17 + dayOffset, hour - BELGRADE_OFFSET_HOURS, minute);

/** A PIN sign-in that is still live (a session lasts 12 hours). */
const uSmeni = (satiDoIsteka: number): { expiresAt: number } => ({ expiresAt: IZLOG_SADA + satiDoIsteka * SAT });

const PRAG_MIN = 15;
const ZADRZAVANJE_MIN = 15;

function paznja(plan: MenuTier, actor: MenuActor): HomeInput {
  return {
    nowMs: IZLOG_SADA,
    // Live version 14 went out three days ago; the draft was last touched two days ago, after it.
    menu: {
      state: "dirty",
      liveVersionNumber: 14,
      livePublishedAt: IZLOG_SADA - 72 * SAT,
      lastEditAt: IZLOG_SADA - 48 * SAT,
    },
    roomServicePriceWarnings: plan === "premium" ? 2 : null,
    operations: roleCan(actor, "operations.read")
      ? {
          lateThresholdMin: PRAG_MIN,
          holdMinutes: ZADRZAVANJE_MIN,
          requests: [
            // Two past the threshold (Pažnja) …
            { kind: "call", status: "new", createdAt: ago(22) },
            { kind: "order", status: "accepted", createdAt: ago(18) },
            // … and three that are not (Sada u lokalu).
            { kind: "call", status: "new", createdAt: ago(9) },
            { kind: "bill", status: "accepted", createdAt: ago(6) },
            { kind: "order", status: "new", createdAt: ago(2) },
          ],
          requestsTruncated: false,
          reservations: [
            // The same evening as in the Operativa fixture (fixtures/operativa.ts, rv_01, rv_07, rv_02).
            // Waits for an answer.
            { status: "new", requestedAt: belgrade(19, 0), partySize: 4, positionLabel: null },
            // Accepted for 18:02, so 25 minutes late: past the 15 minute hold.
            { status: "accepted", requestedAt: ago(25), partySize: 5, positionLabel: "Sto 7" },
            // Accepted, the one still to come today.
            { status: "accepted", requestedAt: belgrade(20, 0), partySize: 6, positionLabel: "Sto 6" },
          ],
          staffSessions: [uSmeni(11), uSmeni(9), uSmeni(6)],
        }
      : null,
    mail: roleCan(actor, "settings.edit") ? { status: "error" } : null,
  };
}

function mirno(plan: MenuTier, actor: MenuActor): HomeInput {
  return {
    nowMs: IZLOG_SADA,
    menu: {
      state: "clean",
      liveVersionNumber: 14,
      livePublishedAt: belgrade(14, 32),
      lastEditAt: belgrade(14, 30),
    },
    // Premium has Room service, and nothing in it needs a look.
    roomServicePriceWarnings: plan === "premium" ? 0 : null,
    operations: roleCan(actor, "operations.read")
      ? {
          lateThresholdMin: PRAG_MIN,
          holdMinutes: ZADRZAVANJE_MIN,
          requests: [],
          requestsTruncated: false,
          reservations: [{ status: "accepted", requestedAt: belgrade(20, 30), partySize: 2, positionLabel: null }],
          staffSessions: [uSmeni(10), uSmeni(7)],
        }
      : null,
    mail: roleCan(actor, "settings.edit") ? { status: "active" } : null,
  };
}

/**
 * The input of `homeSummary` for the izlog. `actor` decides what the server would
 * leave out: operations without `operations.read`, the mailbox without `settings.edit`;
 * `plan` decides whether Room service exists (premium only).
 */
export function fixturePocetnaInput({
  sadrzaj,
  plan,
  actor,
}: {
  sadrzaj: PocetnaSadrzaj;
  plan: MenuTier;
  actor: MenuActor;
}): HomeInput {
  return sadrzaj === "paznja" ? paznja(plan, actor) : mirno(plan, actor);
}
