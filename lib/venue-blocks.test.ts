import { describe, expect, it } from "vitest";
import {
  clamp,
  clampBlockList,
  defaults,
  GALLERY_MAX_ITEMS,
  MAX_BLOCKS,
  PRICE_LIST_MAX_ITEMS,
  PROGRAM_MAX_ITEMS,
  VENUE_BLOCK_TYPES,
  type VenueBlock,
} from "./venue-blocks";

describe("defaults", () => {
  it("produces a block for every one of the twelve types", () => {
    expect(VENUE_BLOCK_TYPES).toHaveLength(12);
    for (const type of VENUE_BLOCK_TYPES) {
      const block = defaults(type);
      expect(block.type).toBe(type);
      expect(block.base.visible).toBe(true);
      expect(typeof block.base.id).toBe("string");
    }
  });

  it("is unchanged by clamp (defaults are already within caps)", () => {
    for (const type of VENUE_BLOCK_TYPES) {
      const block = defaults(type);
      expect(clamp(block)).toEqual(block);
    }
  });
});

// A gallery block carrying `count` items and out-of-range numerics.
function galleryWith(count: number, columns = 9, gap = 999): VenueBlock {
  return {
    type: "gallery",
    base: { id: "g", visible: true, radius: 9999 },
    props: {
      layout: "grid",
      columns,
      gap,
      aspect: "original",
      lightbox: true,
      items: Array.from({ length: count }, (_, i) => ({
        id: `i${i}`,
        storageId: "storage" as never,
      })),
    },
  };
}

describe("clamp — per-block item caps", () => {
  it("caps gallery items at 24", () => {
    const clamped = clamp(galleryWith(50));
    if (clamped.type !== "gallery") throw new Error("type changed");
    expect(clamped.props.items).toHaveLength(GALLERY_MAX_ITEMS);
  });

  it("caps programTimeline items at 40", () => {
    const block: VenueBlock = {
      type: "programTimeline",
      base: { id: "p", visible: true },
      props: {
        layout: "list",
        showTimes: true,
        items: Array.from({ length: 100 }, (_, i) => ({
          id: `t${i}`,
          title: `Act ${i}`,
        })),
      },
    };
    const clamped = clamp(block);
    if (clamped.type !== "programTimeline") throw new Error("type changed");
    expect(clamped.props.items).toHaveLength(PROGRAM_MAX_ITEMS);
  });

  it("caps total priceList items at 60 across sections", () => {
    const block: VenueBlock = {
      type: "priceList",
      base: { id: "m", visible: true },
      props: {
        currency: "RSD",
        sections: Array.from({ length: 5 }, (_, s) => ({
          id: `s${s}`,
          title: `Section ${s}`,
          items: Array.from({ length: 20 }, (_, i) => ({
            id: `s${s}i${i}`,
            name: `Item ${i}`,
          })),
        })),
      },
    };
    const clamped = clamp(block);
    if (clamped.type !== "priceList") throw new Error("type changed");
    const total = clamped.props.sections.reduce(
      (sum, s) => sum + s.items.length,
      0,
    );
    expect(total).toBe(PRICE_LIST_MAX_ITEMS);
  });
});

describe("clamp — numeric ranges", () => {
  it("clamps gallery columns to 1–4 and gap to 0–64", () => {
    const clamped = clamp(galleryWith(1, 9, 999));
    if (clamped.type !== "gallery") throw new Error("type changed");
    expect(clamped.props.columns).toBe(4);
    expect(clamped.props.gap).toBe(64);
  });

  it("clamps base radius to 0–120", () => {
    const clamped = clamp(galleryWith(1));
    expect(clamped.base.radius).toBe(120);
  });

  it("clamps map zoom to 1–21", () => {
    const block: VenueBlock = {
      type: "map",
      base: { id: "mp", visible: true },
      props: {
        location: { kind: "coords", lat: 44.8, lng: 20.4 },
        zoom: 99,
        display: "embed",
      },
    };
    const clamped = clamp(block);
    if (clamped.type !== "map") throw new Error("type changed");
    expect(clamped.props.zoom).toBe(21);
  });

  it("clamps spacer height and base spacing/border into range", () => {
    const block: VenueBlock = {
      type: "spacer",
      base: {
        id: "sp",
        visible: true,
        spacing: { top: -50, bottom: 9999 },
        border: { width: 999, color: "#000000" },
      },
      props: { height: 9999, divider: true },
    };
    const clamped = clamp(block);
    if (clamped.type !== "spacer") throw new Error("type changed");
    expect(clamped.props.height).toBe(400);
    expect(clamped.base.spacing).toEqual({ top: 0, bottom: 200 });
    expect(clamped.base.border?.width).toBe(24);
  });
});

describe("clamp — idempotency", () => {
  it("clamp(clamp(x)) === clamp(x) for overflowing blocks of every type", () => {
    const overflow: VenueBlock[] = [
      galleryWith(50),
      {
        type: "programTimeline",
        base: { id: "p", visible: true, radius: 5000 },
        props: {
          layout: "grid",
          showTimes: false,
          items: Array.from({ length: 80 }, (_, i) => ({
            id: `t${i}`,
            title: `A${i}`,
          })),
        },
      },
      {
        type: "priceList",
        base: { id: "m", visible: true },
        props: {
          currency: "RSD",
          sections: [
            {
              id: "s",
              title: "S",
              items: Array.from({ length: 90 }, (_, i) => ({
                id: `i${i}`,
                name: `N${i}`,
              })),
            },
          ],
        },
      },
      {
        type: "profileCards",
        base: { id: "pc", visible: true },
        props: { layout: "grid", columns: 42, items: [] },
      },
      {
        type: "pastEvents",
        base: { id: "pe", visible: true },
        props: { layout: "list", limit: 500 },
      },
    ];

    for (const block of overflow) {
      const once = clamp(block);
      const twice = clamp(once);
      expect(twice).toEqual(once);
    }
  });
});

describe("clampBlockList — the 30-block config cap", () => {
  it("truncates an over-long list to 30 and clamps each block", () => {
    const many = Array.from({ length: 45 }, () => galleryWith(50));
    const clamped = clampBlockList(many);
    expect(clamped).toHaveLength(MAX_BLOCKS);
    for (const block of clamped) {
      if (block.type !== "gallery") throw new Error("type changed");
      expect(block.props.items).toHaveLength(GALLERY_MAX_ITEMS);
    }
  });

  it("is idempotent", () => {
    const many = Array.from({ length: 45 }, () => galleryWith(50));
    const once = clampBlockList(many);
    const twice = clampBlockList(once);
    expect(twice).toEqual(once);
  });
});
