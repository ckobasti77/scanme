import { describe, expect, it } from "vitest";
import { normalizePaletteAnalysis } from "./scanMeLinks";

describe("normalizePaletteAnalysis", () => {
  it("skraćuje prevelike grupe umesto da baca grešku", () => {
    const oversized = {
      original: Array.from({ length: 10 }, () => "#112233"),
      adjusted: Array.from({ length: 10 }, () => "#445566"),
      correctedRoles: Array.from({ length: 10 }, () => "primary"),
      lockedSlots: Array.from({ length: 7 }, () => false),
    };

    let result: ReturnType<typeof normalizePaletteAnalysis>;
    expect(() => {
      result = normalizePaletteAnalysis(oversized);
    }).not.toThrow();

    expect(result!.original).toHaveLength(8);
    expect(result!.adjusted).toHaveLength(8);
    expect(result!.correctedRoles).toHaveLength(8);
    expect(result!.lockedSlots).toHaveLength(5);
  });

  it("ostavlja grupe unutar limita netaknute", () => {
    const result = normalizePaletteAnalysis({
      original: ["#112233", "#445566"],
      adjusted: ["#778899"],
      correctedRoles: ["primary", "accent"],
    });

    expect(result!.original).toEqual(["#112233", "#445566"]);
    expect(result!.adjusted).toEqual(["#778899"]);
    expect(result!.correctedRoles).toEqual(["primary", "accent"]);
  });

  it("vraća undefined za praznu analizu", () => {
    expect(normalizePaletteAnalysis(null)).toBeUndefined();
    expect(normalizePaletteAnalysis(undefined)).toBeUndefined();
  });
});
