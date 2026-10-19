// Primena režima i filtera grupe na scenu (pravila su u lib/auto3d/filter.ts): sakriveni čvorovi
// dobijaju visible = false, prigušeni animiraju `dim`, a picking dobija samo normalne mreže.

import type { Mesh } from "three";
import type { SystemId } from "@/lib/auto3d/catalog";
import { isPickable, partVisual, type Mode, type PartVisual } from "@/lib/auto3d/filter";
import type { Registry } from "./registry";

export type Visuals = { byKey: Map<string, { system: SystemId; visual: PartVisual }>; pickables: Mesh[] };

export function computeVisuals(registry: Registry, mode: Mode, group: SystemId | null): Visuals {
  const byKey = new Map<string, { system: SystemId; visual: PartVisual }>();
  const pickables: Mesh[] = [];
  for (const n of registry.nodes) {
    const visual = partVisual(n.system, mode, group);
    byKey.set(n.partId, { system: n.system, visual });
    n.object.visible = visual !== "hidden";
    if (isPickable(visual)) pickables.push(...n.meshes);
  }
  for (const d of registry.deco) {
    const visual = partVisual(d.system, mode, group);
    byKey.set(d.name, { system: d.system, visual });
    d.object.visible = visual !== "hidden";
  }
  return { byKey, pickables };
}
