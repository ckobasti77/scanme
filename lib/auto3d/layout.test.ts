import { describe, expect, test } from "vitest";
import { partsOfSystem, neighbors, SYSTEM_PART_COUNT } from "./groups";
import { PARTS, SYSTEMS } from "./catalog";
import { railsFor, studioLayout } from "./layout";

describe("raspored studija (E1, E20)", () => {
  test("trake od 1024 px, šire od 1280 px", () => {
    expect(railsFor(1023)).toBeNull();
    expect(railsFor(1024)).toEqual({ rail: 216, panel: 344 });
    expect(railsFor(1280)).toEqual({ rail: 248, panel: 384 });
  });

  test("desktop 1440: poster iza trake, slobodna zona između trake i panela", () => {
    const l = studioLayout(1376, 748, "desktop", 1440);
    expect(l.posterBox).toEqual({ x: 264, y: 0, w: 1112, h: 748 });
    expect(l.freeArea).toEqual({ x: 280, y: 76, w: 680, h: 748 - 76 - 88 });
    expect(l.freeArea.x + l.freeArea.w).toBe(1376 - 16 - 384 - 16);
  });

  test("tablet (desktop poster, raspored kao telefon) i telefon: ceo studio je poster", () => {
    const tablet = studioLayout(768, 520, "desktop", 768);
    expect(tablet.posterBox).toEqual({ x: 0, y: 0, w: 768, h: 520 });
    const phone = studioLayout(390, 473, "telefon", 390);
    expect(phone.posterBox).toEqual({ x: 0, y: 0, w: 390, h: 473 });
    expect(phone.freeArea).toEqual({ x: 12, y: 68, w: 366, h: 473 - 68 - 100 });
    expect(tablet.freeArea).toEqual({ x: 12, y: 68, w: 744, h: 520 - 68 - 76 });
  });

  test("slobodna zona nikad nije manja od 80 px", () => {
    const l = studioLayout(300, 120, "desktop", 1280);
    expect(l.freeArea.w).toBeGreaterThanOrEqual(80);
    expect(l.freeArea.h).toBeGreaterThanOrEqual(80);
  });
});

describe("grupe delova", () => {
  test("broj delova po grupi daje ceo katalog", () => {
    const total = SYSTEMS.reduce((sum, s) => sum + SYSTEM_PART_COUNT[s.id], 0);
    expect(total).toBe(PARTS.length);
    expect(SYSTEM_PART_COUNT.motor).toBe(9);
  });

  test("prethodni i sledeći deo u grupi idu u krug", () => {
    const motor = partsOfSystem("motor");
    expect(neighbors(motor[0])).toEqual({ prev: motor[motor.length - 1], next: motor[1], index: 1, total: motor.length });
    expect(neighbors("turbopunjac")).toMatchObject({ prev: "izduvna_grana", next: "starter_generator", index: 6 });
    expect(neighbors(motor[motor.length - 1]).next).toBe(motor[0]);
  });

  test("A10: kiosk 1920 × 1080: ceo poster, kadar između trake grupa i desne kolone, iznad titla", () => {
    const k = studioLayout(1920, 1080, "kiosk", 1920);
    expect(k.posterBox).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(k.freeArea).toEqual({ x: 320, y: 120, w: 1224, h: 720 });
    // Centar zone je blizu centra ekrana (auto ne beži u stranu u turi).
    expect(Math.abs(k.freeArea.x + k.freeArea.w / 2 - 960)).toBeLessThan(60);
  });

  test("A10: kiosk na telefonu ima uske margine, a zona ostaje upotrebljiva", () => {
    const k = studioLayout(390, 844, "kiosk", 390);
    expect(k.posterBox).toEqual({ x: 0, y: 0, w: 390, h: 844 });
    expect(k.freeArea).toEqual({ x: 16, y: 88, w: 358, h: 596 });
  });
});
