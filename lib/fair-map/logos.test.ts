import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ELEKTROMOBILNOST_2026_EXHIBITORS, fairSiteLogoUrl } from "../fair-import/izlagaci-2026";
import { FAIR_MAP_LOGO_THUMBS, fairMapLogo } from "./logos";

// N4 — light logos for the map: every organizer logo has a small transparent
// WebP copy of the declared pixel size (so chips never jump), and other
// addresses pass.

/** WebP pixel size from its first chunk (VP8 / VP8L / VP8X). */
function webpSize(file: string) {
  const data = readFileSync(file);
  expect(data.toString("ascii", 0, 4)).toBe("RIFF");
  expect(data.toString("ascii", 8, 12)).toBe("WEBP");
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
}

describe("map logos", () => {
  test("every exhibitor of the list has a small copy; its file exists, is small and has the declared size", () => {
    for (const exhibitor of ELEKTROMOBILNOST_2026_EXHIBITORS) {
      const logo = fairMapLogo(fairSiteLogoUrl(exhibitor));
      expect(logo?.thumb, exhibitor.key).toBe(true);
      const file = join(process.cwd(), "public", logo!.src);
      expect(statSync(file).size, logo!.src).toBeLessThan(12_000);
      const [width, height] = FAIR_MAP_LOGO_THUMBS[exhibitor.logoFile];
      expect(webpSize(file), logo!.src).toEqual({ width, height });
      // Transparent background (VP8X with the alpha flag): no white square behind the logo on the map.
      const data = readFileSync(file);
      expect(data.toString("ascii", 12, 16), logo!.src).toBe("VP8X");
      expect(data[20] & 0x10, logo!.src).toBe(0x10);
      expect(logo!.aspect).toBeCloseTo(width / height);
    }
  });

  test("an uploaded logo or an unknown file is used as it is; no logo is null", () => {
    expect(fairMapLogo("https://expert-pelican-136.eu-west-1.convex.cloud/api/storage/abc")).toEqual({ src: "https://expert-pelican-136.eu-west-1.convex.cloud/api/storage/abc", aspect: 1, thumb: false });
    expect(fairMapLogo("/fair/izlagaci/2026/nepoznat.jpg")).toMatchObject({ src: "/fair/izlagaci/2026/nepoznat.jpg", thumb: false });
    expect(fairMapLogo(undefined)).toBeNull();
    expect(fairMapLogo("/fair/izlagaci/2026/byd.jpg")).toMatchObject({ src: "/sajam/izlagaci/2026/providni/byd.webp", thumb: true });
  });
});
