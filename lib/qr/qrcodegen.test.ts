// TASK-22 — the vendored QR generator (lib/qr/qrcodegen.ts). A QR only helps the
// wall recruit if it actually scans, so these assert structural correctness that
// a transcription bug would break: the finder patterns, the timing patterns, the
// always-dark module, the version→size relation, and — the strongest check — a
// full round-trip of the 15-bit format information (the masking + BCH + format
// placement path, where a port is most likely to go wrong).

import { describe, expect, test } from "vitest";
import { QrCode, qrMatrix } from "./qrcodegen";

function isFinder(m: boolean[][], ox: number, oy: number): boolean {
  // A 7×7 finder: dark ring, light gap, dark 3×3 core.
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const ring = x === 0 || x === 6 || y === 0 || y === 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      const expected = ring || core;
      if (m[oy + y][ox + x] !== expected) return false;
    }
  }
  return true;
}

// Read the 15 format-info modules (top-left copy) back into a codeword.
function readFormat(m: boolean[][]): number {
  const pos: Array<[number, number]> = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  let bits = 0;
  for (let i = 0; i < 15; i++) {
    if (m[pos[i][1]][pos[i][0]]) bits |= 1 << i;
  }
  return bits;
}

describe("qr structure", () => {
  test("version/size relation and finder patterns for a join URL", () => {
    const m = qrMatrix("https://scanme.rs/m/ABCD2345", "MEDIUM");
    const size = m.length;
    // size must be 4*version + 17 for some version 1..40.
    expect((size - 17) % 4).toBe(0);
    const version = (size - 17) / 4;
    expect(version).toBeGreaterThanOrEqual(1);
    expect(version).toBeLessThanOrEqual(40);

    // Three finder patterns, top-left / top-right / bottom-left.
    expect(isFinder(m, 0, 0)).toBe(true);
    expect(isFinder(m, size - 7, 0)).toBe(true);
    expect(isFinder(m, 0, size - 7)).toBe(true);

    // Timing patterns alternate along row/col 6.
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }

    // The always-dark module.
    expect(m[size - 8][8]).toBe(true);
  });

  test("format information round-trips (mask + BCH + placement)", () => {
    const m = qrMatrix("https://scanme.rs/m/ABCD2345", "MEDIUM");
    const bits = readFormat(m);
    const data = (bits ^ 0x5412) >>> 10;
    const ecc = data >> 3;
    const mask = data & 7;
    expect(ecc).toBeGreaterThanOrEqual(0);
    expect(ecc).toBeLessThanOrEqual(3);
    expect(mask).toBeGreaterThanOrEqual(0);
    expect(mask).toBeLessThanOrEqual(7);

    // Re-encode the extracted (ecc,mask) through the same format BCH and confirm
    // it reproduces the exact 15 modules read from the symbol — a valid, self
    // consistent format string, not noise.
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const expected = ((data << 10) | rem) ^ 0x5412;
    expect(expected).toBe(bits);
  });

  test("encodes a range of lengths without throwing, growing the symbol", () => {
    let lastSize = 0;
    for (const text of ["a", "https://scanme.rs/m/ABCD2345", "x".repeat(300)]) {
      const qr = QrCode.encodeText(text, "MEDIUM");
      expect(qr.size).toBeGreaterThanOrEqual(lastSize > 0 ? 0 : 21);
      lastSize = qr.size;
    }
    // 300 bytes needs a much larger symbol than one byte.
    expect(QrCode.encodeText("x".repeat(300), "MEDIUM").size).toBeGreaterThan(
      QrCode.encodeText("a", "MEDIUM").size,
    );
  });
});
