import type { FairPassportCatalogEntry, FairPassportProgress } from "@/lib/fair-contract";

// Stamp passport overview (Auto Moto Fest "ulaznice"): what one ticket shows,
// derived from the visitor's progress (stamped) and this device's visit store
// (stamped but not stuck yet = "new"). Same rule as StampPassport: a passport
// is complete only when every stamp is stamped and stuck.

export type PassportCellState = "got" | "new" | "missing";

export type PassportTicketView = {
  /** One cell per required model, in catalog order. */
  cells: PassportCellState[];
  got: number;
  fresh: number;
  total: number;
  complete: boolean;
};

export function passportTicketView(
  entry: FairPassportCatalogEntry,
  progress: FairPassportProgress | undefined,
  unreadIds: readonly string[],
): PassportTicketView {
  const stamped = new Set(progress?.stampedModelIds ?? []);
  const unread = new Set(unreadIds);
  const cells = entry.models.map(({ eventModelId }): PassportCellState =>
    !stamped.has(eventModelId) ? "missing" : unread.has(eventModelId) ? "new" : "got",
  );
  const got = cells.filter((cell) => cell === "got").length;
  const fresh = cells.filter((cell) => cell === "new").length;
  const total = cells.length;
  return { cells, got, fresh, total, complete: Boolean(progress?.completed) && total > 0 && got === total };
}

export type PassportTicketsSummary = { got: number; total: number; complete: number; fresh: number };

export function passportTicketsSummary(views: readonly PassportTicketView[]): PassportTicketsSummary {
  return views.reduce<PassportTicketsSummary>(
    (sum, view) => ({
      got: sum.got + view.got,
      total: sum.total + view.total,
      complete: sum.complete + (view.complete ? 1 : 0),
      fresh: sum.fresh + view.fresh,
    }),
    { got: 0, total: 0, complete: 0, fresh: 0 },
  );
}

const belgradeYear = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Belgrade" });

/** "TEST Auto Moto Fest 2026", "Hala Čair, Niš" → { name: "Auto Moto Fest", year: "2026", city: "Niš" }. */
export function passportEventMark(title: string, venueName?: string, startsAt?: number) {
  const clean = title.replace(/^TEST\s+/i, "").trim();
  const titleYear = clean.match(/\b(\d{4})\b/)?.[1];
  const year = titleYear ?? (startsAt !== undefined ? belgradeYear.format(new Date(startsAt)) : "");
  const name = clean.replace(/\s*\b\d{4}\b\s*/, " ").trim();
  const parts = (venueName ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[parts.length - 1] : "";
  return { name, year, city };
}
