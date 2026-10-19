import { describe, expect, test } from "vitest";
import { SYSTEMS } from "./catalog";
import { isPickable, modeForGroup, partVisual } from "./filter";

describe("filter grupe i režimi", () => {
  test("bez grupe: sve normalno u rendgenu i laku", () => {
    for (const s of SYSTEMS) {
      expect(partVisual(s.id, "rendgen", null)).toBe("normal");
      expect(partVisual(s.id, "lak", null)).toBe("normal");
    }
  });

  test("kostur sakriva samo karoseriju", () => {
    for (const s of SYSTEMS) expect(partVisual(s.id, "kostur", null)).toBe(s.id === "karoserija" ? "hidden" : "normal");
    expect(partVisual("karoserija", "kostur", "motor")).toBe("hidden");
  });

  test("grupa: isti sistem normalan, ostali prigušeni, u svakom režimu", () => {
    for (const mode of ["rendgen", "lak", "kostur"] as const) {
      expect(partVisual("motor", mode, "motor")).toBe("normal");
      expect(partVisual("prenos", mode, "motor")).toBe("dim");
    }
  });

  test("klik i hover samo na normalne delove", () => {
    expect(isPickable("normal")).toBe(true);
    expect(isPickable("dim")).toBe(false);
    expect(isPickable("hidden")).toBe(false);
  });

  test("grupa karoserija u kosturu vraća rendgen", () => {
    expect(modeForGroup("kostur", "karoserija")).toBe("rendgen");
    expect(modeForGroup("kostur", "motor")).toBe("kostur");
    expect(modeForGroup("lak", "karoserija")).toBe("lak");
  });
});
