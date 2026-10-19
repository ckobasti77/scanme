import { describe, expect, test } from "vitest";
import { fairAuto3dSr } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { PARTS, SYSTEMS } from "./catalog";

const dict = fairAuto3dDeloviSr;

/** Svi tekstovi rečnika, i iz ugnježdenih objekata i nizova (A11: `packages`), sa putanjom ključa. */
function leaves(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (node && typeof node === "object") return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

function sentences(text: string): number {
  return (text.match(/[.?]( |$)/g) ?? []).length;
}

describe("rečnik delova (fair-auto3d-delovi)", () => {
  test("svaki sistem i deo iz kataloga ima tekst, bez viška", () => {
    expect(Object.keys(dict.systems).sort()).toEqual(SYSTEMS.map((s) => s.id).sort());
    expect(Object.keys(dict.parts).sort()).toEqual(PARTS.map((p) => p.id).sort());
  });

  test("opisi sistema su jedna rečenica do 140 znakova", () => {
    for (const s of Object.values(dict.systems)) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.description.length).toBeLessThanOrEqual(140);
    }
  });

  test("kartica: naziv, 1–2 rečenice opisa, 3–6 specifikacija, zanimljivost", () => {
    for (const [id, p] of Object.entries(dict.parts)) {
      const at = `deo ${id}`;
      expect(p.name.length, at).toBeGreaterThan(0);
      expect(p.name.length, at).toBeLessThanOrEqual(48);
      expect(p.description.length, at).toBeGreaterThan(40);
      expect(p.description.length, at).toBeLessThanOrEqual(240);
      expect(sentences(p.description), at).toBeGreaterThanOrEqual(1);
      expect(sentences(p.description), at).toBeLessThanOrEqual(2);
      expect(p.specs.length, at).toBeGreaterThanOrEqual(3);
      expect(p.specs.length, at).toBeLessThanOrEqual(6);
      for (const s of p.specs) {
        expect(s.label.trim().length, at).toBeGreaterThan(0);
        expect(s.value.trim().length, at).toBeGreaterThan(0);
        expect(s.label.length, at).toBeLessThanOrEqual(22);
        expect(s.value.length, at).toBeLessThanOrEqual(26);
        expect(s.value, `${at}: razmak između broja i jedinice`).not.toMatch(/\d(Nm|kg|mm|cm|kW|KS|bar|Ah|kWh|V|l|m)\b/);
      }
      expect(p.fact.length, at).toBeGreaterThan(20);
      expect(p.fact.length, at).toBeLessThanOrEqual(180);
    }
  });

  test("bez uzvičnika, TODO i probnog teksta", () => {
    const all = JSON.stringify(dict);
    expect(all).not.toMatch(/!/);
    expect(all).not.toMatch(/TODO|lorem/i);
  });
});

describe("rečnik stranice (fair-auto3d)", () => {
  test("bez praznih vrednosti, uzvičnika, TODO i probnog teksta", () => {
    for (const [key, value] of leaves(fairAuto3dSr)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toMatch(/!/);
      expect(value, key).not.toMatch(/TODO|lorem/i);
    }
  });

  test("razmak između broja i jedinice", () => {
    for (const [key, value] of leaves(fairAuto3dSr)) {
      expect(value, key).not.toMatch(/\d(Nm|kg|mm|cm|kW|KS|bar|Ah|kWh|V|l|m|MB|RSD)\b/);
    }
  });
});
