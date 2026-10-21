// ADMIN v3 V5 — which stages of the 3D kit may draw (the registry of
// components/admin/three/stage.ts). Pure. While an exclusive stage lives (a
// dialog, a ceremony) only the most recently created exclusive one runs and every
// other stage stands; with none alive all of them run. A stack, not a flag: when
// the newer exclusive stage is disposed, the older one runs again.

export type StageEntry = { id: number; exclusive: boolean };

/** The ids that may draw; `entries` are in creation order (oldest first). */
export function runningStages(entries: readonly StageEntry[]): Set<number> {
  let newest: number | null = null;
  for (const entry of entries) if (entry.exclusive) newest = entry.id;
  if (newest !== null) return new Set([newest]);
  return new Set(entries.map((entry) => entry.id));
}
