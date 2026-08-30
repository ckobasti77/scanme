// Belgrade wall-clock ⇄ epoch helpers, DST-correct (CET/CEST). Extracted for
// the TASK-18 Memories surfaces (admin console + host panel), which both take
// datetime-local input and render Belgrade times. The venue-panel-section
// (TASK-13) keeps its own private copies — that byte-stable file is not touched
// here; new code shares this module.

const BELGRADE = "Europe/Belgrade";

// Europe/Belgrade offset (ms) at a given instant.
function belgradeOffsetMs(instant: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BELGRADE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(instant))) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUTC - instant;
}

// A Belgrade wall-clock "YYYY-MM-DDTHH:mm" (from <input type="datetime-local">)
// → epoch ms, correct across the DST boundary (two-pass offset refinement).
export function belgradeLocalToEpoch(local: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const utcGuess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offset = belgradeOffsetMs(utcGuess);
  let epoch = utcGuess - offset;
  const refined = belgradeOffsetMs(epoch);
  if (refined !== offset) epoch = utcGuess - refined;
  return epoch;
}

// epoch ms → Belgrade wall-clock string for prefilling <input datetime-local>.
export function epochToBelgradeLocal(epoch: number): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(epoch))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

// epoch ms → Belgrade calendar parts as numbers. Used by the ZIP export
// (TASK-21) for both the human filename stamp and the per-file DOS mod-time, so
// a downloaded archive's dates read in the couple's own timezone.
export function belgradeParts(epoch: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BELGRADE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(epoch))) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

const dateTimeFormat = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: BELGRADE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateOnlyFormat = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: BELGRADE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatBelgrade(epoch: number | null): string {
  return epoch === null ? "" : dateTimeFormat.format(new Date(epoch));
}
export function formatBelgradeDate(epoch: number | null): string {
  return epoch === null ? "" : dateOnlyFormat.format(new Date(epoch));
}
