// TASK-16 STEP 5 — content-based format detection, proven on bytes. The
// point under test: the sniffer sees ONLY bytes — a file whose name and MIME
// both lie (the mislabelled-HEIC-as-JPEG phones actually produce) is detected
// by its magic number anyway.

import { describe, expect, test } from "vitest";
import { detectImageFormat, isBrowserNativeFormat } from "./detect";
import { sniffFile } from "./prepare";

function bytes(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      for (const char of part) out.push(char.charCodeAt(0));
    } else {
      out.push(...part);
    }
  }
  return new Uint8Array(out);
}

// A minimal ISO-BMFF ftyp box: size, "ftyp", major brand, minor version,
// compatible brands — exactly what sits at byte 0 of every HEIC/AVIF file.
function ftyp(major: string, ...compatible: string[]): Uint8Array {
  const size = 16 + compatible.length * 4;
  return bytes(
    [0, 0, 0, size],
    "ftyp",
    major,
    [0, 0, 0, 0],
    ...compatible,
  );
}

describe("detectImageFormat", () => {
  test("JPEG by SOI marker", () => {
    expect(detectImageFormat(bytes([0xff, 0xd8, 0xff, 0xe1, 0x00]))).toBe(
      "jpeg",
    );
  });

  test("PNG by signature", () => {
    expect(
      detectImageFormat(
        bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13]),
      ),
    ).toBe("png");
  });

  test("GIF and WebP by their RIFF/ASCII signatures", () => {
    expect(detectImageFormat(bytes("GIF89a", [0x01]))).toBe("gif");
    expect(
      detectImageFormat(bytes("RIFF", [0x24, 0x00, 0x00, 0x00], "WEBPVP8 ")),
    ).toBe("webp");
  });

  test("HEIC by ftyp major brand (the iPhone default: heic)", () => {
    expect(detectImageFormat(ftyp("heic", "mif1", "heic"))).toBe("heic");
  });

  test("HEIF structural major brand mif1 with the codec brand in compatibles", () => {
    expect(detectImageFormat(ftyp("mif1", "heic", "hevc"))).toBe("heic");
  });

  test("AVIF by major brand — and AVIF wins over a mif1 compatible", () => {
    expect(detectImageFormat(ftyp("avif", "mif1", "miaf"))).toBe("avif");
    // Sequence variant lists both families; avif still wins.
    expect(detectImageFormat(ftyp("avis", "msf1", "avif"))).toBe("avif");
  });

  test("a plain MP4 ftyp is NOT an image", () => {
    expect(detectImageFormat(ftyp("isom", "iso2", "mp41"))).toBe("unknown");
  });

  test("garbage, empty, and truncated inputs are unknown", () => {
    expect(detectImageFormat(new Uint8Array(0))).toBe("unknown");
    expect(detectImageFormat(bytes([0x00, 0x01, 0x02, 0x03]))).toBe("unknown");
    // Truncated JPEG SOI (2 of 3 marker bytes) must not match.
    expect(detectImageFormat(bytes([0xff, 0xd8]))).toBe("unknown");
    // "ftyp" present but the box is too short to carry a brand.
    expect(detectImageFormat(bytes([0, 0, 0, 8], "ftyp"))).toBe("unknown");
  });

  test("only HEIC (and unknown) route away from the native decoder", () => {
    expect(isBrowserNativeFormat("jpeg")).toBe(true);
    expect(isBrowserNativeFormat("avif")).toBe(true);
    expect(isBrowserNativeFormat("heic")).toBe(false);
    expect(isBrowserNativeFormat("unknown")).toBe(false);
  });
});

describe("sniffFile ignores everything except bytes", () => {
  test("a HEIC mislabelled as .jpg with MIME image/jpeg is still HEIC", async () => {
    const lying = new File([ftyp("heic", "mif1", "heic")], "photo.jpg", {
      type: "image/jpeg",
    });
    expect(lying.name).toBe("photo.jpg");
    expect(lying.type).toBe("image/jpeg");
    expect(await sniffFile(lying)).toBe("heic");
  });

  test("a text file dressed as an image is unknown", async () => {
    const lying = new File(["definitely not pixels"], "photo.png", {
      type: "image/png",
    });
    expect(await sniffFile(lying)).toBe("unknown");
  });
});
