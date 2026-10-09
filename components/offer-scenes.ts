import type { ProductId } from "@/lib/scanme-pricing";

// Scene photos behind the physical products — shared by the /ponuda
// configurator and the landing showcase (#proizvodi).
export const SCENE_ASSETS = {
  stickers: "/offer/scenes/stickers-tabletop-v2.webp",
  windowFilm: "/offer/scenes/window-film-storefront-door-v1.webp",
  twoPiece: "/offer/scenes/two-piece-stand-cafe-table-v1.webp",
  compact: "/offer/scenes/compact-stand-cafe-counter-v2.webp",
  counter: "/offer/scenes/counter-studio.webp",
  reception: "/offer/scenes/premium-reception.webp",
} as const;

export type SceneId = keyof typeof SCENE_ASSETS;

export const PRODUCT_SCENES: Record<ProductId, SceneId> = {
  stickers: "stickers",
  "window-film": "windowFilm",
  "two-piece-stand": "twoPiece",
  "compact-stand": "compact",
  "premium-engraved-stand": "reception",
};
