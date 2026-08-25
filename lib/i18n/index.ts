// i18n entry point (RFC-001 §2.12). Two ways to reach a dictionary:
//
//  - Direct per-surface import — `import { venueSr } from "@/lib/i18n/sr/venue"`
//    — bundles ONLY that surface's strings into the route. This is the mechanism
//    that keeps route bundles lean; prefer it in a route/component that needs one
//    surface.
//  - getDict(surface) — a typed accessor for code that selects a surface
//    dynamically. Because it references every surface module, importing getDict
//    pulls all surfaces into the bundle; that is the trade for the convenience.
//
// A second locale is mechanical: add lib/i18n/en/* implementing the same
// interfaces and extend getDict.

import { fmt } from "./format";
import type { DictBySurface, Surface } from "./types";
import { venueSr } from "./sr/venue";
import { venueEditorSr } from "./sr/venue-editor";
import { memoriesSr } from "./sr/memories";
import { resolverSr } from "./sr/resolver";
import { consentSr } from "./sr/consent";

export { fmt };
export type {
  Locale,
  Surface,
  DictBySurface,
  VenueDict,
  VenueEditorDict,
  MemoriesDict,
  ResolverDict,
  ConsentDict,
} from "./types";
export { venueSr, venueEditorSr, memoriesSr, resolverSr, consentSr };

const SR: DictBySurface = {
  venue: venueSr,
  "venue-editor": venueEditorSr,
  memories: memoriesSr,
  resolver: resolverSr,
  consent: consentSr,
};

export function getDict<S extends Surface>(surface: S): DictBySurface[S] {
  return SR[surface];
}
