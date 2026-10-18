// ScanMe Menu V1 (K15) — which file may become the image of an article
// (master §7.9). The browser check and the server check share these rules.

import { describe, expect, test } from "vitest";
import {
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_MAX_BYTES,
  checkMenuImage,
  checkStoredMenuImage,
  formatMegabytes,
  menuImageType,
} from "./image-validation";

const MB = 1024 * 1024;

const slika = (type: string, name: string, size = 1000) => ({ type, name, size });

describe("limits", () => {
  test("the ceiling is exactly 10 MB and the file input accepts three web formats", () => {
    expect(MENU_IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(MENU_IMAGE_ACCEPT).toBe("image/jpeg,image/png,image/webp");
  });
});

describe("checkMenuImage: size", () => {
  test("exactly 10 MB is accepted", () => {
    expect(checkMenuImage(slika("image/jpeg", "a.jpg", 10 * MB))).toEqual({ ok: true, type: "image/jpeg" });
  });

  test("one byte over 10 MB is too_large", () => {
    expect(checkMenuImage(slika("image/jpeg", "a.jpg", 10 * MB + 1))).toEqual({ ok: false, problem: "too_large" });
  });

  test("one byte is accepted", () => {
    expect(checkMenuImage(slika("image/png", "a.png", 1))).toEqual({ ok: true, type: "image/png" });
  });

  test("0 bytes is empty", () => {
    expect(checkMenuImage(slika("image/jpeg", "a.jpg", 0))).toEqual({ ok: false, problem: "empty" });
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("a size of %s is empty, never ok", (size) => {
    expect(checkMenuImage(slika("image/jpeg", "a.jpg", size))).toEqual({ ok: false, problem: "empty" });
  });
});

describe("checkMenuImage: type", () => {
  test.each([
    ["image/jpeg", "a.jpg", "image/jpeg"],
    ["image/png", "a.png", "image/png"],
    ["image/webp", "a.webp", "image/webp"],
  ])("%s is accepted", (type, name, expected) => {
    expect(checkMenuImage(slika(type, name))).toEqual({ ok: true, type: expected });
  });

  test("the reported type is trimmed and case-insensitive", () => {
    expect(checkMenuImage(slika("  IMAGE/PNG ", "a.bin"))).toEqual({ ok: true, type: "image/png" });
  });

  test.each([
    ["", "FOTO.JPG", "image/jpeg"],
    ["", "foto.jpeg", "image/jpeg"],
    ["", "slika.jfif", "image/jpeg"],
    ["", "slika.JFIF", "image/jpeg"],
    ["", "a.PNG", "image/png"],
    ["", "a.webp", "image/webp"],
    ["application/octet-stream", "foto.JPG", "image/jpeg"],
    ["application/octet-stream", "a.jfif", "image/jpeg"],
    ["application/octet-stream", "a.png", "image/png"],
  ])("type %j with name %j is read from the extension: %s", (type, name, expected) => {
    expect(checkMenuImage(slika(type, name))).toEqual({ ok: true, type: expected });
  });

  test("an unknown extension with no reported type is wrong_type", () => {
    expect(checkMenuImage(slika("", "a.gif"))).toEqual({ ok: false, problem: "wrong_type" });
    expect(checkMenuImage(slika("", "bezekstenzije"))).toEqual({ ok: false, problem: "wrong_type" });
    expect(checkMenuImage(slika("", ""))).toEqual({ ok: false, problem: "wrong_type" });
  });

  test("a reported non-image type wins over an image extension", () => {
    expect(menuImageType({ type: "application/pdf", name: "x.jpg" })).toBeNull();
  });

  test.each([
    ["image/heic", "IMG_1.jpg"],
    ["image/heif", "IMG_1.jpg"],
    ["image/heic-sequence", "IMG_1.heic"],
    ["image/heif-sequence", "IMG_1.heif"],
    ["", "IMG_0042.HEIC"],
    ["application/octet-stream", "IMG_0042.heif"],
    ["image/jpeg", "IMG_0042.HEIC"],
  ])("HEIC by type %j / name %j", (type, name) => {
    expect(checkMenuImage(slika(type, name))).toEqual({ ok: false, problem: "heic" });
  });

  test.each([
    ["application/pdf", "menu.pdf"],
    ["image/gif", "a.gif"],
    ["image/svg+xml", "logo.svg"],
    ["video/mp4", "a.mp4"],
    ["image/tiff", "a.tif"],
  ])("%s is wrong_type", (type, name) => {
    expect(checkMenuImage(slika(type, name))).toEqual({ ok: false, problem: "wrong_type" });
  });

  test("type is checked before size: a 20 MB pdf is wrong_type, not too_large", () => {
    expect(checkMenuImage(slika("application/pdf", "menu.pdf", 20 * MB))).toEqual({ ok: false, problem: "wrong_type" });
  });

  test("type is checked before emptiness: an empty pdf is wrong_type, an empty heic is heic", () => {
    expect(checkMenuImage(slika("application/pdf", "menu.pdf", 0))).toEqual({ ok: false, problem: "wrong_type" });
    expect(checkMenuImage(slika("image/heic", "a.heic", 0))).toEqual({ ok: false, problem: "heic" });
  });

  test("a 20 MB heic is heic, not too_large", () => {
    expect(checkMenuImage(slika("image/heic", "a.heic", 20 * MB))).toEqual({ ok: false, problem: "heic" });
  });
});

describe("checkStoredMenuImage (the server's check of a stored blob)", () => {
  test("a missing content type is wrong_type", () => {
    expect(checkStoredMenuImage({ size: 1000 })).toEqual({ ok: false, problem: "wrong_type" });
    expect(checkStoredMenuImage({ contentType: undefined, size: 1000 })).toEqual({ ok: false, problem: "wrong_type" });
    expect(checkStoredMenuImage({ contentType: null, size: 1000 })).toEqual({ ok: false, problem: "wrong_type" });
  });

  test("octet-stream cannot be rescued by a name (there is none)", () => {
    expect(checkStoredMenuImage({ contentType: "application/octet-stream", size: 1000 })).toEqual({
      ok: false,
      problem: "wrong_type",
    });
  });

  test("the same rules apply: ok, empty, too_large, heic, wrong_type", () => {
    expect(checkStoredMenuImage({ contentType: "image/webp", size: 5 * MB })).toEqual({ ok: true, type: "image/webp" });
    expect(checkStoredMenuImage({ contentType: "image/png", size: 10 * MB })).toEqual({ ok: true, type: "image/png" });
    expect(checkStoredMenuImage({ contentType: "image/png", size: 0 })).toEqual({ ok: false, problem: "empty" });
    expect(checkStoredMenuImage({ contentType: "image/jpeg", size: 10 * MB + 1 })).toEqual({ ok: false, problem: "too_large" });
    expect(checkStoredMenuImage({ contentType: "image/heic", size: 1000 })).toEqual({ ok: false, problem: "heic" });
    expect(checkStoredMenuImage({ contentType: "application/pdf", size: 20 * MB })).toEqual({ ok: false, problem: "wrong_type" });
  });
});

describe("formatMegabytes", () => {
  test("one decimal with a decimal comma", () => {
    expect(formatMegabytes(Math.round(14.2 * MB))).toBe("14,2");
    expect(formatMegabytes(10 * MB)).toBe("10,0");
    expect(formatMegabytes(20 * MB)).toBe("20,0");
    expect(formatMegabytes(11.5 * MB)).toBe("11,5");
  });

  test("rounds to the nearest tenth, half up", () => {
    expect(formatMegabytes(1.25 * MB)).toBe("1,3");
    expect(formatMegabytes(1.75 * MB)).toBe("1,8");
    expect(formatMegabytes(1.24 * MB)).toBe("1,2");
    expect(formatMegabytes(15_000_000)).toBe("14,3");
  });

  test("never shows less than 0,1", () => {
    expect(formatMegabytes(1)).toBe("0,1");
    expect(formatMegabytes(0)).toBe("0,1");
    expect(formatMegabytes(50_000)).toBe("0,1");
  });
});
