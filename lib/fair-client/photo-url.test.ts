import { describe, expect, it } from "vitest";
import { fairLocalPhotoUrl } from "./photo-url";

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
