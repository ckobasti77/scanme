import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { getDict } from "@/lib/i18n";
import {
  channelLabel,
  productLabel,
  selectionForVenue,
  sharedSmfRoot,
} from "@/lib/admin-v1/products-workspace";

const dict = getDict("admin-products");

describe("ADMIN-13 products presentation contracts", () => {
  test("uses only canonical product names", () => {
    expect(productLabel(dict, "two-piece-stand")).toBe("Dvodelni stalak");
    expect(productLabel(dict, "compact-stand")).toBe("Jednodelni stalak");
    expect(productLabel(dict, "stickers")).toBe("Nalepnica");
    expect(productLabel(dict, "window-film")).toBe("PVC folija");
    expect(productLabel(dict, "premium-engraved-stand")).toBe("Premium gravirani stalak");
  });

  test("maps every channel projection to accessible text", () => {
    expect(channelLabel(dict, "green")).toBe("Aktivan");
    expect(channelLabel(dict, "orange")).toBe("Neaktivan");
    expect(channelLabel(dict, "red")).toBe("Problem");
    expect(channelLabel(dict, "gray")).toBe("Kanal ne postoji");
  });

  test("shows the SMF root once and preserves only valid local selection", () => {
    expect(sharedSmfRoot(["SMF-0102-01-001", "SMF-0102-01-019"])).toBe("SMF-0102-01");
    expect(selectionForVenue(new Set(["one", "foreign"]), [{ id: "one" }, { id: "two" }])).toEqual(new Set(["one"]));
  });

  test("preserves a selected product when the next cursor page is appended", () => {
    const firstPage = [{ id: "one" }, { id: "two" }];
    const selected = selectionForVenue(new Set(["one"]), firstPage);
    const appended = [...firstPage, { id: "three" }, { id: "four" }];
    expect(selectionForVenue(selected, appended)).toEqual(new Set(["one"]));
  });

  test("prevents duplicate bulk submit and clears hidden selection when filters change", () => {
    const source = readFileSync(resolve(process.cwd(), "components/admin/admin-products-surface.tsx"), "utf8");
    expect(source).toContain("submitLocked.current) return");
    expect(source).toContain("submitLocked.current = true");
    expect(source).toContain("submitLocked.current = false");
    expect(source).toMatch(/const updateFilters[\s\S]*setSelection\(new Set\(\)\)[\s\S]*onInventoryFiltersChange/);
  });
});
