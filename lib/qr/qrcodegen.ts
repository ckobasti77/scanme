// QR Code generator — a self-contained, dependency-free port of Nayuki's
// reference implementation ("QR Code generator library", MIT License,
// Copyright (c) Project Nayuki, https://www.nayuki.io/page/qr-code-generator-library).
//
// Vendored as SOURCE rather than added as an npm dependency (AGENTS.md: no new
// dependencies) because the live wall (TASK-22) must render a scannable join QR
// with zero network and zero extra packages. Only the byte-mode text path the
// wall needs is exercised, but the full Model-2 pipeline is kept intact so the
// output is a correct, spec-compliant QR symbol.
//
// This is a faithful, mechanical translation of the reference algorithm; the
// structure (segment encoding → version fit → Reed–Solomon ECC → module
// placement → mask selection) is deliberately unchanged so its correctness
// carries over. It is not hand-tuned "clever" code — do not refactor it.

export type Ecc = "LOW" | "MEDIUM" | "QUARTILE" | "HIGH";

const ECC_ORDINAL: Record<Ecc, number> = {
  LOW: 0,
  MEDIUM: 1,
  QUARTILE: 2,
  HIGH: 3,
};
// Format-info bit pattern per ECC level (spec Table 25): L=1, M=0, Q=3, H=2.
const ECC_FORMAT_BITS: Record<Ecc, number> = {
  LOW: 1,
  MEDIUM: 0,
  QUARTILE: 3,
  HIGH: 2,
};

const MIN_VERSION = 1;
const MAX_VERSION = 40;
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// --- Error-correction / codeword tables (spec, one column per version) -------

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  // Version: (note: index 0 is for padding, and is set to an illegal value)
  //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40    Error correction level
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],  // LOW
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],  // MEDIUM
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],  // QUARTILE
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],  // HIGH
];

// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40    Error correction level
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],  // LOW
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],  // MEDIUM
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],  // QUARTILE
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],  // HIGH
];

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

// --- Bit buffer + byte segment ----------------------------------------------

function appendBits(val: number, len: number, bb: number[]): void {
  if (len < 0 || len > 31 || val >>> len !== 0)
    throw new RangeError("Value out of range");
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

// --- Reed–Solomon ------------------------------------------------------------

function reedSolomonMultiply(x: number, y: number): number {
  if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError("Byte out of range");
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  if (z >>> 8 !== 0) throw new Error("Assertion error");
  return z;
}

function reedSolomonComputeDivisor(degree: number): number[] {
  if (degree < 1 || degree > 255) throw new RangeError("Degree out of range");
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(
  data: number[],
  divisor: number[],
): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

// --- The QR code itself ------------------------------------------------------

export class QrCode {
  public readonly size: number;
  private readonly modules: boolean[][] = [];
  private readonly isFunction: boolean[][] = [];

  public static encodeText(text: string, ecl: Ecc): QrCode {
    const data = QrCode.textToBytes(text);
    return QrCode.encodeBytes(data, ecl);
  }

  // The wall only needs UTF-8 byte-mode text; encode the string to UTF-8 bytes.
  private static textToBytes(text: string): number[] {
    const encoded = new TextEncoder().encode(text);
    return Array.from(encoded);
  }

  private static encodeBytes(data: number[], ecl: Ecc): QrCode {
    // Byte-mode segment: mode indicator 0100, char-count, then the bytes.
    // Pick the smallest version that fits at the requested ECC level, then
    // boost the ECC level for free if the data still fits (spec §7.4.10-ish).
    let version = MIN_VERSION;
    let dataUsedBits = 0;
    for (; ; version++) {
      const dataCapacityBits =
        QrCode.getNumDataCodewords(version, ecl) * 8;
      const usedBits = QrCode.byteSegmentBits(data.length, version);
      if (usedBits <= dataCapacityBits) {
        dataUsedBits = usedBits;
        break;
      }
      if (version >= MAX_VERSION)
        throw new RangeError("Data too long for a QR code");
    }
    // Boost ECC while the data still fits at this version.
    let finalEcc = ecl;
    for (const candidate of ["MEDIUM", "QUARTILE", "HIGH"] as Ecc[]) {
      if (
        ECC_ORDINAL[candidate] > ECC_ORDINAL[finalEcc] &&
        dataUsedBits <= QrCode.getNumDataCodewords(version, candidate) * 8
      ) {
        finalEcc = candidate;
      }
    }

    const bb: number[] = [];
    appendBits(0x4, 4, bb); // byte mode indicator
    appendBits(data.length, QrCode.byteCountBits(version), bb);
    for (const b of data) appendBits(b, 8, bb);

    const dataCapacityBits =
      QrCode.getNumDataCodewords(version, finalEcc) * 8;
    appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb); // terminator
    appendBits(0, (8 - (bb.length % 8)) % 8, bb); // pad to byte
    for (let pad = 0xec; bb.length < dataCapacityBits; pad ^= 0xec ^ 0x11)
      appendBits(pad, 8, bb);

    const dataCodewords: number[] = [];
    for (let i = 0; i < bb.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bb[i + j];
      dataCodewords.push(byte);
    }

    return new QrCode(version, finalEcc, dataCodewords);
  }

  private static byteCountBits(version: number): number {
    // Byte mode char-count width: 8 bits for v1–9, 16 for v10–40.
    return version < 10 ? 8 : 16;
  }

  private static byteSegmentBits(numBytes: number, version: number): number {
    return 4 + QrCode.byteCountBits(version) + numBytes * 8;
  }

  private constructor(
    public readonly version: number,
    public readonly ecc: Ecc,
    dataCodewords: number[],
  ) {
    if (version < MIN_VERSION || version > MAX_VERSION)
      throw new RangeError("Version out of range");
    this.size = version * 4 + 17;
    for (let i = 0; i < this.size; i++) {
      this.modules.push(new Array<boolean>(this.size).fill(false));
      this.isFunction.push(new Array<boolean>(this.size).fill(false));
    }

    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    // Choose the mask with the lowest penalty.
    let minPenalty = Infinity;
    let bestMask = 0;
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask);
      this.drawFormatBits(mask);
      const penalty = this.getPenaltyScore();
      if (penalty < minPenalty) {
        bestMask = mask;
        minPenalty = penalty;
      }
      this.applyMask(mask); // undo (XOR is its own inverse)
    }
    this.applyMask(bestMask);
    this.drawFormatBits(bestMask);
  }

  public getModule(x: number, y: number): boolean {
    return (
      x >= 0 && x < this.size && y >= 0 && y < this.size && this.modules[y][x]
    );
  }

  // --- Function-pattern drawing ---------------------------------------------

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const alignPatPos = this.getAlignmentPatternPositions();
    const numAlign = alignPatPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          !(
            (i === 0 && j === 0) ||
            (i === 0 && j === numAlign - 1) ||
            (i === numAlign - 1 && j === 0)
          )
        ) {
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
        }
      }
    }

    this.drawFormatBits(0); // dummy; overwritten after masking
    this.drawVersion();
  }

  private drawFormatBits(mask: number): void {
    const data = (ECC_FORMAT_BITS[this.ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    if (bits >>> 15 !== 0) throw new Error("Assertion error");

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++)
      this.setFunctionModule(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++)
      this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++)
      this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true); // always-dark module
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    if (bits >>> 18 !== 0) throw new Error("Assertion error");

    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        this.setFunctionModule(
          x + dx,
          y + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
        );
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  // --- ECC + interleaving ----------------------------------------------------

  private addEccAndInterleave(data: number[]): number[] {
    const ver = this.version;
    const ecl = this.ecc;
    if (data.length !== QrCode.getNumDataCodewords(ver, ecl))
      throw new RangeError("Invalid argument");

    const numBlocks =
      NUM_ERROR_CORRECTION_BLOCKS[ECC_ORDINAL[ecl]][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ECC_ORDINAL[ecl]][ver];
    const rawCodewords = Math.floor(
      QrCode.getNumRawDataModules(ver) / 8,
    );
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const rsDiv = reedSolomonComputeDivisor(blockEccLen);
    let k = 0;
    for (let i = 0; i < numBlocks; i++) {
      const datLen =
        shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += datLen;
      const ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        // Skip the padding cell added to short blocks.
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
          result.push(block[i]);
      });
    }
    return result;
  }

  private drawCodewords(data: number[]): void {
    if (
      data.length !==
      Math.floor(QrCode.getNumRawDataModules(this.version) / 8)
    )
      throw new RangeError("Invalid argument");
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      const rr = right === 6 ? 5 : right;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = rr - j;
          const upward = ((rr + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  // --- Masking + penalty -----------------------------------------------------

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          case 7:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            throw new Error("Assertion error");
        }
        if (!this.isFunction[y][x] && invert)
          this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;

    // Adjacent modules in rows / columns having same color.
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runX = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor)
            result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y][x];
          runX = 1;
        }
      }
      result +=
        this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) *
        PENALTY_N3;
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runY = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (this.modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor)
            result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
      result +=
        this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) *
        PENALTY_N3;
    }

    // 2×2 blocks of same color.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.modules[y][x];
        if (
          c === this.modules[y][x + 1] &&
          c === this.modules[y + 1][x] &&
          c === this.modules[y + 1][x + 1]
        )
          result += PENALTY_N2;
      }
    }

    // Balance of dark/light modules.
    let dark = 0;
    for (const row of this.modules)
      for (const cell of row) if (cell) dark++;
    const total = size * size;
    const k =
      Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  private finderPenaltyCountPatterns(runHistory: number[]): number {
    const n = runHistory[1];
    const core =
      n > 0 &&
      runHistory[2] === n &&
      runHistory[3] === n * 3 &&
      runHistory[4] === n &&
      runHistory[5] === n;
    return (
      (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
      (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
    );
  }

  private finderPenaltyTerminateAndCount(
    currentRunColor: boolean,
    currentRunLength: number,
    runHistory: number[],
  ): number {
    let runLen = currentRunLength;
    if (currentRunColor) {
      this.finderPenaltyAddHistory(runLen, runHistory);
      runLen = 0;
    }
    runLen += this.size;
    this.finderPenaltyAddHistory(runLen, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }

  private finderPenaltyAddHistory(
    currentRunLength: number,
    runHistory: number[],
  ): void {
    if (runHistory[0] === 0) currentRunLength += this.size;
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }

  // --- Version geometry ------------------------------------------------------

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step =
      this.version === 32
        ? 26
        : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result: number[] = [6];
    for (
      let pos = this.size - 7;
      result.length < numAlign;
      pos -= step
    )
      result.splice(1, 0, pos);
    return result;
  }

  private static getNumRawDataModules(ver: number): number {
    if (ver < MIN_VERSION || ver > MAX_VERSION)
      throw new RangeError("Version out of range");
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  private static getNumDataCodewords(ver: number, ecl: Ecc): number {
    return (
      Math.floor(QrCode.getNumRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ECC_ORDINAL[ecl]][ver] *
        NUM_ERROR_CORRECTION_BLOCKS[ECC_ORDINAL[ecl]][ver]
    );
  }
}

// Convenience: the boolean module matrix for `text`, quiet zone excluded.
// The wall renders this as SVG rects. Level MEDIUM is the sweet spot for a
// short join URL projected on a screen — plenty of error tolerance without
// inflating the module count.
export function qrMatrix(text: string, ecc: Ecc = "MEDIUM"): boolean[][] {
  const qr = QrCode.encodeText(text, ecc);
  const matrix: boolean[][] = [];
  for (let y = 0; y < qr.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < qr.size; x++) row.push(qr.getModule(x, y));
    matrix.push(row);
  }
  return matrix;
}
