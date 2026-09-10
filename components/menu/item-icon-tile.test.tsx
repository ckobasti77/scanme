// TASK-50 snapshot: every known product type renders a tile with a glyph
// (never an empty frame), an unknown/random product type still renders the
// default glyph (totality — RFC-003 §2.4, §5 Q2: `productType` is a free
// string, so the map can never be exhaustive by construction), and the icons
// are inline SVG with no network dependency.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MenuItemIconTile } from "./item-icon-tile";
import {
  DEFAULT_MENU_GLYPH,
  glyphForProductType,
  MENU_KNOWN_PRODUCT_TYPES,
} from "./menu-glyph-map";

function renderTile(productType: string, iconKey?: string) {
  return renderToStaticMarkup(
    <MenuItemIconTile productType={productType} iconKey={iconKey} />,
  );
}

describe("MenuItemIconTile — no-empty-frame rule", () => {
  test("every known product type has its own glyph", () => {
    expect(MENU_KNOWN_PRODUCT_TYPES.length).toBeGreaterThanOrEqual(20);
    for (const productType of MENU_KNOWN_PRODUCT_TYPES) {
      const html = renderTile(productType);
      expect(html).toContain("<svg");
      expect(html).toContain("</svg>");
    }
  });

  test("known product types produce a snapshot of distinct tiles", () => {
    const rendered = Object.fromEntries(
      MENU_KNOWN_PRODUCT_TYPES.map((productType) => [
        productType,
        renderTile(productType),
      ]),
    );
    expect(rendered).toMatchSnapshot();
  });

  test("diacritics and case do not change the resolved glyph", () => {
    expect(renderTile("Ćevapi")).toBe(renderTile("cevapi"));
    expect(renderTile("ROŠTILJ")).toBe(renderTile("rostilj"));
  });

  test("an unknown product type still renders a full tile (never empty)", () => {
    const unknown = [
      "grincki-tartar-fuzija-42",
      "",
      "   ",
      "🍕🍕🍕",
      Math.random().toString(36),
    ];
    for (const productType of unknown) {
      const html = renderTile(productType);
      expect(html).toContain("<svg");
      expect(html).toContain("</svg>");
      expect(html.length).toBeGreaterThan(0);
    }
  });

  test("glyphForProductType is total: never undefined for any string", () => {
    const samples = [
      "",
      " ",
      "unknown-type",
      "rakija",
      "Rakija",
      "RAKIJA ",
      String(Math.random()),
      "\n\t",
      "null",
      "undefined",
    ];
    for (const sample of samples) {
      const glyph = glyphForProductType(sample);
      expect(glyph).toBeDefined();
      expect(glyph).not.toBeNull();
    }
  });

  test("an unrecognized type falls back to the default glyph", () => {
    expect(glyphForProductType("does-not-exist-as-a-type")).toBe(
      DEFAULT_MENU_GLYPH,
    );
  });

  test("a per-item iconKey override wins over productType", () => {
    // "vino" overrides a productType of "sok" — the tile must resolve to the
    // override's glyph, not the productType default.
    expect(renderTile("sok", "vino")).toBe(renderTile("vino"));
  });
});
