import { describe, expect, test } from "vitest";
import {
  FAIR_QR_LABEL_DEFAULT_FORMAT,
  fairQrLabelFormatFromLabels,
  formatFairQrLabel,
  normalizeFairQrLabel,
  parseFairQrSerialLabel,
} from "./fair-qr-label";
import { fairAdminLinkPath, fairModelPath } from "./fair-contract";

// Sajam 2026 N1 — the sticker label normalizer the field team relies on in
// Niš: every reasonable way to type sticker 7 gives SA26-007, nothing else
// does. TS26 is a TEST series (the printed one is SA26).

describe("normalizeFairQrLabel", () => {
  test("every reasonable way to type sticker 7 gives SA26-007", () => {
    const inputs = [
      "7", "07", "007", " 7 ", "\t007\n",
      "sa26-7", "SA26-7", "SA26-007", "sa26-007", "Sa26-07",
      "SA26 7", "SA26  007", "SA26 - 7", "SA26007", "SA267", "SA26_007", "sa26_7",
      "SA26–007", "SA26—007", "SA26−007", "SA26‑007", "SA26 – 7",
      "O7", "OO7", "SA26-OO7", "sa26-o07", "SA26O07",
      "ＳＡ２６-007",
    ];
    for (const input of inputs) expect({ input, label: normalizeFairQrLabel(input) }).toEqual({ input, label: "SA26-007" });
  });

  test("P2 (RN): the Cyrillic СА26, a split prefix, a number sign and a slash give SA26-007 too", () => {
    const inputs = [
      "СА26-7", "СА26-007", "са26 7", "са26-007", "СА26 7", "СА26007", "Са26-7", "СA26-7", "SА26-7", "СА26-О07", "О7",
      "SA-26-7", "SA 26 7", "SA-26 007", "sa 26-7", "СА-26-7", "SA - 26 - 7", "SA-26007",
      "#7", "# 7", "#007", "SA26/7", "SA26/007", "sa26 / 7", "SA26#7", "SA26 #7", "SA26.7", "SA-26/7", "СА26/7",
    ];
    for (const input of inputs) expect({ input, label: normalizeFairQrLabel(input) }).toEqual({ input, label: "SA26-007" });
  });

  test("P2: the new forms refuse what the old ones refuse", () => {
    const inputs = [
      "СА27-7", "СБ26-7", "SA-27-7", "SA 26", "SA-26", "SA-26-", "#", "# ", "##7", "#-7", "7#", "SA26/", "SA26/7/1", "SA26//7/", "/7", ".7", "7/", "7.",
      "SA26#0", "#0", "#101", "СА26-101", "SA 26 7 1", "SA-26-7-1", "SA2 6 7", "S A26 7", "ТС26-7",
    ];
    for (const input of inputs) expect({ input, label: normalizeFairQrLabel(input) }).toEqual({ input, label: null });
  });

  test("RUNBOOK-EVENT-SETUP: the stickers of the 15 real cars, SA26-001 … SA26-015, in every typed form", () => {
    for (let n = 1; n <= 15; n += 1) {
      const label = `SA26-${String(n).padStart(3, "0")}`;
      const forms = [label, String(n), String(n).padStart(3, "0"), `sa26 ${n}`, `SA26${String(n).padStart(3, "0")}`, `СА26-${n}`, `SA-26-${n}`, `SA 26 ${n}`, `#${n}`, `SA26/${n}`];
      for (const input of forms) expect({ input, label: normalizeFairQrLabel(input) }).toEqual({ input, label });
    }
    expect(normalizeFairQrLabel("SA26-015")).toBe("SA26-015");
    expect(normalizeFairQrLabel("16")).toBe("SA26-016");
  });

  test("the first and the last sticker of the series", () => {
    expect(normalizeFairQrLabel("1")).toBe("SA26-001");
    expect(normalizeFairQrLabel("sa26-1")).toBe("SA26-001");
    expect(normalizeFairQrLabel("100")).toBe("SA26-100");
    expect(normalizeFairQrLabel("SA26100")).toBe("SA26-100");
    expect(normalizeFairQrLabel("SA26 - 100")).toBe("SA26-100");
    expect(normalizeFairQrLabel("42")).toBe("SA26-042");
  });

  test("0, a number above the series, another prefix and anything else give null", () => {
    const inputs = [
      "", "   ", "0", "00", "000", "SA26-000", "SA26-0", "101", "SA26-101", "999", "1000", "SA26-1000",
      "SA27-007", "SA27007", "SB26-7", "TS26-007", "PANEL-2026-EVENT", "SMQ-ABCD-EFGH", "7KQ2M9XA",
      "SA26", "SA26-", "-001", "- 7", "7-", "7a", "a7", "7.5", "+7", "SA26-7-1", "SA26 7 1", "sedam", "SA26-SEDAM",
      "0000007", "x".repeat(41),
    ];
    for (const input of inputs) expect({ input, label: normalizeFairQrLabel(input) }).toEqual({ input, label: null });
    expect(normalizeFairQrLabel(null)).toBeNull();
    expect(normalizeFairQrLabel(undefined)).toBeNull();
  });

  test("another series uses its own prefix, width and highest number", () => {
    const format = { prefix: "TS26", digits: 4, max: 250 };
    expect(normalizeFairQrLabel("7", format)).toBe("TS26-0007");
    expect(normalizeFairQrLabel("ts26 250", format)).toBe("TS26-0250");
    expect(normalizeFairQrLabel("251", format)).toBeNull();
    expect(normalizeFairQrLabel("SA26-007", format)).toBeNull();
    // P2: the split, Cyrillic and slash forms follow the series' own prefix.
    expect(normalizeFairQrLabel("TS-26/7", format)).toBe("TS26-0007");
    expect(normalizeFairQrLabel("ТС26 7", format)).toBe("TS26-0007");
  });
});

describe("the series of an inventory", () => {
  test("the default is the printed SA26 series: three digits, up to 100", () => {
    expect(FAIR_QR_LABEL_DEFAULT_FORMAT).toEqual({ prefix: "SA26", digits: 3, max: 100 });
    expect(formatFairQrLabel(7)).toBe("SA26-007");
    expect(formatFairQrLabel(100)).toBe("SA26-100");
  });

  test("derived from the labels: the series with the highest number; panels and resolver codes are no series", () => {
    expect(fairQrLabelFormatFromLabels(["PANEL-2026-EVENT", "SA26-001", "SA26-100", "SA26-042", "7KQ2M9XA", "PANEL-2026-SCANME"])).toEqual({ prefix: "SA26", digits: 3, max: 100 });
    expect(fairQrLabelFormatFromLabels(["TS26-0003", "TS26-0012", "XY-1"])).toEqual({ prefix: "TS26", digits: 4, max: 12 });
    expect(fairQrLabelFormatFromLabels(["PANEL-2026-EVENT", "7KQ2M9XA"])).toBeNull();
    expect(fairQrLabelFormatFromLabels([])).toBeNull();
  });

  test("a serial label parses into its parts", () => {
    expect(parseFairQrSerialLabel("SA26-007")).toEqual({ prefix: "SA26", number: 7, digits: 3 });
    expect(parseFairQrSerialLabel(" sa26-100 ")).toEqual({ prefix: "SA26", number: 100, digits: 3 });
    for (const label of ["PANEL-2026-EVENT", "7KQ2M9XA", "SA26", "-007", "26-007"]) expect(parseFairQrSerialLabel(label)).toBeNull();
  });
});

describe("resolver paths", () => {
  test("the admin shortcut of an unlinked sticker opens „Poveži nalepnicu“ of the event with the scanned code", () => {
    expect(fairAdminLinkPath("elektromobilnost-2026", "7KQ2M9XA")).toBe("/admin/dogadjaji/elektromobilnost-2026/povezi?kod=7KQ2M9XA");
    expect(fairModelPath("elektromobilnost-2026", "volta-x1")).toBe("/sajam/elektromobilnost-2026/model/volta-x1");
  });
});
