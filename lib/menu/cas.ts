// ScanMe Menu V1 — compare-and-set by field value (master §6.1: "sistem ne
// sme tiho da pregazi noviju izmenu drugog korisnika"). The editor sends the
// value it last saw for every field it changes; the server applies the patch
// only when each of those fields still holds that value. Otherwise nothing is
// written and the client gets the current values to show a conflict.
//
// `null` in `expected` means "the field was absent". Values are primitives
// (string | number | boolean | null); structured fields compare via JSON.

export type CasValue = string | number | boolean | null;

export type CasResult<K extends string> =
  | { ok: true }
  | { ok: false; conflicts: K[]; current: Record<K, CasValue> };

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export function checkCas<K extends string>(
  current: Partial<Record<K, unknown>>,
  expected: Partial<Record<K, CasValue>>,
): CasResult<K> {
  const conflicts: K[] = [];
  const snapshot = {} as Record<K, CasValue>;
  for (const field of Object.keys(expected) as K[]) {
    const now = (current[field] ?? null) as CasValue;
    snapshot[field] = now;
    if (!same(now, expected[field] ?? null)) conflicts.push(field);
  }
  return conflicts.length === 0 ? { ok: true } : { ok: false, conflicts, current: snapshot };
}
