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

import { fmt, srPluralCategory } from "./format";
import type { DictBySurface, Surface } from "./types";
import { venueSr } from "./sr/venue";
import { venueEditorSr } from "./sr/venue-editor";
import { venueAdminSr } from "./sr/venue-admin";
import { venuePanelSr } from "./sr/venue-panel";
import { memoriesSr } from "./sr/memories";
import { memoriesAdminSr } from "./sr/memories-admin";
import { memoriesPanelSr } from "./sr/memories-panel";
import { resolverSr } from "./sr/resolver";
import { consentSr } from "./sr/consent";
import { privacySr } from "./sr/privacy";

export { fmt, srPluralCategory };
export type {
  Locale,
  Surface,
  DictBySurface,
  VenueDict,
  VenueEditorDict,
  VenueAdminDict,
  VenuePanelDict,
  MemoriesDict,
  MemoriesAdminDict,
  MemoriesPanelDict,
  ResolverDict,
  ConsentDict,
  PrivacyDict,
} from "./types";
export {
  venueSr,
  venueEditorSr,
  venueAdminSr,
  venuePanelSr,
  memoriesSr,
  memoriesAdminSr,
  memoriesPanelSr,
  resolverSr,
  consentSr,
  privacySr,
};

const SR: DictBySurface = {
  venue: venueSr,
  "venue-editor": venueEditorSr,
  "venue-admin": venueAdminSr,
  "venue-panel": venuePanelSr,
  memories: memoriesSr,
  "memories-admin": memoriesAdminSr,
  "memories-panel": memoriesPanelSr,
  resolver: resolverSr,
  consent: consentSr,
  privacy: privacySr,
};

export function getDict<S extends Surface>(surface: S): DictBySurface[S] {
  return SR[surface];
}
