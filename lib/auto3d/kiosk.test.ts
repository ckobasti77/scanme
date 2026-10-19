import { describe, expect, test } from "vitest";
import {
  KIOSK_CURSOR_MS,
  KIOSK_IDLE_MS,
  KIOSK_TICK_MS,
  kioskInput,
  kioskLoopSeconds,
  kioskMove,
  kioskPhases,
  kioskRotates,
  kioskStart,
  kioskTick,
  phaseAt,
  shouldReset,
  type KioskClock,
  type KioskCommand,
} from "./kiosk";
import { TOUR_SECONDS, TOUR_STEPS } from "./tour";

/** Pušta sat od `from` do `to` (ms) otkucajima od 250 ms; `inputs` su trenuci dodira. */
function run(clock: KioskClock, from: number, to: number, opts: { reduced?: boolean; inputs?: number[] } = {}) {
  const log: Array<{ at: number; cmd: KioskCommand }> = [];
  const inputs = [...(opts.inputs ?? [])].sort((a, b) => a - b);
  let c = clock;
  for (let now = from; now <= to; now += KIOSK_TICK_MS) {
    while (inputs.length && inputs[0] <= now) {
      const at = inputs.shift() as number;
      const r = kioskInput(c, at);
      c = r.clock;
      for (const cmd of r.commands) log.push({ at, cmd });
    }
    const r = kioskTick(c, now, opts.reduced ?? false);
    c = r.clock;
    for (const cmd of r.commands) log.push({ at: now, cmd });
  }
  return { clock: c, log };
}

const types = <T extends { cmd: KioskCommand }>(log: T[], type: KioskCommand["type"]) => log.filter((e) => e.cmd.type === type);

describe("kiosk: raspored petlje", () => {
  test("tura, orbita, rasklapanje, držanje, sklapanje; ukupno oko 96 s", () => {
    expect(kioskPhases(false).map((p) => p.id)).toEqual(["tura", "orbita", "rasklapanje", "drzanje", "sklapanje"]);
    expect(kioskPhases(false)[0].seconds).toBe(TOUR_SECONDS);
    expect(kioskLoopSeconds(false)).toBeGreaterThanOrEqual(90);
    expect(kioskLoopSeconds(false)).toBeLessThanOrEqual(100);
  });

  test("reduced motion: bez orbite i bez okretanja", () => {
    expect(kioskPhases(true).map((p) => p.id)).not.toContain("orbita");
    expect(kioskLoopSeconds(true)).toBe(kioskLoopSeconds(false) - 20);
    expect(kioskRotates("orbita", true)).toBe(false);
    expect(kioskRotates("orbita", false)).toBe(true);
    expect(kioskRotates("rasklapanje", false)).toBe(true);
    expect(kioskRotates("tura", false)).toBe(false);
    expect(kioskRotates(null, false)).toBe(false);
  });

  test("phaseAt na granicama i u krug", () => {
    const total = kioskLoopSeconds(false);
    expect(phaseAt(0, false)).toMatchObject({ index: 0, id: "tura", local: 0 });
    expect(phaseAt(TOUR_SECONDS - 0.01, false).id).toBe("tura");
    expect(phaseAt(TOUR_SECONDS, false)).toMatchObject({ id: "orbita", local: 0 });
    expect(phaseAt(TOUR_SECONDS + 20, false).id).toBe("rasklapanje");
    expect(phaseAt(total - 0.01, false).id).toBe("sklapanje");
    expect(phaseAt(total, false)).toMatchObject({ index: 0, id: "tura", local: 0 });
    expect(phaseAt(total * 7 + 61, false)).toEqual(phaseAt(61, false));
    expect(phaseAt(TOUR_SECONDS, true).id).toBe("rasklapanje");
  });
});

describe("kiosk: tajmeri", () => {
  test("povratak posle 45 s bez dodira: 44,9 s ne, 45,0 s da", () => {
    expect(KIOSK_IDLE_MS).toBe(45_000);
    expect(shouldReset(44_900, 0)).toBe(false);
    expect(shouldReset(45_000, 0)).toBe(true);
  });

  test("petlja javlja faze i korake ture redom, pa ispočetka", () => {
    const total = kioskLoopSeconds(false) * 1000;
    const { log } = run(kioskStart(0), 0, total + 1000);
    const phases = types(log, "phase").map((e) => (e.cmd as { id: string }).id);
    expect(phases).toEqual(["tura", "orbita", "rasklapanje", "drzanje", "sklapanje", "tura"]);
    const steps = types(log, "tourStep").map((e) => (e.cmd as { step: number }).step);
    expect(steps).toEqual([...TOUR_STEPS.map((_, i) => i), 0]);
    expect(types(log, "reset")).toHaveLength(0);
  });

  test("dodir gasi petlju; posle 45 s mirovanja reset i tura od koraka 0", () => {
    const { log, clock } = run(kioskStart(0), 0, 70_000, { inputs: [10_000] });
    expect(types(log, "touch")).toEqual([{ at: 10_000, cmd: { type: "touch" } }]);
    // Između dodira i reseta nema faza ni koraka.
    const between = log.filter((e) => e.at > 10_000 && e.at < 55_000 && e.cmd.type !== "cursor");
    expect(between).toEqual([]);
    const reset = types(log, "reset");
    expect(reset).toEqual([{ at: 55_000, cmd: { type: "reset" } }]);
    const after = log.filter((e) => e.at === 55_000).map((e) => e.cmd);
    expect(after).toEqual([{ type: "reset" }, { type: "phase", id: "tura" }, { type: "tourStep", step: 0 }]);
    expect(clock.auto).toBe(true);
  });

  test("svaki dodir pomera rok od 45 s", () => {
    const { log } = run(kioskStart(0), 0, 100_000, { inputs: [10_000, 40_000] });
    expect(types(log, "touch")).toHaveLength(1);
    expect(types(log, "reset").map((e) => e.at)).toEqual([85_000]);
  });

  test("pomeranje miša budi kursor, ali ne zaustavlja petlju; u istraživanju produžava rok", () => {
    let c = kioskStart(0);
    let r = kioskTick(c, KIOSK_CURSOR_MS - 1, false);
    expect(r.commands.some((x) => x.type === "cursor")).toBe(false);
    r = kioskTick(r.clock, KIOSK_CURSOR_MS, false);
    expect(r.commands).toContainEqual({ type: "cursor", hidden: true });
    r = kioskMove(r.clock, 5_000);
    expect(r.commands).toEqual([{ type: "cursor", hidden: false }]);
    expect(r.clock.auto).toBe(true);
    c = kioskInput(r.clock, 6_000).clock;
    c = kioskMove(c, 40_000).clock;
    expect(kioskTick(c, 6_000 + KIOSK_IDLE_MS, false).commands).not.toContainEqual({ type: "reset" });
    expect(kioskTick(c, 40_000 + KIOSK_IDLE_MS, false).commands).toContainEqual({ type: "reset" });
  });

  test("sat vremena rada: stalna veličina sata, broj krugova i reseta je tačan", () => {
    const hour = 3_600_000;
    // Posetioci dodiruju ekran na svakih 7 minuta; posle svakog dodira je 45 s mirovanja.
    const inputs = Array.from({ length: 8 }, (_, i) => (i + 1) * 420_000);
    const { clock, log } = run(kioskStart(0), 0, hour, { inputs });
    expect(Object.keys(clock).sort()).toEqual(Object.keys(kioskStart(0)).sort());
    expect(types(log, "touch")).toHaveLength(8);
    expect(types(log, "reset")).toHaveLength(8);
    for (const e of types(log, "reset")) expect(inputs).toContain(e.at - KIOSK_IDLE_MS);
    // Svaki krug počinje turom; ukupno krugova je oko sat / 96 s, bez dodirnutih delova.
    const loops = types(log, "phase").filter((e) => (e.cmd as { id: string }).id === "tura").length;
    expect(loops).toBeGreaterThan(30);
    expect(loops).toBeLessThan(45);
  });

  test("reduced motion: petlja bez orbite", () => {
    const { log } = run(kioskStart(0), 0, kioskLoopSeconds(true) * 1000);
    expect(types(log, "phase").map((e) => (e.cmd as { id: string }).id)).toContain("orbita");
    const reduced = run(kioskStart(0), 0, kioskLoopSeconds(true) * 1000, { reduced: true }).log;
    expect(types(reduced, "phase").map((e) => (e.cmd as { id: string }).id)).toEqual(["tura", "rasklapanje", "drzanje", "sklapanje", "tura"]);
  });

  test("kiosk sa traženim delom počinje bez petlje i vraća se na nju posle 45 s", () => {
    const { log } = run(kioskStart(0, false), 0, 50_000);
    expect(types(log, "phase").map((e) => e.at)).toEqual([45_000]);
    expect(types(log, "reset").map((e) => e.at)).toEqual([45_000]);
  });
});
