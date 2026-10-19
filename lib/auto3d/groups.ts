// Delovi po grupama (sistemima) za listu, traku grupa i karticu dela (A05). Čisto, iz kataloga.

import { PARTS, SYSTEMS, type Instance, type PartId, type SystemId } from "./catalog";

export type PartDef = { id: PartId; system: SystemId; instances: readonly Instance[] };

const BY_ID = new Map<PartId, PartDef>(PARTS.map((p) => [p.id, p]));

const BY_SYSTEM = new Map<SystemId, PartId[]>(SYSTEMS.map((s) => [s.id, PARTS.filter((p) => p.system === s.id).map((p) => p.id)]));

export function partDef(id: PartId): PartDef {
  return BY_ID.get(id) as PartDef;
}

/** Delovi jednog sistema, redom iz kataloga. */
export function partsOfSystem(system: SystemId): readonly PartId[] {
  return BY_SYSTEM.get(system) ?? [];
}

export const SYSTEM_PART_COUNT: Readonly<Record<SystemId, number>> = Object.fromEntries(
  SYSTEMS.map((s) => [s.id, partsOfSystem(s.id).length]),
) as Record<SystemId, number>;

export const SYSTEM_COLOR: Readonly<Record<SystemId, string>> = Object.fromEntries(SYSTEMS.map((s) => [s.id, s.color])) as Record<
  SystemId,
  string
>;

/** Prethodni i sledeći deo u istoj grupi (u krug) i mesto dela u grupi, od 1. */
export function neighbors(id: PartId): { prev: PartId; next: PartId; index: number; total: number } {
  const list = partsOfSystem(partDef(id).system);
  const i = list.indexOf(id);
  const n = list.length;
  return { prev: list[(i - 1 + n) % n], next: list[(i + 1) % n], index: i + 1, total: n };
}
