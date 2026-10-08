import { expect, test } from "vitest";
import { fairBrandEmblem } from "./brand-emblems";

test("a curated square emblem by brand name; none for the rest", () => {
  expect(fairBrandEmblem("JMEV")).toBe("/fair/elektromobilnost-2026/jmev-emblem.png");
  expect(fairBrandEmblem("TEST JMEV")).toBe("/fair/elektromobilnost-2026/jmev-emblem.png");
  expect(fairBrandEmblem("Mazda")).toBeNull();
  expect(fairBrandEmblem("constructor")).toBeNull();
});
