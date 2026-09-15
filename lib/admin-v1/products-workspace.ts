import type { AdminProductsDict } from "@/lib/i18n/types";

export type AccessColor = "green" | "orange" | "red" | "gray";
export type ProductType =
  | "two-piece-stand"
  | "compact-stand"
  | "stickers"
  | "window-film"
  | "premium-engraved-stand";

export function channelLabel(dict: AdminProductsDict, color: AccessColor) {
  switch (color) {
    case "green":
      return dict.stateActive;
    case "orange":
      return dict.stateInactive;
    case "red":
      return dict.stateProblem;
    case "gray":
      return dict.stateAbsent;
  }
}

export function productLabel(dict: AdminProductsDict, type: ProductType) {
  switch (type) {
    case "two-piece-stand":
      return dict.productTypeTwoPiece;
    case "compact-stand":
      return dict.productTypeCompact;
    case "stickers":
      return dict.productTypeSticker;
    case "window-film":
      return dict.productTypeWindowFilm;
    case "premium-engraved-stand":
      return dict.productTypePremiumEngraved;
  }
}

export function sharedSmfRoot(values: readonly string[]) {
  if (!values.length) return null;
  const parts = values[0].split("-");
  let shared = parts.length;
  for (const value of values.slice(1)) {
    const candidate = value.split("-");
    shared = Math.min(shared, candidate.length);
    for (let index = 0; index < shared; index += 1) {
      if (candidate[index] !== parts[index]) {
        shared = index;
        break;
      }
    }
  }
  return shared ? parts.slice(0, shared).join("-") : null;
}

export function selectionForVenue<T extends { id: string }>(
  previous: ReadonlySet<string>,
  inventory: readonly T[],
) {
  const allowed = new Set(inventory.map((item) => item.id));
  return new Set([...previous].filter((id) => allowed.has(id)));
}
