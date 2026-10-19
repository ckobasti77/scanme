import { describe, expect, test } from "vitest";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { hexToRgb } from "./color";
import { DEFAULT_PAINT, isPaintId, paintById, PAINTS } from "./paints";

/** Relativna luminansa (WCAG) sRGB boje. */
function luminance(hex: string): number {
  const lin = hexToRgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

describe("boje laka", () => {
  test("šest jedinstvenih boja", () => {
    expect(PAINTS).toHaveLength(6);
    expect(new Set(PAINTS.map((p) => p.id)).size).toBe(6);
    expect(new Set(PAINTS.map((p) => p.hex.toUpperCase())).size).toBe(6);
    for (const p of PAINTS) expect(p.hex).toMatch(/^#[0-9A-F]{6}$/i);
  });

  test("podrazumevana je tamni grafit metalik (napomena nadzora 17. 10.)", () => {
    expect(DEFAULT_PAINT).toBe("grafit");
    const d = paintById(DEFAULT_PAINT);
    expect(luminance(d.hex)).toBeLessThan(0.05);
    expect(d.metalness).toBeGreaterThanOrEqual(0.5);
  });

  test("svetle boje ostaju u izboru: srebro je metalik, bela nije", () => {
    expect(paintById("srebro").metalness).toBeGreaterThan(0.7);
    expect(paintById("bela").metalness).toBeLessThan(0.2);
    expect(luminance(paintById("bela").hex)).toBeGreaterThan(0.7);
  });

  test("parametri laka su u granicama", () => {
    for (const p of PAINTS) {
      expect(p.metalness).toBeGreaterThanOrEqual(0);
      expect(p.metalness).toBeLessThanOrEqual(1);
      expect(p.roughness).toBeGreaterThan(0.1);
      expect(p.roughness).toBeLessThan(0.6);
    }
  });

  test("svaka boja ima naziv u rečniku", () => {
    const names: Record<string, string> = {
      grafit: t.paintGrafit,
      plava: t.paintPlava,
      crvena: t.paintCrvena,
      zelena: t.paintZelena,
      srebro: t.paintSrebro,
      bela: t.paintBela,
    };
    for (const p of PAINTS) expect(names[p.id]?.trim().length, p.id).toBeGreaterThan(2);
  });

  test("nepoznat id daje podrazumevanu boju", () => {
    expect(isPaintId("grafit")).toBe(true);
    expect(isPaintId("roze")).toBe(false);
    expect(paintById("roze").id).toBe(DEFAULT_PAINT);
  });
});
