// The daypart SELECTION logic (RFC-003 §2.5, §4 TASK-54) — which daypart is
// active now, and which groups that reveals. lib/menu-blocks.ts deliberately
// carries dayparts as STRUCTURE ONLY and points here for the clock logic; this
// module owns it. Pure: no Convex, no React, no clock read — the caller passes
// the minute-of-day (client-side, from the venue timezone) so the reactive
// query stays a plain function of its arguments (the owner decision: a Convex
// query must NOT read the wall clock, or it never re-runs at a boundary).
//
// Split of responsibility:
//   - the CLIENT / SSR route resolve the CLOCK key from the venue timezone
//     (activeDaypartKey with no override) and pass it to the query as an arg;
//   - the QUERY applies the manual override on top with resolveEffectiveDaypart
//     (override BEATS the clock, §2.5), so an override flip propagates live
//     through the subscription with no client involvement.

import type { MenuGroup } from "./menu-blocks";

// The minimal window shape the resolver reads. `MenuDaypart` (and the
// PLACEHOLDER windows below) satisfy it structurally.
type DaypartWindow = {
  key: string;
  startMinute: number;
  endMinute: number;
};

// Which configured window contains `minuteOfDay` (0..1439, minutes from
// midnight in the venue timezone), or null if none. `start < end` is the half-
// open interval [start, end); `start > end` WRAPS past midnight (a late-night
// daypart). Empty windows (start === end) never match. First match in array
// order wins — the windows arrive pre-sorted by `order`.
function clockDaypartKey(
  dayparts: readonly DaypartWindow[],
  minuteOfDay: number,
): string | null {
  for (const d of dayparts) {
    if (d.startMinute === d.endMinute) continue;
    const inWindow =
      d.startMinute < d.endMinute
        ? minuteOfDay >= d.startMinute && minuteOfDay < d.endMinute
        : minuteOfDay >= d.startMinute || minuteOfDay < d.endMinute;
    if (inWindow) return d.key;
  }
  return null;
}

// The manual override BEATS the clock (§2.5): a non-empty override pins its
// daypart key and the clock is ignored entirely. THE one place the precedence
// rule lives — both the query and activeDaypartKey call it.
export function resolveEffectiveDaypart(
  override: string | null | undefined,
  clockKey: string | null,
): string | null {
  return override != null && override !== "" ? override : clockKey;
}

// The active daypart at `minuteOfDay`, override applied. The client and the SSR
// route call this with NO override (the query re-applies the live override);
// the unit tests exercise the override arm directly.
export function activeDaypartKey(
  dayparts: readonly DaypartWindow[],
  minuteOfDay: number,
  override?: string | null,
): string | null {
  return resolveEffectiveDaypart(override, clockDaypartKey(dayparts, minuteOfDay));
}

// The groups visible for the active daypart: every group with NO daypartKey
// (always shown, §2.5) plus groups bound to `activeKey`. `activeKey` null ⇒
// only the always-on groups. A menu with no dayparts leaves every group
// unbound, so everything shows — the pre-TASK-54 behaviour.
export function daypartGroups(
  groups: readonly MenuGroup[],
  activeKey: string | null,
): MenuGroup[] {
  return groups.filter(
    (group) =>
      group.base.daypartKey == null || group.base.daypartKey === activeKey,
  );
}

// PLACEHOLDER default daypart windows — the boundary minutes dividing
// doručak / ručak / večera are the OWNER's decision (RFC-003 §5 Q3) and are
// NOT yet fixed; see docs/tasks/BLOCKED.md (TASK-54). These are reasonable
// stand-ins so seeds and tests have concrete windows; replace them when the
// owner confirms. Minutes from midnight, venue (Belgrade) timezone.
export const DEFAULT_DAYPART_WINDOWS: readonly (DaypartWindow & {
  label: string;
})[] = [
  { key: "dorucak", label: "Doručak", startMinute: 7 * 60, endMinute: 11 * 60 },
  { key: "rucak", label: "Ručak", startMinute: 11 * 60, endMinute: 17 * 60 },
  { key: "vecera", label: "Večera", startMinute: 17 * 60, endMinute: 24 * 60 },
];
