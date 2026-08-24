import { describe, expect, it } from "vitest";
import {
  ALL_LIBRARY_ICON_KEYS,
  ALL_LIBRARY_ICONS,
  ICON_CATEGORIES,
  ICON_LIBRARIES,
  getLibraryForIconKey,
  searchIcons,
} from "./scanme-icon-libraries";
import { ICON_KEYS, isIconKey } from "./scanme-links";

describe("ScanMe Icon Libraries", () => {
  it("defines exactly 5 top icon libraries including Ionicons", () => {
    expect(ICON_LIBRARIES).toHaveLength(5);
    const libraryIds = ICON_LIBRARIES.map((l) => l.id);
    expect(libraryIds).toEqual(["lucide", "fa6", "tabler", "ionicons", "phosphor"]);
  });

  it("contains icons for each category across all libraries", () => {
    expect(ICON_CATEGORIES).toHaveLength(5);

    for (const lib of ICON_LIBRARIES) {
      for (const cat of ICON_CATEGORIES) {
        const matching = ALL_LIBRARY_ICONS.filter(
          (i) => i.libraryId === lib.id && i.group === cat.key,
        );
        expect(
          matching.length,
          `Library ${lib.id} should have icons for category ${cat.key}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("correctly identifies library for prefixed and legacy keys", () => {
    expect(getLibraryForIconKey("lu:coffee")).toBe("lucide");
    expect(getLibraryForIconKey("fa6:FaMugHot")).toBe("fa6");
    expect(getLibraryForIconKey("tb:TbCoffee")).toBe("tabler");
    expect(getLibraryForIconKey("io5:IoCafeOutline")).toBe("ionicons");
    expect(getLibraryForIconKey("pi:PiCoffee")).toBe("phosphor");

    // Legacy fallback
    expect(getLibraryForIconKey("instagram")).toBe("lucide");
    expect(getLibraryForIconKey("coffee")).toBe("lucide");
    expect(getLibraryForIconKey("custom-unknown")).toBe("lucide");
  });

  it("searches icons by Serbian and English keywords", () => {
    const coffeeSearch = searchIcons("lucide", "kafa");
    expect(coffeeSearch.some((i) => i.key === "lu:coffee")).toBe(true);

    const phoneSearch = searchIcons("fa6", "telefon");
    expect(phoneSearch.some((i) => i.key === "fa6:FaPhone")).toBe(true);

    const pizzaSearch = searchIcons("tabler", "pizza");
    expect(pizzaSearch.some((i) => i.key === "tb:TbPizza")).toBe(true);

    const ioniconsCafe = searchIcons("ionicons", "kafa");
    expect(ioniconsCafe.some((i) => i.key === "io5:IoCafeOutline")).toBe(true);

    const emptySearch = searchIcons("ionicons", "nepostojeca_rec_12345");
    expect(emptySearch).toHaveLength(0);
  });

  it("registers all library icon keys in ICON_KEYS and isIconKey validator", () => {
    expect(ALL_LIBRARY_ICON_KEYS.length).toBeGreaterThan(200);

    for (const key of ALL_LIBRARY_ICON_KEYS) {
      expect(isIconKey(key)).toBe(true);
      expect(ICON_KEYS.includes(key)).toBe(true);
    }

    // Legacy keys remain valid
    expect(isIconKey("instagram")).toBe(true);
    expect(isIconKey("globe")).toBe(true);
    expect(isIconKey("coffee")).toBe(true);
    expect(isIconKey("invalid_key_xyz")).toBe(false);
  });
});
