// ScanMe Menu V1 (K29, P8) — the consent point of the analytics identifier:
// only `on` and `consent` turn the session id on, everything else is off; in
// `consent` mode the guest's own answer decides (docs/menu/ANALITIKA-DEFINICIJE.md §3).

import { describe, expect, test } from "vitest";
import {
  ANALITIKA_REZIMI,
  SAGLASNOST_KLJUC,
  analitikaRezim,
  smeIdentifikator,
  type AnalitikaRezim,
} from "./saglasnost";

describe("analitikaRezim", () => {
  test.each([undefined, null, "", "   ", "off", "OFF", "yes", "true", "1", "0", "enabled", "on,consent"] as const)(
    "[saglasnost] %j means iskljuceno (the safe default)",
    (raw) => {
      expect(analitikaRezim(raw)).toBe("iskljuceno");
    },
  );

  test.each(["on", "ON", "On", "ON ", " on", "\ton\n"])("[saglasnost] %j turns the identifier on", (raw) => {
    expect(analitikaRezim(raw)).toBe("ukljuceno");
  });

  test.each(["consent", "CONSENT", "Consent", " consent ", "consent\n"])(
    "[saglasnost] %j asks the guest first",
    (raw) => {
      expect(analitikaRezim(raw)).toBe("saglasnost");
    },
  );

  test("[saglasnost] only the exact values on and consent turn it on; the internal mode names do not", () => {
    for (const raw of ["ukljuceno", "saglasnost", "iskljuceno", "onn", "o n", "consents", "con sent"]) {
      expect(analitikaRezim(raw), raw).toBe("iskljuceno");
    }
  });

  test("[saglasnost] the default is the first mode and every result is a known mode", () => {
    expect(ANALITIKA_REZIMI[0]).toBe("iskljuceno");
    expect(ANALITIKA_REZIMI).toEqual(["iskljuceno", "ukljuceno", "saglasnost"]);
    for (const raw of [undefined, null, "", "on", "consent", "xyz"]) {
      expect(ANALITIKA_REZIMI).toContain(analitikaRezim(raw));
    }
  });
});

describe("smeIdentifikator", () => {
  const izbori: (string | null)[] = [null, "da", "ne", "", "DA", "Da", "yes", "true"];

  test("[saglasnost] iskljuceno never allows the identifier, whatever the guest's stored answer", () => {
    for (const izbor of izbori) {
      expect(smeIdentifikator("iskljuceno", izbor), String(izbor)).toBe(false);
    }
  });

  test("[saglasnost] ukljuceno always allows it", () => {
    for (const izbor of izbori) {
      expect(smeIdentifikator("ukljuceno", izbor), String(izbor)).toBe(true);
    }
  });

  test("[saglasnost] saglasnost allows it only after the guest answered exactly da", () => {
    expect(smeIdentifikator("saglasnost", "da")).toBe(true);
    for (const izbor of izbori.filter((vrednost) => vrednost !== "da")) {
      expect(smeIdentifikator("saglasnost", izbor), String(izbor)).toBe(false);
    }
  });

  test("[saglasnost] the full matrix of modes and answers", () => {
    const ocekivano: Record<AnalitikaRezim, { null: boolean; da: boolean; ne: boolean }> = {
      iskljuceno: { null: false, da: false, ne: false },
      ukljuceno: { null: true, da: true, ne: true },
      saglasnost: { null: false, da: true, ne: false },
    };
    for (const rezim of ANALITIKA_REZIMI) {
      expect(smeIdentifikator(rezim, null), `${rezim} / null`).toBe(ocekivano[rezim].null);
      expect(smeIdentifikator(rezim, "da"), `${rezim} / da`).toBe(ocekivano[rezim].da);
      expect(smeIdentifikator(rezim, "ne"), `${rezim} / ne`).toBe(ocekivano[rezim].ne);
    }
  });

  test("[saglasnost] the guest's answer is kept under smm_an_saglasnost", () => {
    expect(SAGLASNOST_KLJUC).toBe("smm_an_saglasnost");
  });
});
