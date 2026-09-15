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
import { memoriesWallSr } from "./sr/memories-wall";
import { resolverSr } from "./sr/resolver";
import { consentSr } from "./sr/consent";
import { privacySr } from "./sr/privacy";
import { offerSr } from "./sr/offer";
import { adminCustomersSr } from "./sr/admin-customers";
import { adminLocationSr } from "./sr/admin-location";
import { menuSr } from "./sr/menu";
import { menuEditorSr } from "./sr/menu-editor";
import { menuAdminSr } from "./sr/menu-admin";
import { orderingAdminSr } from "./sr/ordering-admin";
import { orderingSr } from "./sr/ordering";
import { orderingPanelSr } from "./sr/ordering-panel";
import { cardsAdminSr } from "./sr/cards-admin";
import { adminDomainSr } from "./sr/admin-domain";
import { adminV1Sr } from "./sr/admin-v1";
import { communicationsSr } from "./sr/communications";
import { adminTasksSr } from "./sr/admin-tasks";
import { adminOrdersSr } from "./sr/admin-orders";
import { adminProductsSr } from "./sr/admin-products";
import { adminTeamSr } from "./sr/admin-team";
import { adminFinanceSr } from "./sr/admin-finance";

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
  MemoriesWallDict,
  ResolverDict,
  ConsentDict,
  PrivacyDict,
  OfferDict,
  AdminCustomersDict,
  AdminLocationDict,
  MenuDict,
  MenuEditorDict,
  MenuAdminDict,
  OrderingAdminDict,
  OrderingDict,
  OrderingPanelDict,
  CardsAdminDict,
  AdminDomainDict,
  AdminV1Dict,
  CommunicationsDict,
  AdminTasksDict,
  AdminOrdersDict,
  AdminProductsDict,
  AdminTeamDict,
  AdminFinanceDict,
} from "./types";
export {
  venueSr,
  venueEditorSr,
  venueAdminSr,
  venuePanelSr,
  memoriesSr,
  memoriesAdminSr,
  memoriesPanelSr,
  memoriesWallSr,
  resolverSr,
  consentSr,
  privacySr,
  offerSr,
  adminCustomersSr,
  adminLocationSr,
  menuSr,
  menuEditorSr,
  menuAdminSr,
  orderingAdminSr,
  orderingSr,
  orderingPanelSr,
  cardsAdminSr,
  adminDomainSr,
  adminV1Sr,
  communicationsSr,
  adminTasksSr,
  adminOrdersSr,
  adminProductsSr,
  adminTeamSr,
  adminFinanceSr,
};

const SR: DictBySurface = {
  "admin-v1": adminV1Sr,
  communications: communicationsSr,
  "admin-tasks": adminTasksSr,
  "admin-orders": adminOrdersSr,
  "admin-products": adminProductsSr,
  "admin-team": adminTeamSr,
  "admin-finance": adminFinanceSr,
  "admin-domain": adminDomainSr,
  venue: venueSr,
  "venue-editor": venueEditorSr,
  "venue-admin": venueAdminSr,
  "venue-panel": venuePanelSr,
  memories: memoriesSr,
  "memories-admin": memoriesAdminSr,
  "memories-panel": memoriesPanelSr,
  "memories-wall": memoriesWallSr,
  resolver: resolverSr,
  consent: consentSr,
  privacy: privacySr,
  offer: offerSr,
  "admin-customers": adminCustomersSr,
  "admin-location": adminLocationSr,
  menu: menuSr,
  "menu-editor": menuEditorSr,
  "menu-admin": menuAdminSr,
  "ordering-admin": orderingAdminSr,
  ordering: orderingSr,
  "ordering-panel": orderingPanelSr,
  "cards-admin": cardsAdminSr,
};

export function getDict<S extends Surface>(surface: S): DictBySurface[S] {
  return SR[surface];
}
