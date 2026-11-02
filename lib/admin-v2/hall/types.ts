// ADMIN v3 V3 — the contract of the Living hall and the Vremeplov (ZADATAK-V3
// §3.2). The read is `fairEventAnalytics.getEventStandHours` (one fair day,
// hour by hour, per stand); the pure functions of this folder turn it into
// what the hall draws at a moment `t` of that day. No imports here: every
// other file of the folder, the scene and the controls read these types.

/** What `fairEventAnalytics.getEventStandHours` returns (the validator there is the same shape). */
export type StandHoursData = {
  at: number;
  dateKey: string;
  /** The Belgrade hours of the series, ascending (8, 9, …); empty before the hall opens. */
  hours: number[];
  stands: Array<{
    standCode: string;
    mapLocationId: string;
    /** Scans per hour, the same length as `hours`. */
    scans: number[];
    /** Unique per model per hour; EMPTY when it was not read (the budget of the read). */
    uniquePerModel: number[];
  }>;
  /**
   * Stands that did not fit the budget of the read. On a day after the opening they are stands with a scan (or
   * ones the read did not look at); on the opening day, which has no preselection, also stands without one.
   */
  unread: number;
  capped: boolean;
};

/** The hourly read of one fair day as the page holds it (the container reads it, the dev preview fakes it). */
export type StandHoursState = {
  /** The day that was asked for; null before the first request. */
  dateKey: string | null;
  /** undefined while it loads (and before the first request). */
  data: StandHoursData | undefined;
  error: boolean;
  /** Ask for a day; `fresh` reads it again (an open day has new scans). */
  request: (dateKey: string, fresh?: boolean) => void;
};

/** Dev preview (`?vremeplov=<hour>|auto`): the Vremeplov opens at an hour, or the replay of the day starts. */
export type TimelapseStart = { hour: number } | "auto";

/** One map location of the hall through one fair day (the stands of a location are summed). */
export type HallStand = {
  locationId: string;
  /** The stand code(s) of the location, for the rank and the table. */
  label: string;
  /** Scans per hour, the same length as `HallSeries.hours`. */
  scans: number[];
  /** Unique per model per hour; null when it was not read for this location. */
  unique: number[] | null;
  /** The scans of the whole day. */
  total: number;
};

export type HallSeries = {
  dateKey: string;
  /** The Belgrade hours of the series, ascending. */
  hours: number[];
  /** Sorted by the total of the day, then by the label. */
  stands: HallStand[];
  /**
   * Where the series ends, in hours from the start of the first hour: `hours.length` for a finished day,
   * less for the open one (the last hour has not passed yet). 0 for an empty series.
   */
  end: number;
  /** The largest total of the day: the scale of the heights, the same through the whole day. */
  maxTotal: number;
  capped: boolean;
};

/** One hour of a column at a moment: how many scans of that hour are in it and the heat of the hour. */
export type HallLayer = { hour: number; scans: number; level: number };

export type HallRankRow = { locationId: string; label: string; scans: number; place: number };

/** New scans of a map location between two polls. */
export type HallImpulse = { locationId: string; count: number };

/**
 * The Vremeplov: the live picture, a moment of a day, or the replay of a day.
 * `t` is hours from the start of the first hour of the series (0 … `HallSeries.end`).
 */
export type TimelapsePlayer =
  | { mode: "live" }
  | { mode: "paused"; t: number }
  /** `startedAt` is `performance.now()` of the press; the scene and the controls compute `t` from it. */
  | { mode: "playing"; fromT: number; startedAt: number };
