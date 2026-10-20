// ScanMe Menu V1 (K21) — the Room service part of the published version as
// the public renderer reads it (master §5.3, §21.4: Room service inherits the
// design and the basic layout of the main menu, with its own selection,
// categories, order and prices). A category becomes a section; an article
// keeps everything it shares with the menu (name, description, media,
// allergens, add-ons) and carries the ROOM SERVICE price (base → markup →
// manual, decided at publish). A promotion of the standard menu never applies
// to Room service, so it is dropped here, exactly as the order is priced
// (lib/menu/cart.ts linePrice).

import type { PublicArticle, PublicPageMeta, PublicRoomServiceDoc, PublicSection } from "./snapshot";
import { MENU_ROOM_SERVICE_PATH } from "./guest-actions";

/** The pseudo page key of Room service (the version part `_rs`). */
export const ROOM_SERVICE_PAGE_KEY = "_rs";

export function roomServiceSections(doc: PublicRoomServiceDoc): PublicSection[] {
  return doc.categories
    .filter((category) => category.articles.length > 0)
    .map((category) => ({
      key: category.key,
      name: category.name,
      description: null,
      iconKey: null,
      articles: category.articles.map(
        (article): PublicArticle => ({
          key: article.key,
          kind: article.kind,
          name: article.name,
          description: article.description,
          quantityValue: article.quantityValue,
          quantityUnit: article.quantityUnit,
          priceRsd: article.priceRsd,
          variants: article.variants.map((variant) => ({ key: variant.key, name: variant.name, priceRsd: variant.priceRsd })),
          addonGroups: article.addonGroups,
          noteEnabled: article.noteEnabled,
          media: article.media,
          allergens: article.allergens,
          tags: article.tags,
          promo: null,
          combo: article.combo,
        }),
      ),
    }));
}

/** The page the renderer shows Room service as; `title` is the localized "Room service". */
export function roomServicePage(title: string): PublicPageMeta {
  return {
    key: ROOM_SERVICE_PAGE_KEY,
    slug: MENU_ROOM_SERVICE_PATH,
    title,
    isDefault: false,
    navigation: "standalone",
    iconKey: null,
  };
}
