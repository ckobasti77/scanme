// ADMIN v2 X4 — pure logic of the odometer (ZADATAK §5.3): which characters of
// a number roll when it changes. Every character is a column (digits, thousands
// dots, "+" alike); columns are aligned from the right so a units digit meets a
// units digit when the number gains or loses a place.

export type OdometerColumn = {
  /** The character shown after the change. */
  to: string;
  /** The character that was in this column; null when the column is new (the number gained a place). */
  from: string | null;
  /** The character differs, so the column rolls. */
  changed: boolean;
};

/** One column per character of `to`. A place that `to` lost simply disappears. */
export function odometerColumns(from: string, to: string): OdometerColumn[] {
  const before = [...from];
  const after = [...to];
  return after.map((char, index) => {
    const previous = before[before.length - (after.length - index)] ?? null;
    return { to: char, from: previous, changed: previous !== char };
  });
}

/** 1 = the number grew (digits roll up), -1 = it fell (digits roll down). */
export function odometerDirection(from: number, to: number): 1 | -1 {
  return to < from ? -1 : 1;
}
