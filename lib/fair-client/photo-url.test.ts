import { describe, expect, it } from "vitest";
import { fairLocalPhotoUrl, fairPhotoUnoptimized } from "./photo-url";

describe("fair photo URL", () => {
  it("serves scanme.rs fair photos from the local public path", () => {
    expect(fairLocalPhotoUrl("https://scanme.rs/fair/elektromobilnost-2026/jmev-ev3.webp")).toBe(
      "/fair/elektromobilnost-2026/jmev-ev3.webp",
    );
    expect(fairLocalPhotoUrl("https://www.scanme.rs/fair/a/b.webp")).toBe("/fair/a/b.webp");
  });

  it("also strips the current site origin", () => {
    expect(fairLocalPhotoUrl("http://localhost:3000/fair/a/b.webp", "http://localhost:3000")).toBe("/fair/a/b.webp");
    expect(fairLocalPhotoUrl("http://localhost:3000/fair/a/b.webp")).toBe("http://localhost:3000/fair/a/b.webp");
  });

  it("leaves every other URL unchanged", () => {
    for (const url of [
      "/fair/a/b.webp",
      "https://scanme.rs/other/b.webp",
      "https://evil.example/fair/b.webp",
      "https://perfect-ant-98.eu-west-1.convex.cloud/api/storage/abc",
      "https://scanme.rs.evil.example/fair/b.webp",
    ]) {
      expect(fairLocalPhotoUrl(url)).toBe(url);
    }
    expect(fairLocalPhotoUrl(undefined)).toBeUndefined();
  });
});

describe("fairPhotoUnoptimized (D1, RN N1)", () => {
  it("skips /_next/image for every absolute URL left after fairLocalPhotoUrl", () => {
    for (const url of [
      "https://www.izlagac.example/slike/model.webp",
      "https://evil.example/fair/b.webp",
      "https://scanme.rs/other/b.webp",
      "https://perfect-ant-98.eu-west-1.convex.cloud/api/storage/abc",
      "http://izlagac.example/a.jpg",
      "HTTPS://IZLAGAC.EXAMPLE/A.JPG",
      "//cdn.izlagac.example/a.jpg",
    ]) {
      expect(fairPhotoUnoptimized(fairLocalPhotoUrl(url))).toBe(true);
    }
  });

  it("keeps next/image optimization for the local /fair/ photos", () => {
    for (const url of [
      "https://scanme.rs/fair/elektromobilnost-2026/jmev-ev3-event.jpg",
      "https://www.scanme.rs/fair/a/b.webp",
      "/fair/elektromobilnost-2026/mazda-cx-5-homura.webp",
    ]) {
      expect(fairPhotoUnoptimized(fairLocalPhotoUrl(url))).toBe(false);
    }
    expect(fairPhotoUnoptimized(fairLocalPhotoUrl("http://localhost:3150/fair/a/b.webp", "http://localhost:3150"))).toBe(false);
  });
});
