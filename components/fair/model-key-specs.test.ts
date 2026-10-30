import { describe, expect, test } from "vitest";
import { fairModelHasTractionBattery, fairModelKeySpecs, fairModelSpecGroups, splitSpecValue } from "./model-key-specs";
import amf from "../../docs/events/auto-moto-fest-2026/intake/prod-2026-10-30/b1-payload.json";

const spec = (id: string, label: string, value: string, isHighlight = false) => ({ id, label, value, isHighlight });

// JMEV EV3 as imported for elektromobilnost-2026 (no flagged highlight).
const ev3 = [
  spec("1", "Snaga", "50 kW"),
  spec("2", "Obrtni moment", "125 Nm"),
  spec("3", "Domet (CLTC)", "330 km"),
  spec("4", "Kapacitet baterije", "30,24 kWh"),
  spec("5", "Maksimalna brzina", "110 km/h"),
  spec("6", "Ubrzanje 0-50 km/h", "4,5 s"),
  spec("7", "DC punjenje", "30 kW"),
  spec("8", "Dimenzije", "3720 x 1640 x 1535 mm"),
];

describe("fairModelKeySpecs", () => {
  test("without flagged specs: range, battery, power, DC charging", () => {
    expect(fairModelKeySpecs(ev3).map((item) => [item.kind, item.value, item.unit, item.qualifier])).toEqual([
      ["range", "330", "km", "CLTC"],
      ["battery", "30,24", "kWh", ""],
      ["power", "50", "kW", ""],
      ["charging", "30", "kW", ""],
    ]);
  });

  test("flagged highlights win, in server order, at most four", () => {
    const flagged = ev3.map((item) => ({ ...item, isHighlight: ["5", "6", "1", "2", "3"].includes(item.id) }));
    expect(fairModelKeySpecs(flagged).map((item) => item.id)).toEqual(["1", "2", "3", "5"]);
  });

  test("DC charging beats AC; missing kinds fall through to speed and acceleration", () => {
    const mazda = [
      spec("a", "AC punjenje", "11 kW"),
      spec("b", "DC punjenje", "Do 195 kW"),
      spec("c", "Maksimalna brzina", "187 km/h"),
      spec("d", "Ubrzanje 0-100 km/h", "10,5 s"),
    ];
    expect(fairModelKeySpecs(mazda).map((item) => [item.id, item.value])).toEqual([
      ["b", "195"],
      ["c", "187"],
      ["d", "10,5"],
      ["a", "11"],
    ]);
  });

  test("a model with fewer specs shows what it has; none → empty", () => {
    expect(fairModelKeySpecs([spec("x", "Pogon", "Prednji")])).toEqual([
      { id: "x", kind: "other", value: "Prednji", unit: "", qualifier: "", label: "Pogon" },
    ]);
    expect(fairModelKeySpecs([])).toEqual([]);
  });
});

describe("splitSpecValue", () => {
  test.each([
    ["330 km", "330", "km"],
    ["30,24 kWh", "30,24", "kWh"],
    ["141 KS (104 kW)", "141", "KS"],
    ["70 kW / oko 1 h 12 min", "70", "kW"],
    ["Do 170 km", "170", "km"],
    ["< 7,9 s", "<7,9", "s"],
    ["6-6.5 h", "6-6.5", "h"],
    ["6,3 l/100 km", "6,3", "l/100 km"],
    ["400 Nm (1.750–3.250 o/min)", "400", "Nm"],
    ["142 kW / 193 KS", "142", "kW"],
    ["Prednji", "Prednji", ""],
    ["3720 x 1640 x 1535 mm", "3720 x 1640 x 1535 mm", ""],
  ])("%s", (raw, value, unit) => {
    expect(splitSpecValue(raw)).toEqual({ value, unit });
  });
});

test("legacy kW (KS) never presents kW as horsepower; a fuel tank is never a battery", () => {
  expect(fairModelKeySpecs([spec("mg", "Snaga kW (KS)", "145 (197)")])[0]).toMatchObject({ value: "145", unit: "kW", qualifier: "" });
  expect(fairModelKeySpecs([spec("panda", "Kapacitet rezervoara", "44 l")])[0]).toMatchObject({ kind: "tank", value: "44", unit: "l" });
});

test("all 18 normalized AMF models have compact, parsed tiles and the correct powertrain title", () => {
  const models = amf.participations.flatMap(p => p.brands.flatMap(b => b.models));
  expect(models).toHaveLength(18);
  for (const model of models) {
    const items = model.specifications.map((s, index) => spec(String(index), s.label, s.value));
    const keys = fairModelKeySpecs(items, true);
    expect(keys.length, model.slug).toBeGreaterThan(0);
    expect(keys.length).toBeLessThanOrEqual(4);
    expect(keys.every(s => s.value.length <= 10 && (s.unit !== "" || s.value.length <= 8)), model.slug).toBe(true);
    expect(fairModelHasTractionBattery(items), model.slug).toBe(/^(dongfeng-|mg-)/.test(model.slug));
    if (model.slug === "fiat-grande-panda") expect(keys).toContainEqual(expect.objectContaining({ kind: "tank", value: "44", unit: "l" }));
    if (model.slug.startsWith("mg-")) expect(keys).toContainEqual(expect.objectContaining({ kind: "power", unit: "kW" }));
  }
});

describe("fairModelSpecGroups", () => {
  const labels = { drivetrain: "Pogon i baterija", performance: "Performanse i mere" };

  test("one imported group is split, order kept", () => {
    const groups = fairModelSpecGroups([{ id: "g", label: "Specifikacije", items: ev3 }], labels);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Pogon i baterija", ["1", "2", "3", "4", "7"]],
      ["Performanse i mere", ["5", "6", "8"]],
    ]);
  });

  test("server groups are never regrouped", () => {
    const server = [
      { id: "a", label: "Motor", items: ev3.slice(0, 2) },
      { id: "b", label: "Ostalo", items: ev3.slice(2) },
    ];
    expect(fairModelSpecGroups(server, labels)).toEqual(server);
  });
});

describe("AMF key tiles (hotfix 30 Oct 2026)", () => {
  const models = amf.participations.flatMap((p) => p.brands.flatMap((b) => b.models));
  const tiles = (slug: string) => {
    const model = models.find((m) => m.slug === slug)!;
    return fairModelKeySpecs(model.specifications.map((s, i) => ({ id: `spec-${i}`, label: s.label, value: s.value, isHighlight: "isHighlight" in s && s.isHighlight === true })), true);
  };

  test("every model has four short tiles, never wheels, screens or suspension when engine data exists", () => {
    for (const model of models) {
      const keys = tiles(model.slug);
      expect(keys, model.slug).toHaveLength(4);
      for (const key of keys) {
        expect(key.value.length, `${model.slug} ${key.label}`).toBeLessThanOrEqual(8);
        expect(key.qualifier.length, `${model.slug} ${key.label}`).toBeLessThanOrEqual(13);
      }
      if (model.slug !== "mg-s5-ev") expect(keys.map((k) => k.kind), model.slug).not.toEqual(expect.arrayContaining(["wheels"]));
    }
  });

  test("combustion and EV tiles follow the owner's order", () => {
    expect(tiles("ford-kuga").map((k) => [k.kind, k.value, k.unit, k.qualifier])).toEqual([
      ["power", "137", "kW", ""], ["engine", "1,5", "l", "EcoBoost"], ["transmission", "8", "brzina", "automatski"], ["fuel", "Benzin", "", ""],
    ]);
    expect(tiles("ineos-grenadier").map((k) => k.kind)).toEqual(["power", "engine", "transmission", "drive"]);
    expect(tiles("skoda-kodiaq").map((k) => [k.kind, k.value])).toEqual([["power", "142"], ["engine", "2,0"], ["transmission", "DSG"], ["consumption", "6,3"]]);
    expect(tiles("dongfeng-box").map((k) => k.kind)).toEqual(["range", "battery", "power", "charging"]);
  });
});
