import { describe, expect, test } from "vitest";
import { fairModelKeySpecs, fairModelSpecGroups, splitSpecValue } from "./model-key-specs";

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
    ["Prednji", "Prednji", ""],
    ["3720 x 1640 x 1535 mm", "3720 x 1640 x 1535 mm", ""],
  ])("%s", (raw, value, unit) => {
    expect(splitSpecValue(raw)).toEqual({ value, unit });
  });
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
