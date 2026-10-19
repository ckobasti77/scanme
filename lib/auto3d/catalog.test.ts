import { describe, expect, test } from "vitest";
import { DECO_NODES, DECO_NODE_PATTERN, PARTS, PART_NODE_PATTERN, SYSTEMS, partNodes } from "./catalog";

describe("katalog 3D Rendgen limuzine", () => {
  test("deset sistema redom iz PLAN §4, sa heks bojama", () => {
    expect(SYSTEMS.map((s) => s.id)).toEqual([
      "karoserija",
      "enterijer",
      "motor",
      "usis_izduv",
      "hladjenje",
      "prenos",
      "vesanje",
      "kocnice",
      "energija",
      "elektrika",
    ]);
    for (const s of SYSTEMS) expect(s.color).toMatch(/^#[0-9A-F]{6}$/);
  });

  test("60–80 delova sa jedinstvenim ASCII snake_case id-jevima", () => {
    expect(PARTS.length).toBeGreaterThanOrEqual(60);
    expect(PARTS.length).toBeLessThanOrEqual(80);
    const ids = PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
  });

  test("svaki deo pripada postojećem sistemu i ima ispravne instance", () => {
    const systems = new Set<string>(SYSTEMS.map((s) => s.id));
    for (const p of PARTS) {
      expect(systems.has(p.system)).toBe(true);
      const inst = [...p.instances];
      expect(inst.length === 0 || JSON.stringify(inst) === '["l","d"]' || JSON.stringify(inst) === '["p","z"]').toBe(true);
    }
    for (const s of SYSTEMS) expect(PARTS.some((p) => p.system === s.id)).toBe(true);
  });

  test("imena čvorova odgovaraju ugovoru (102 klikabilna, 3 deco)", () => {
    const nodes = PARTS.flatMap((p) => partNodes(p));
    expect(nodes.length).toBe(102);
    expect(new Set(nodes).size).toBe(nodes.length);
    for (const n of nodes) expect(n).toMatch(PART_NODE_PATTERN);
    expect(DECO_NODES).toHaveLength(3);
    for (const d of DECO_NODES) expect(d).toMatch(DECO_NODE_PATTERN);
  });
});
