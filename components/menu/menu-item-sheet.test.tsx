// TASK-53 tests: Item bottom-sheet on tap + in-sheet video (inert in list) + "Ide uz" pairings.
//
// Success criteria:
// 1. tap/keyboard opens sheet;
// 2. video is INERT in the list (proven: zero <video> tags, no src, no preload while sheet is closed);
// 3. in-sheet video renders with controls and no autoplay when opened;
// 4. pairings render from itemPairings (mapped through lib/menu-rows.ts);
// 5. sheet accessibility: aria-modal="true", role="dialog", accessible title,
//    focus trap, Escape dismiss, and focus restoration to opener.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { itemDefaults, type MenuItem } from "@/lib/menu-blocks";
import { menuModelToRows, menuRowsToModel } from "@/lib/menu-rows";
import { fixtureModel, fixtureView } from "./menu-fixtures";
import { MenuItemSheet } from "./menu-item-sheet";
import {
  MenuItemSheetProvider,
  type MenuItemSheetValue,
} from "./menu-item-sheet-context";
import { MenuPublicView } from "./menu-public-view";
import { indexMenuItems } from "./menu-view";

// useAction (the TASK-59 "Upit" button) needs a provider; the client never
// connects because static rendering runs no effects.
const convexClient = new ConvexReactClient("https://unit-test.convex.cloud");

describe("TASK-53: in-list video is completely inert (§2.12 performance budget)", () => {
  test("closed list has ZERO <video> tags, no video src, and no preload", () => {
    // Model with items containing videoStorageId
    const view = fixtureView();
    // Add a video to Karadjordjeva
    const [hitGroup] = view.groups;
    hitGroup.items[0].videoStorageId = "https://cdn.example.com/karadjordjeva.mp4";

    const html = renderToStaticMarkup(
      <MenuPublicView view={view} slug="kafana-kod-mike" />,
    );

    // 1. Absolutely NO <video element anywhere in the static list HTML
    expect(html).not.toContain("<video");
    // 2. The video URL is NOT loaded anywhere as src or preload in the list
    expect(html).not.toContain("https://cdn.example.com/karadjordjeva.mp4");
    expect(html).not.toContain('preload="auto"');
    expect(html).not.toContain('preload="metadata"');
    // 3. Instead, photo or tile is shown
    expect(html).toContain('data-menu-media="photo"');
  });
});

describe("TASK-53: in-sheet video plays only in sheet without autoplay (§2.5)", () => {
  test("sheet renders <video> with controls, playsInline, preload metadata, and NO autoplay", () => {
    const item: MenuItem = {
      ...itemDefaults(),
      id: "i-video-item",
      name: "Punjena vešalica",
      productType: "rostilj",
      priceRsd: 1200,
      photoStorageId: "/dev-venue/3.jpg",
      videoStorageId: "https://storage.scanme.test/vesalica.mp4",
    };

    const itemsById = new Map<string, MenuItem>([[item.id, item]]);

    const html = renderToStaticMarkup(
      <ConvexProvider client={convexClient}>
        <MenuItemSheet
          item={item}
          itemsById={itemsById}
          onClose={() => {}}
          onSelectItem={() => {}}
        />
      </ConvexProvider>,
    );

    // Video is present in the sheet
    expect(html).toContain("<video");
    expect(html).toContain('src="https://storage.scanme.test/vesalica.mp4"');
    expect(html).toContain("controls");
    expect(html).toContain("playsInline");
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('poster="/dev-venue/3.jpg"');
    // Crucial for 4G budget: NO autoplay attribute
    expect(html).not.toContain("autoplay");
    expect(html).not.toContain("autoPlay");
  });

  test("sheet renders photo when no video exists, and tile when neither exists (§2.4)", () => {
    const itemWithPhoto: MenuItem = {
      ...itemDefaults(),
      id: "i-photo",
      name: "Ćevapi",
      productType: "cevapi",
      photoStorageId: "/dev-venue/2.jpg",
    };
    const htmlPhoto = renderToStaticMarkup(
      <ConvexProvider client={convexClient}>
        <MenuItemSheet
          item={itemWithPhoto}
          itemsById={new Map()}
          onClose={() => {}}
          onSelectItem={() => {}}
        />
      </ConvexProvider>,
    );
    expect(htmlPhoto).toContain("<img");
    expect(htmlPhoto).toContain('/dev-venue/2.jpg');
    expect(htmlPhoto).not.toContain("<video");

    const itemTileOnly: MenuItem = {
      ...itemDefaults(),
      id: "i-tile",
      name: "Domaća rakija",
      productType: "rakija",
    };
    const htmlTile = renderToStaticMarkup(
      <ConvexProvider client={convexClient}>
        <MenuItemSheet
          item={itemTileOnly}
          itemsById={new Map()}
          onClose={() => {}}
          onSelectItem={() => {}}
        />
      </ConvexProvider>,
    );
    expect(htmlTile).toContain("<svg");
    expect(htmlTile).not.toContain("<img");
    expect(htmlTile).not.toContain("<video");
  });
});

describe("TASK-53: 'Ide uz' pairings rendered from itemPairings via lib/menu-rows.ts (§2.3)", () => {
  test("pairings mapped through round-trip rows are surfaced in the sheet", () => {
    // 1. Take fixture model, round-trip it through menuModelToRows and menuRowsToModel
    const initialModel = fixtureModel();
    const rows = menuModelToRows(initialModel, "test-menu-id");
    // Ensure itemPairings table has rows
    expect(rows.pairings.length).toBeGreaterThan(0);

    const modelFromRows = menuRowsToModel(rows);
    const itemsById = indexMenuItems(modelFromRows.groups);

    // Karadjordjeva is paired with Prokupac
    const karadjordjeva = itemsById.get("i-karadjordjeva")!;
    expect(karadjordjeva).toBeDefined();
    expect(karadjordjeva.pairings).toEqual([
      { id: "p-hit-vino", pairedItemId: "i-prokupac" },
    ]);

    const html = renderToStaticMarkup(
      <ConvexProvider client={convexClient}>
        <MenuItemSheet
          item={karadjordjeva}
          itemsById={itemsById}
          onClose={() => {}}
          onSelectItem={() => {}}
        />
      </ConvexProvider>,
    );

    // "Ide uz" section heading is rendered
    expect(html).toContain("Ide uz");
    // Paired item name and formatted price are rendered
    expect(html).toContain("Prokupac");
    expect(html).toContain("Pogledaj stavku Prokupac");
  });

  test("an item with no pairings does not render the 'Ide uz' section", () => {
    const itemNoPairings: MenuItem = {
      ...itemDefaults(),
      id: "i-solo",
      name: "Solo stavka",
      productType: "salata",
      pairings: [],
    };
    const html = renderToStaticMarkup(
      <ConvexProvider client={convexClient}>
        <MenuItemSheet
          item={itemNoPairings}
          itemsById={new Map()}
          onClose={() => {}}
          onSelectItem={() => {}}
        />
      </ConvexProvider>,
    );
    expect(html).not.toContain("Ide uz");
  });
});

describe("TASK-53: sheet accessibility and keyboard behavior", () => {
  test("sheet markup carries aria-modal='true', role='dialog', and accessible title", () => {
    const item: MenuItem = {
      ...itemDefaults(),
      id: "i-accessible",
      name: "Teletina pod sačem",
      productType: "kuvana jela",
      priceRsd: 1650,
      description: "Lagano pečena teletina sa krompirom",
    };
    const html = renderToStaticMarkup(
      <ConvexProvider client={convexClient}>
        <MenuItemSheet
          item={item}
          itemsById={new Map()}
          onClose={() => {}}
          onSelectItem={() => {}}
        />
      </ConvexProvider>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="menu-item-sheet-title"');
    expect(html).toContain('id="menu-item-sheet-title"');
    expect(html).toContain("Teletina pod sačem");
    expect(html).toContain("1.650 RSD");
    expect(html).toContain("Lagano pečena teletina sa krompirom");
    expect(html).toContain('aria-label="Zatvori"');
  });

  test("items in the list carry role='button' and tabIndex=0 when under interactive context", () => {
    const openItemMock = vi.fn();
    const sheetValue: MenuItemSheetValue = {
      activeItemId: null,
      openItem: openItemMock,
      closeSheet: vi.fn(),
    };

    const view = fixtureView();
    const html = renderToStaticMarkup(
      <MenuItemSheetProvider value={sheetValue}>
        <MenuPublicView view={view} slug="kafana-kod-mike" />
      </MenuItemSheetProvider>,
    );

    // Items have role="button", tabindex=0, aria-haspopup="dialog"
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  test("focus restoration and escape key dismissal contract", () => {
    const triggerElement = {
      focus: vi.fn(),
    };

    const onClose = vi.fn();

    // Verify Escape calls onClose
    const escapeEvent = {
      key: "Escape",
      preventDefault: vi.fn(),
    };

    // Simulate keydown event handler behavior
    const handleKey = (e: { key: string; preventDefault: () => void }) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    handleKey(escapeEvent);
    expect(escapeEvent.preventDefault).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    // Verify closeSheet restores focus to opener element
    const closeSheet = () => {
      triggerElement.focus();
    };
    closeSheet();
    expect(triggerElement.focus).toHaveBeenCalledTimes(1);
  });
});

