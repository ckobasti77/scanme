import type { AudienceData } from "./types";

// ADMIN v2 X3 — devices are one sentence, not a chart: almost every scan is a
// phone. Bots are scans too, but they are not a device share: they are named
// after the sentence.

export type DeviceKind = "mobile" | "tablet" | "desktop" | "unknown";

export type DeviceSummary = {
  /** Scans with a device kind (bots left out). */
  total: number;
  top: { kind: DeviceKind; count: number; share: number };
  /** The other kinds, the biggest first; `unknown` only when it has a scan. */
  rest: Array<{ kind: DeviceKind; count: number }>;
  bots: number;
  sample: number;
  capped: boolean;
};

const KINDS: readonly DeviceKind[] = ["mobile", "desktop", "tablet", "unknown"];

export function deviceSummary(devices: AudienceData["devices"] | undefined): DeviceSummary | null {
  if (!devices) return null;
  const total = devices.mobile + devices.tablet + devices.desktop + devices.unknown;
  if (total === 0) return null;
  const ordered = KINDS.map((kind) => ({ kind, count: devices[kind] })).sort((a, b) => b.count - a.count);
  const [top, ...rest] = ordered;
  return {
    total,
    top: { ...top, share: top.count / total },
    rest: rest.filter((row) => row.kind !== "unknown" || row.count > 0),
    bots: devices.bots,
    sample: devices.sample,
    capped: devices.capped,
  };
}
