// ScanMe Menu V1 (K23) — the reminder of the waiter panel (master §8.5:
// "Podsetnik može ponoviti kratak zvuk i animaciju relevantnog stola/reda";
// plan docs/meni/planovi/K19.md K19-21, §4.4).
//
// A request still `Novi` reminds once per interval, counted from when it
// arrived: at createdAt + 1 × interval, + 2 × interval, … Never continuously,
// never after it was taken (`Prihvaćen`), never for a request the waiter does
// not see in the current zone filter (the caller passes only visible ones),
// and nothing is forwarded to anyone (§8.5: no automatic forwarding).
//
// When the panel first sees a request, the interval it is already in counts
// as rung: opening the panel does not ring for every old request at once;
// the next boundary does. Several reminders due at the same tick give ONE
// short sound (the caller plays it once) and animate every due row or table.

/** The last interval each request has rung for (request id → interval index). */
export type ReminderMemory = ReadonlyMap<string, number>;

export type ReminderRow = { id: string; status: string; createdAt: number };

export type ReminderTick = {
  /** Requests whose reminder is due now (animate their row or table; one sound in total). */
  due: string[];
  /** The memory to keep for the next tick (only requests still `Novi` stay in it). */
  memory: Map<string, number>;
};

/** Which interval of `intervalMs` a request waiting since `createdAt` is in at `now` (0 = the first). */
export function reminderSlot(createdAt: number, now: number, intervalMs: number): number {
  if (intervalMs <= 0 || now <= createdAt) return 0;
  return Math.floor((now - createdAt) / intervalMs);
}

/**
 * One tick of the panel clock: which visible `Novi` requests remind now.
 * `reminderMin` 0 (off) rings nothing and keeps nothing.
 */
export function dospeliPodsetnici(
  zahtevi: readonly ReminderRow[],
  now: number,
  reminderMin: number,
  vecOdzvonjeno: ReminderMemory,
): ReminderTick {
  const memory = new Map<string, number>();
  const due: string[] = [];
  if (!(reminderMin > 0)) return { due, memory };
  const intervalMs = reminderMin * 60 * 1000;
  for (const zahtev of zahtevi) {
    if (zahtev.status !== "new") continue;
    const slot = reminderSlot(zahtev.createdAt, now, intervalMs);
    const rung = vecOdzvonjeno.get(zahtev.id);
    if (rung === undefined) {
      // First sight: the interval it is already in counts as rung.
      memory.set(zahtev.id, slot);
      continue;
    }
    if (slot > rung && slot >= 1) {
      due.push(zahtev.id);
      memory.set(zahtev.id, slot);
    } else {
      memory.set(zahtev.id, rung);
    }
  }
  return { due, memory };
}
