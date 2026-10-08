// Privremeni baner Sajma automobila na javnom landingu (components/prelaunch-landing.tsx).
//
// JEDAN prekidač: false gasi baner i red `footer.fair` u futeru zajedno.
// Sve ostalo na strani je opšti ScanMe sadržaj i ostaje i posle sajma.
export const FAIR_BANNER_ENABLED = true;

// Sajamski dani, kalendarski po Europe/Belgrade (uključivo).
export const FAIR_BANNER_EVENTS = [
  { firstDay: "2026-10-09", lastDay: "2026-10-11" },
  { firstDay: "2026-10-30", lastDay: "2026-11-01" },
] as const;

export type FairBannerStatus =
  | { kind: "live"; eventIndex: number }
  | { kind: "next"; eventIndex: number }
  | { kind: "ended" };

const belgradeDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Belgrade",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" za dati trenutak u Beogradu (iz delova, ne iz formata lokala). */
export function belgradeDateKey(now: Date): string {
  const parts: Record<string, string> = {};
  for (const part of belgradeDay.formatToParts(now)) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getFairBannerStatus(now: Date): FairBannerStatus {
  const today = belgradeDateKey(now);
  for (const [eventIndex, event] of FAIR_BANNER_EVENTS.entries()) {
    if (today < event.firstDay) return { kind: "next", eventIndex };
    if (today <= event.lastDay) return { kind: "live", eventIndex };
  }
  return { kind: "ended" };
}
