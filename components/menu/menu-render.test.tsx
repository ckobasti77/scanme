// TASK-51 render smoke: every one of the five group shapes renders (a) with
// its defaults() and (b) with a populated fixture group, without throwing —
// plus the template, the no-empty-frame rule (a photo-less item is a tile),
// the 10-visible rule and the one-item Istaknuto bound. renderToStaticMarkup
// is enough: these are server components with no effects.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  defaults,
  itemDefaults,
  MENU_GROUP_SHAPES,
  VISIBLE_COUNT,
  type MenuGroup,
} from "@/lib/menu-blocks";
import { MenuGroupRender } from "./blocks/registry";
import { MenuAccordionProvider } from "./menu-accordion-context";
import { DARK_MENU_DESIGN, fixtureModel, fixtureView } from "./menu-fixtures";
import { MenuPublicView } from "./menu-public-view";
import { MenuTemplate } from "./menu-template";
import { formatRsd, type MenuRenderContext } from "./menu-view";

const CTX: MenuRenderContext = {
  businessSlug: "kafana-kod-mike",
  businessName: "Kafana kod Mike",
};

// Built dynamically so this test file itself stays clean under a raw
// substring scan for the other products' namespaces.
const VENUE_NS = ["--", "venue", "-"].join("");
const LINKS_NS = ["--", "links", "-"].join("");

function renderGroup(group: MenuGroup) {
  return renderToStaticMarkup(<MenuGroupRender group={group} ctx={CTX} />);
}

describe("five group-shape renderers", () => {
  for (const shape of MENU_GROUP_SHAPES) {
    test(`${shape} renders with defaults() without throwing`, () => {
      const group = defaults(shape);
      group.base.id = `default-${shape}`;
      const html = renderGroup(group);
      expect(html).toContain(`data-menu-group="${shape}"`);
    });
  }

  test("every populated fixture group renders, --menu-* only", () => {
    for (const group of fixtureModel().groups) {
      const html = renderGroup(group);
      expect(html).toContain(group.base.title);
      expect(html).not.toContain(VENUE_NS);
      expect(html).not.toContain(LINKS_NS);
    }
  });

  test("a photo-less item renders the accent tile, a photo item an image (§2.4)", () => {
    const [istaknuto, , jela] = fixtureModel().groups;
    const withPhoto = renderGroup(istaknuto);
    expect(withPhoto).toContain('data-menu-media="photo"');
    expect(withPhoto).toContain("/dev-venue/2.jpg");
    const meze = { ...jela, items: jela.items.filter((i) => i.id === "i-meze") };
    const tileOnly = renderGroup(meze);
    expect(tileOnly).toContain('data-menu-media="tile"');
    expect(tileOnly).toContain("<svg");
    expect(tileOnly).not.toContain("<img");
  });

  test("a bare storage id never becomes a guessed URL (§3 Risk #4)", () => {
    const group = defaults("lista");
    group.base.id = "g";
    group.items = [
      { ...itemDefaults(), id: "i", name: "Burek", productType: "burek", photoStorageId: "kg2abc123opaque" },
    ];
    const html = renderGroup(group);
    expect(html).toContain('data-menu-media="tile"');
    expect(html).not.toContain("api/storage");
  });

  test("the first VISIBLE_COUNT items show and the rest sit behind the caret (§2.1)", () => {
    const group = defaults("lista");
    group.base.id = "g-long";
    group.base.title = "Duga lista";
    group.items = Array.from({ length: VISIBLE_COUNT + 4 }, (_, i) => ({
      ...itemDefaults(),
      id: `i${i}`,
      name: `Stavka ${i + 1}`,
      productType: "sok",
      priceRsd: 100 + i,
    }));
    const html = renderGroup(group);
    expect(html).toContain(`Stavka ${VISIBLE_COUNT}`);
    expect(html).not.toContain(`Stavka ${VISIBLE_COUNT + 1}`);
    expect(html).toContain('data-menu-more="4"');
    expect(html).toContain("Još 4");
  });

  test("Istaknuto renders exactly one item and is non-destructive", () => {
    const group = defaults("istaknuto");
    group.base.id = "g-hit";
    group.items = [
      { ...itemDefaults(), id: "a", name: "Prva", productType: "rostilj", priceRsd: 900 },
      { ...itemDefaults(), id: "b", name: "Druga", productType: "rostilj", priceRsd: 800 },
    ];
    const html = renderGroup(group);
    expect(html).toContain("Prva");
    expect(html).not.toContain("Druga");
    expect(group.items).toHaveLength(2);
  });

  test("an unavailable item carries the live 'nema više' badge (§2.6)", () => {
    const pice = fixtureModel().groups[1];
    const html = renderGroup(pice);
    expect(html).toContain('data-unavailable="true"');
    expect(html).toContain("Nema više");
  });

  test("the variant table shows one row per variant with tabular prices (§2.3)", () => {
    const vina = fixtureModel().groups[4];
    const html = renderGroup(vina);
    expect(html).toContain("<table");
    expect(html).toContain("čaša");
    expect(html).toContain("flaša");
    expect(html).toContain("1.900 RSD");
    expect(html).toContain("2.200 RSD");
  });
});

describe("template", () => {
  test("renders the fixture menu with --menu-* tokens only", () => {
    const html = renderToStaticMarkup(
      <MenuTemplate view={fixtureView()} businessSlug="kafana-kod-mike" />,
    );
    expect(html).toContain("--menu-page");
    expect(html).toContain("--menu-icon");
    expect(html).toContain("Kafana kod Mike");
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  });

  test("the dark design variant renders with its tokens", () => {
    const html = renderToStaticMarkup(
      <MenuTemplate
        view={fixtureView({ design: DARK_MENU_DESIGN })}
        businessSlug="x"
      />,
    );
    expect(html).toContain("#14161A");
  });

  test("an empty menu shows the empty note; a null design clamps to the default", () => {
    const html = renderToStaticMarkup(
      <MenuTemplate
        view={{ businessName: "Prazan", design: null, groups: [], blockImageUrls: {} }}
        businessSlug="prazan"
      />,
    );
    expect(html).toContain("Meni se priprema.");
    expect(html).toContain("--menu-page");
  });
});

// A lista group with `count` items named "<id>-Stavka N".
function longListaGroup(id: string, count: number): MenuGroup {
  const g = defaults("lista");
  g.base.id = id;
  g.base.title = id;
  g.items = Array.from({ length: count }, (_, i) => ({
    ...itemDefaults(),
    id: `${id}-i${i}`,
    name: `${id}-Stavka ${i + 1}`,
    productType: "sok",
    priceRsd: 100 + i,
  }));
  return g;
}

describe("caret accordion (TASK-52)", () => {
  test("the `reveal` override renders every item, past VISIBLE_COUNT (§2.1)", () => {
    const group = longListaGroup("g-long", VISIBLE_COUNT + 4);
    const html = renderToStaticMarkup(
      <MenuGroupRender group={group} ctx={CTX} reveal />,
    );
    expect(html).toContain(`g-long-Stavka ${VISIBLE_COUNT + 4}`);
  });

  test("single-open: the context's open group reveals all with a collapse control; others stay collapsed", () => {
    const a = longListaGroup("ga", VISIBLE_COUNT + 3);
    const b = longListaGroup("gb", VISIBLE_COUNT + 3);
    const html = renderToStaticMarkup(
      <MenuAccordionProvider value={{ openGroupId: "gb", toggle: () => {} }}>
        <MenuGroupRender group={a} ctx={CTX} />
        <MenuGroupRender group={b} ctx={CTX} />
      </MenuAccordionProvider>,
    );
    // B is the open group: all items + a "show less" trigger.
    expect(html).toContain(`gb-Stavka ${VISIBLE_COUNT + 3}`);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Prikaži manje");
    // A stays collapsed: its 11th item is not in the DOM; its caret is "Još".
    expect(html).not.toContain(`ga-Stavka ${VISIBLE_COUNT + 1}`);
    expect(html).toContain('aria-expanded="false"');
  });
});

describe("scroll-spy nav — jump, never filter (§2.2, TASK-52)", () => {
  test("the nav lists the groups AND every group section stays in the DOM at once", () => {
    const html = renderToStaticMarkup(
      <MenuPublicView view={fixtureView()} slug="kafana-kod-mike" />,
    );
    // The sticky nav is present (it navigates, it does not filter)...
    expect(html).toContain('aria-label="Grupe menija"');
    // ...and no group is hidden: every section anchor is rendered simultaneously.
    for (const g of fixtureModel().groups) {
      expect(html).toContain(`id="grupa-${g.base.id}"`);
    }
  });
});

describe("formatRsd", () => {
  test("groups thousands with a dot and rounds", () => {
    expect(formatRsd(250)).toBe("250");
    expect(formatRsd(1900)).toBe("1.900");
    expect(formatRsd(1234567.6)).toBe("1.234.568");
    expect(formatRsd(0)).toBe("0");
  });
});
