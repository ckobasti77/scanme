// Menu import — the admin's line format → inline MenuModel (RFC-003 §2.9,
// TASK-58 "unos u ime klijenta"). The concierge transcribes a client's menu
// (a PDF, a photo, a napkin) as plain lines; this pure parser turns them into
// the same model the editor autosaves, and convex/menuAdmin.ts importDraft
// normalizes it on write exactly like saveDraft (clamp + text bounds).
//
//   # Naziv grupe | tip        ← a group; `tip` = default productType for its
//                                 items (default "jelo"); shape is always
//                                 "lista" (the admin refines shapes in the editor)
//   Naziv | 350 | opis         ← an item; price blank when variant-priced
//   - 0.3 l | 250              ← a variant of the item above
//
// Blank lines are ignored; items before any `#` land in an implicit group.
// Lines the parser cannot use produce a WARNING (never a throw): a menu with
// one odd line still imports, and the admin sees what was skipped.

import { defaults, itemDefaults, type MenuGroup, type MenuModel } from "./menu-blocks";

export const IMPORT_DEFAULT_PRODUCT_TYPE = "jelo";
export const IMPORT_IMPLICIT_GROUP_TITLE = "Ponuda";

export type MenuImportWarning = {
  line: number;
  code: "variant_without_item" | "bad_price" | "empty_name";
  text: string;
};

export type MenuImportResult = {
  model: MenuModel;
  warnings: MenuImportWarning[];
  groups: number;
  items: number;
  variants: number;
};

function makeId(): string {
  return crypto.randomUUID();
}

// "350", "1.200", "1 200", "350,00", "350 RSD" → 350; "" → undefined; junk → null.
export function parsePrice(raw: string): number | undefined | null {
  const text = raw.trim().replace(/rsd|din\.?|дин\.?/gi, "").trim();
  if (text === "") return undefined;
  const normalized = text.replace(/[\s.]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Math.round(Number(normalized));
}

function splitFields(line: string): string[] {
  return line.split("|").map((field) => field.trim());
}

export function parseMenuImport(text: string): MenuImportResult {
  const warnings: MenuImportWarning[] = [];
  const groups: MenuGroup[] = [];
  let current: MenuGroup | null = null;
  let currentType = IMPORT_DEFAULT_PRODUCT_TYPE;
  let lastItem: MenuGroup["items"][number] | null = null;
  let items = 0;
  let variants = 0;

  const ensureGroup = (): MenuGroup => {
    if (!current) {
      current = { ...defaults("lista"), base: { id: makeId(), title: IMPORT_IMPLICIT_GROUP_TITLE } };
      groups.push(current);
    }
    return current;
  };

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (line === "") return;

    if (line.startsWith("#")) {
      const [title, type] = splitFields(line.slice(1));
      current = {
        ...defaults("lista"),
        base: { id: makeId(), title: title || IMPORT_IMPLICIT_GROUP_TITLE },
      };
      groups.push(current);
      currentType = type || IMPORT_DEFAULT_PRODUCT_TYPE;
      lastItem = null;
      return;
    }

    if (/^[-•*]\s*/.test(line)) {
      const [label, priceRaw = ""] = splitFields(line.replace(/^[-•*]\s*/, ""));
      if (!lastItem) {
        warnings.push({ line: lineNumber, code: "variant_without_item", text: rawLine });
        return;
      }
      const price = parsePrice(priceRaw);
      if (price === null || price === undefined) {
        warnings.push({ line: lineNumber, code: "bad_price", text: rawLine });
        return;
      }
      lastItem.variants.push({ id: makeId(), label: label || "—", priceRsd: price });
      variants += 1;
      return;
    }

    const [name, priceRaw = "", ...rest] = splitFields(line);
    if (!name) {
      warnings.push({ line: lineNumber, code: "empty_name", text: rawLine });
      return;
    }
    const price = parsePrice(priceRaw);
    if (price === null) {
      warnings.push({ line: lineNumber, code: "bad_price", text: rawLine });
    }
    const description = rest.join(" | ").trim();
    const item = {
      ...itemDefaults(),
      id: makeId(),
      name,
      productType: currentType,
      ...(typeof price === "number" ? { priceRsd: price } : {}),
      ...(description ? { description } : {}),
    };
    ensureGroup().items.push(item);
    lastItem = item;
    items += 1;
  });

  return {
    model: { groups, dayparts: [] },
    warnings,
    groups: groups.length,
    items,
    variants,
  };
}
