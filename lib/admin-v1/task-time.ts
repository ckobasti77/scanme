export const BELGRADE_TIME_ZONE = "Europe/Belgrade" as const;

export type TaskDueInput =
  | { readonly kind: "date"; readonly date: string }
  | { readonly kind: "instant"; readonly at: number }
  | null;

export type TaskTimePhase = "none" | "future" | "today" | "overdue";

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: BELGRADE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: BELGRADE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsRecord(formatter: Intl.DateTimeFormat, at: number) {
  return Object.fromEntries(
    formatter
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("task_due_date_invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) throw new Error("task_due_date_invalid");
  return { year, month, day };
}

function addCalendarDays(date: string, days: number) {
  const parsed = parseDate(date);
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function localMidnightUtc(date: string) {
  const target = parseDate(date);
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day);
  let candidate = targetAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = partsRecord(dateTimeParts, candidate);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const next = candidate + targetAsUtc - observedAsUtc;
    if (next === candidate) break;
    candidate = next;
  }
  return candidate;
}

export function belgradeLocalDateTimeToUtc(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("task_due_local_datetime_invalid");
  const date = parseDate(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) throw new Error("task_due_local_datetime_invalid");
  const targetAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let candidate = targetAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = partsRecord(dateTimeParts, candidate);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const next = candidate + targetAsUtc - observedAsUtc;
    if (next === candidate) break;
    candidate = next;
  }
  const observed = partsRecord(dateTimeParts, candidate);
  if (
    observed.year !== date.year ||
    observed.month !== date.month ||
    observed.day !== date.day ||
    observed.hour !== hour ||
    observed.minute !== minute
  ) throw new Error("task_due_local_datetime_invalid");
  return candidate;
}

export function belgradeDateKey(at: number) {
  if (!Number.isFinite(at)) throw new Error("task_due_instant_invalid");
  const parts = partsRecord(dateParts, at);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function belgradeDayBounds(date: string) {
  return {
    start: localMidnightUtc(date),
    end: localMidnightUtc(addCalendarDays(date, 1)),
  };
}

export function taskDueFacts(due: TaskDueInput, now: number) {
  if (!due) {
    return {
      phase: "none" as const,
      dueAt: null,
      dueDay: null,
      todayAt: null,
      overdueAt: null,
    };
  }
  if (due.kind === "date") {
    const bounds = belgradeDayBounds(due.date);
    const today = belgradeDateKey(now);
    const phase: TaskTimePhase =
      today > due.date ? "overdue" : today === due.date ? "today" : "future";
    return {
      phase,
      dueAt: bounds.end,
      dueDay: due.date,
      todayAt: bounds.start,
      overdueAt: bounds.end,
    };
  }
  if (!Number.isSafeInteger(due.at) || due.at < 0 || !Number.isFinite(new Date(due.at).getTime())) {
    throw new Error("task_due_instant_invalid");
  }
  const dueDay = belgradeDateKey(due.at);
  const today = belgradeDateKey(now);
  const phase: TaskTimePhase =
    now > due.at ? "overdue" : today === dueDay ? "today" : "future";
  return {
    phase,
    dueAt: due.at,
    dueDay,
    todayAt: belgradeDayBounds(dueDay).start,
    overdueAt: due.at + 1,
  };
}
