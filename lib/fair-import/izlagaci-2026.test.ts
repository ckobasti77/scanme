import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { normalizeWebsiteUrl } from "@/lib/admin-v1/website";
import { FAIR_EXTERNAL_KEY_PATTERN } from "@/lib/fair-contract";
import { ELEKTROMOBILNOST_2026_EXHIBITORS, FAIR_SITE_LOGO_BASE, fairSiteExhibitorCodes, fairSiteLogoUrl } from "./izlagaci-2026";

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
