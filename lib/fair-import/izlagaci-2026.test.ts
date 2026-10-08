import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { normalizeWebsiteUrl } from "@/lib/admin-v1/website";
import { FAIR_EXHIBITOR_CATEGORIES, FAIR_EXTERNAL_KEY_PATTERN } from "@/lib/fair-contract";
import { fairMapLocationById, isFairMapStandLocation } from "@/lib/fair-map";
import { ELEKTROMOBILNOST_2026_MAP } from "@/lib/fair-map/elektromobilnost-2026";
import {
  ELEKTROMOBILNOST_2026_EXHIBITORS,
  FAIR_SITE_LOGO_BASE,
  fairSiteExhibitorCodes,
  fairSiteExhibitorMapZone,
  fairSiteLogoUrl,
  fairSiteStandFields,
} from "./izlagaci-2026";

// Izlagači 2026 — the organizer's exhibitor list (sajamautomobila.com,
// učesnici 2026) as the import writes it: stable keys and codes, a logo file
// for everyone and websites the client profile accepts.

const list = ELEKTROMOBILNOST_2026_EXHIBITORS;

describe("Sajam elektromobilnosti 2026 — exhibitor list", () => {
  test("38 exhibitors (hall, entrance, rear), each once", () => {
    expect(list).toHaveLength(38);
    expect(new Set(list.map((row) => row.key)).size).toBe(list.length);
    expect(new Set(list.map((row) => row.name.toLowerCase())).size).toBe(list.length);
    expect(list.filter((row) => row.zone === "hala")).toHaveLength(23);
    expect(list.filter((row) => row.zone === "ulaz")).toHaveLength(14);
    expect(list.filter((row) => row.zone === "zadnji-deo").map((row) => row.key)).toEqual(["auto1"]);
  });

  test("keys and codes pass the catalog and client rules", () => {
    for (const row of list) {
      const codes = fairSiteExhibitorCodes(row.key);
      expect(row.key).toMatch(FAIR_EXTERNAL_KEY_PATTERN);
      expect(codes.smkCode).toMatch(/^SMK-[A-Z0-9]+(?:-[A-Z0-9]+)*$/);
      expect(codes.smlCode).toMatch(/^SML-[A-Z0-9]+(?:-[A-Z0-9]+)*$/);
      expect(codes.participationKey).toMatch(FAIR_EXTERNAL_KEY_PATTERN);
      expect(codes.slug.length).toBeLessThanOrEqual(80);
    }
    expect(fairSiteExhibitorCodes("ferum-baw")).toEqual({ smkCode: "SMK-IZL26-FERUM-BAW", smlCode: "SML-IZL26-FERUM-BAW", participationKey: "izl26-ferum-baw", slug: "izlagac-2026-ferum-baw" });
  });

  test("every logo is a file under public/ and every website is a public http(s) address", () => {
    for (const row of list) {
      const url = fairSiteLogoUrl(row);
      expect(url.startsWith(`${FAIR_SITE_LOGO_BASE}/`)).toBe(true);
      const file = join(process.cwd(), "public", url);
      expect(existsSync(file), url).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(500);
      if (row.websiteUrl) expect(normalizeWebsiteUrl(row.websiteUrl), row.key).not.toBeNull();
    }
    // The organizer gives no link for Makete; nothing is invented.
    expect(list.find((row) => row.key === "makete")?.websiteUrl).toBeUndefined();
  });
});

describe("Sajam elektromobilnosti 2026 — exhibitors on the organizer maps of 7. 10. (N3, NOC-KONTEKST §3)", () => {
  const byLocation = (id: string) => list.filter((row) => row.locations.includes(id)).map((row) => row.key);

  test("every location exists on the event map and takes stands; an exhibitor lists a location once", () => {
    for (const row of list) {
      expect(new Set(row.locations).size, row.key).toBe(row.locations.length);
      for (const id of row.locations) expect(isFairMapStandLocation("elektromobilnost-2026", id), `${row.key} → ${id}`).toBe(true);
    }
  });

  test("only Markus Pro has no location, with the reason; Venera Bike has three", () => {
    expect(list.filter((row) => row.locations.length === 0).map((row) => row.key)).toEqual(["markus-pro"]);
    const markus = list.find((row) => row.key === "markus-pro")!;
    expect(markus.noLocationReason).toMatch(/ispred hale/i);
    expect(fairSiteExhibitorMapZone(markus.zone)).toBe("ispred");
    expect(list.filter((row) => row.noLocationReason).map((row) => row.key)).toEqual(["markus-pro"]);
    expect(list.find((row) => row.key === "venera-bike")!.locations).toEqual(["hala-12", "ispred-19", "ispred-20-22"]);
  });

  test("the table of §3: who is where; different exhibitors share a location; boxes 13-3, 16 and 18 stay empty", () => {
    expect(Object.fromEntries(ELEKTROMOBILNOST_2026_MAP.zones.flatMap((zone) => zone.locations).map((location) => [location.id, byLocation(location.id).sort()]))).toEqual({
      "hala-1a": ["ferum-baw", "ferum-yudo"],
      "hala-1b": ["bentu"],
      "hala-1c": ["xtreme-motors"],
      "hala-2": ["byd", "citroen", "farizon", "geely", "motogrini", "toyota"],
      "hala-5": ["ford", "mg"],
      "hala-6": ["chery", "foton", "mazda"],
      "hala-9": ["jmev"],
      "hala-10a": ["dualtron"],
      "hala-10b": ["changan", "jac"],
      "hala-11": ["skoda"],
      "hala-12": ["venera-bike"],
      "hala-partner-10b": ["hotel-lotos"],
      "hala-partner-10a": ["restoran-vidovdan"],
      "ispred-12-1": ["aster-marketing"],
      "ispred-12-2": ["zepter"],
      "ispred-13-1": ["makete"],
      "ispred-13-2": ["turisticka-organizacija-nis"],
      "ispred-13-3": [],
      "ispred-13-4": ["detailing-store"],
      "ispred-14": ["enigma-it", "scanme"],
      "ispred-15-1": ["ets-mija-stanimirovic"],
      "ispred-15-2": ["kostic-rent-a-car"],
      "ispred-15-3": ["jkp-direkcija-za-javni-prevoz"],
      "ispred-15-4": ["jkp-parking-servis-nis"],
      "ispred-16": [],
      "ispred-17": ["bracinac-artvark", "ev-charging-solutions"],
      "ispred-18": [],
      "ispred-19": ["venera-bike"],
      "ispred-20-22": ["venera-bike"],
      "zadnji-deo": ["auto1"],
    });
  });

  test("every exhibitor has its one category of §3", () => {
    const categories: Record<string, string[]> = {};
    for (const row of list) {
      expect(FAIR_EXHIBITOR_CATEGORIES).toContain(row.category);
      (categories[row.category] ??= []).push(row.key);
    }
    for (const keys of Object.values(categories)) keys.sort();
    expect(categories).toEqual({
      automobili: ["bentu", "byd", "changan", "chery", "citroen", "farizon", "ferum-baw", "ferum-yudo", "ford", "geely", "jac", "jmev", "mazda", "mg", "skoda", "toyota", "foton"].sort(),
      moto: ["dualtron", "motogrini", "venera-bike", "xtreme-motors"],
      energija: ["bracinac-artvark", "ev-charging-solutions"],
      usluge: ["auto1", "detailing-store", "ets-mija-stanimirovic", "jkp-direkcija-za-javni-prevoz", "jkp-parking-servis-nis", "kostic-rent-a-car", "markus-pro", "turisticka-organizacija-nis"],
      hrana: ["hotel-lotos", "restoran-vidovdan"],
      ostalo: ["aster-marketing", "makete", "zepter"],
      scanme: ["enigma-it", "scanme"],
    });
  });

  test("the stand of a pair: stable key, the organizer's label as code, a readable name", () => {
    const location = (id: string) => fairMapLocationById("elektromobilnost-2026", id)!.location;
    expect(fairSiteStandFields("byd", location("hala-2"))).toEqual({ externalKey: "izl26-byd-hala-2", code: "2", displayName: "Štand 2" });
    expect(fairSiteStandFields("turisticka-organizacija-nis", location("ispred-13-2"))).toEqual({ externalKey: "izl26-turisticka-organizacija-nis-ispred-13-2", code: "13", displayName: "Štand 13" });
    expect(fairSiteStandFields("scanme", location("ispred-14"))).toEqual({ externalKey: "izl26-scanme-ispred-14", code: "14", displayName: "Štand 14" });
    expect(fairSiteStandFields("venera-bike", location("ispred-20-22"))).toEqual({ externalKey: "izl26-venera-bike-ispred-20-22", code: "20–22", displayName: "Štand 20–22" });
    expect(fairSiteStandFields("hotel-lotos", location("hala-partner-10b"))).toEqual({ externalKey: "izl26-hotel-lotos-hala-partner-10b", code: "uz 10B", displayName: "Uz 10B" });
    expect(fairSiteStandFields("auto1", location("zadnji-deo"))).toEqual({ externalKey: "izl26-auto1-zadnji-deo", code: "Zadnji deo", displayName: "Zadnji deo" });
    for (const row of list) {
      for (const id of row.locations) {
        const fields = fairSiteStandFields(row.key, location(id));
        expect(fields.externalKey).toMatch(FAIR_EXTERNAL_KEY_PATTERN);
        expect(fields.code.length).toBeLessThanOrEqual(40);
      }
    }
  });
});
