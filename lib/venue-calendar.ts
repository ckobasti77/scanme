// Pure calendar/date helpers for the Venue render layer (TASK-09). No React,
// no Convex — unit-testable, usable from server components and client leaves.
//
// DST strategy: an epoch timestamp is absolute, so both the Google Calendar
// link and the generated .ics carry UTC instants (the `Z` form). Calendar apps
// convert to the viewer's zone themselves, which is exact across the CET/CEST
// switch — no VTIMEZONE table to hand-maintain, nothing to get wrong twice a
// year. Human-readable display uses Intl with an explicit Europe/Belgrade zone,
// so the server renders Belgrade wall-clock time no matter where it runs.

export const BELGRADE_TIME_ZONE = "Europe/Belgrade";
const LOCALE = "sr-Latn-RS";

// Render-time clock read for force-dynamic SERVER components. The React purity
// lint rightly bans Date.now() inside client component bodies (re-renders would
// observe unstable values), but a per-request dynamic server component renders
// exactly once per request — a clock read there is deliberate and safe (the
// countdown/deadline server branches). Centralized so the judgment is explicit
// and greppable; never call this from a "use client" module.
export function serverNow(): number {
  return Date.now();
}

export function formatBelgradeDate(ms: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: BELGRADE_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(ms);
}

export function formatBelgradeTime(ms: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: BELGRADE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ms);
}

export function formatBelgradeDateTime(ms: number): string {
  return `${formatBelgradeDate(ms)} u ${formatBelgradeTime(ms)}`;
}

// Compact date for archive listings: "15. januar 2026."
export function formatBelgradeDateShort(ms: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: BELGRADE_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(ms);
}

// UTC basic format for calendar payloads: YYYYMMDDTHHMMSSZ.
export function toUtcBasic(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export type CalendarEventInput = {
  title: string;
  startsAt: number;
  /** Defaults to startsAt + 2h — Google and .ics both require an end. */
  endsAt?: number;
  location?: string;
  description?: string;
};

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export function googleCalendarUrl(input: CalendarEventInput): string {
  const endsAt = input.endsAt ?? input.startsAt + DEFAULT_DURATION_MS;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${toUtcBasic(input.startsAt)}/${toUtcBasic(endsAt)}`,
    ctz: BELGRADE_TIME_ZONE,
  });
  if (input.location) params.set("location", input.location);
  if (input.description) params.set("details", input.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// RFC 5545 text escaping: backslash, semicolon, comma, newline.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Deterministic .ics content (DTSTAMP mirrors DTSTART so server render output
// is stable). CRLF line endings per RFC 5545.
export function icsContent(input: CalendarEventInput & { uid: string }): string {
  const endsAt = input.endsAt ?? input.startsAt + DEFAULT_DURATION_MS;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ScanMe//Venue//SR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.uid)}`,
    `DTSTAMP:${toUtcBasic(input.startsAt)}`,
    `DTSTART:${toUtcBasic(input.startsAt)}`,
    `DTEND:${toUtcBasic(endsAt)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    ...(input.description
      ? [`DESCRIPTION:${escapeIcsText(input.description)}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

// A data: href lets the .ics download work with zero JS and zero extra routes.
export function icsDataUri(content: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(content)}`;
}
