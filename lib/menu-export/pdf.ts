// Menu export — a minimal hand-rolled PDF 1.4 writer (RFC-003 §2.9, TASK-58).
//
// WHY HAND-ROLLED: AGENTS.md forbids adding a dependency un-asked, and
// lib/memories-export/zip.ts set the precedent. The whole file is built as ONE
// "binary string" (every char code 0..255) and converted once at the end, so
// every xref offset is simply a string index. Content streams are uncompressed
// (no zlib ⇒ no Node, runs in the Convex DEFAULT runtime and the edge vitest
// env). Fonts are the non-embedded standard-14 Helvetica / Helvetica-Bold with
// a custom /Encoding: WinAnsi already carries Š š Ž ž; the six glyphs it lacks
// (Ć ć Č č Đ đ) ride /Differences on codes WinAnsi leaves unused. All six names
// are in the Adobe standard Latin set the Core14 fonts ship, so every shipping
// viewer (PDFium, pdf.js, Acrobat, Preview) resolves them from its substitute
// face. Cyrillic or other non-Latin text renders as "?" — embedding a font is
// the follow-up if it is ever needed (BLOCKED TASK-58).

import {
  assertExportSize,
  flattenMenu,
  priceText,
  type ExportGroup,
  type ExportLabels,
  type ExportRow,
  type ExportStamp,
} from "./rows";
import type { MenuModel } from "../menu-blocks";

// -----------------------------------------------------------------------------
// Text encoding: JS string → binary string of single-byte codes
// -----------------------------------------------------------------------------

// The six Differences slots (unused WinAnsi codes; overriding them shadows
// nothing Serbian copy uses — „ “ ” … – — € all keep their WinAnsi codes).
export const PDF_DIFFERENCES: ReadonlyArray<readonly [number, string, number]> = [
  [0x7f, "dcroat", 0x0111],
  [0x81, "Cacute", 0x0106],
  [0x8d, "cacute", 0x0107],
  [0x8f, "Ccaron", 0x010c],
  [0x90, "ccaron", 0x010d],
  [0x9d, "Dcroat", 0x0110],
];

// U+ → byte for the WinAnsi 0x80–0x9F block, plus the six Differences slots.
const HIGH_CODES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};
for (const [code, , codePoint] of PDF_DIFFERENCES) HIGH_CODES[codePoint] = code;

// JS string → binary string (chars 0..255). Control characters are dropped,
// a tab becomes a space, anything the encoding cannot express becomes "?".
export function encodeText(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    if (cp === 0x09) out += " ";
    else if (cp < 0x20 || cp === 0x7f) continue;
    else if (cp <= 0x7e) out += ch;
    else if (cp >= 0xa0 && cp <= 0xff) out += ch;
    else {
      const code = HIGH_CODES[cp];
      out += code === undefined ? "?" : String.fromCharCode(code);
    }
  }
  return out;
}

// A literal string operand: escape ( ) \ ; high bytes are emitted raw.
function literal(binary: string): string {
  return "(" + binary.replace(/[\\()]/g, (m) => "\\" + m) + ")";
}

// -----------------------------------------------------------------------------
// Metrics (Core14 AFM widths, codes 32..126, /1000 em). Layout only — the
// viewer draws with its own metrics, so a width error can nudge a price by a
// point, never break rendering.
// -----------------------------------------------------------------------------

const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Diacritics fold to their base letter (exact in the AFMs for Serbian Latin).
const FOLD: Record<string, string> = {
  Č: "C", č: "c", Ć: "C", ć: "c", Đ: "D", đ: "d", Š: "S", š: "s", Ž: "Z", ž: "z",
};
// Widths (regular, bold) for the CP1252 punctuation Serbian copy uses.
const PUNCT: Record<string, [number, number]> = {
  "…": [1000, 1000], "–": [556, 556], "—": [1000, 1000],
  "„": [333, 500], "“": [333, 500], "”": [333, 500],
  "‚": [222, 278], "‘": [222, 278], "’": [222, 278],
  "•": [350, 350], "€": [556, 556], "°": [400, 400], " ": [278, 278],
};

type Face = "F1" | "F2";

function charWidth(ch: string, face: Face): number {
  const folded = FOLD[ch] ?? ch;
  const code = folded.charCodeAt(0);
  if (code >= 32 && code <= 126) {
    return (face === "F2" ? HELVETICA_BOLD : HELVETICA)[code - 32];
  }
  const punct = PUNCT[ch];
  if (punct) return face === "F2" ? punct[1] : punct[0];
  return 556;
}

export function textWidth(text: string, face: Face, size: number): number {
  let total = 0;
  for (const ch of text) total += charWidth(ch, face);
  return (total * size) / 1000;
}

// Greedy word wrap; a single word wider than the line is broken by characters.
export function wrapText(
  text: string,
  face: Face,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n|\u2028|\u2029/);
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, face, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      let chunk = "";
      for (const ch of word) {
        if (chunk && textWidth(chunk + ch, face, size) > maxWidth) {
          lines.push(chunk);
          chunk = "";
        }
        chunk += ch;
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

// -----------------------------------------------------------------------------
// Layout constants (pt)
// -----------------------------------------------------------------------------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 48;
const RIGHT = PAGE_W - MX;
const CONTENT_W = RIGHT - MX;
const TOP_Y = PAGE_H - 56;
const BOTTOM = 64;
const FOOTER_Y = 36;

const TITLE_SIZE = 18;
const SUBTITLE_SIZE = 9;
const HEADING_SIZE = 13;
const HEADING_H = 26;
const NAME_SIZE = 10.5;
const NAME_LH = 14;
const DESC_SIZE = 8.5;
const DESC_LH = 11;
const DESC_INDENT = 10;
const VARIANT_SIZE = 9;
const VARIANT_LH = 12;
const VARIANT_INDENT = 14;
const ITEM_GAP = 6;
const GREY = "0.45 g";
const BLACK = "0 g";

const n2 = (n: number) => n.toFixed(2);

function textOp(face: Face, size: number, x: number, y: number, binary: string) {
  return `BT /${face} ${size} Tf ${n2(x)} ${n2(y)} Td ${literal(binary)} Tj ET\n`;
}

// -----------------------------------------------------------------------------
// Blocks: measure first, then place (a heading is never orphaned from its
// first item; an item never splits — its max height under TEXT_MAX and
// MAX_VARIANTS_PER_ITEM is ≈ 330 pt, far under the ≈ 700 pt body).
// -----------------------------------------------------------------------------

type ItemLayout = {
  row: ExportRow;
  nameLines: string[];
  descLines: string[];
  height: number;
};

function layoutItem(row: ExportRow, labels: ExportLabels): ItemLayout {
  const price = row.priceRsd === undefined ? "" : priceText(row.priceRsd);
  const priceW = price ? textWidth(price, "F1", NAME_SIZE) + 8 : 0;
  const marker = row.available ? "" : ` ${labels.unavailable}`;
  const markerW = marker ? textWidth(marker, "F1", NAME_SIZE) : 0;
  const nameLines = wrapText(
    row.name || "—",
    "F2",
    NAME_SIZE,
    Math.max(80, CONTENT_W - priceW - markerW),
  );
  const descLines = row.description
    ? wrapText(row.description, "F1", DESC_SIZE, CONTENT_W - DESC_INDENT)
    : [];
  const height =
    nameLines.length * NAME_LH +
    descLines.length * DESC_LH +
    row.variants.length * VARIANT_LH +
    ITEM_GAP;
  return { row, nameLines, descLines, height };
}

class PageWriter {
  private pages: string[] = [];
  private content: string;
  y: number;

  constructor(firstPageOps: string, firstY: number) {
    this.content = firstPageOps;
    this.y = firstY;
  }

  add(ops: string) {
    this.content += ops;
  }

  // Break before a block that would cross the bottom margin — unless the page
  // is still empty, in which case the block is placed anyway (no infinite
  // loop; cannot happen under the model's bounds, see above).
  ensure(height: number) {
    if (this.y - height < BOTTOM && this.y < TOP_Y) {
      this.pages.push(this.content);
      this.content = "";
      this.y = TOP_Y;
    }
  }

  finish(): string[] {
    this.pages.push(this.content);
    return this.pages;
  }
}

function drawHeader(businessName: string, subtitle: string): { ops: string; y: number } {
  let ops = "";
  let y = PAGE_H - 60;
  const titleLines = wrapText(businessName || "Meni", "F2", TITLE_SIZE, CONTENT_W);
  for (const line of titleLines) {
    ops += textOp("F2", TITLE_SIZE, MX, y, encodeText(line));
    y -= TITLE_SIZE + 4;
  }
  ops += `${GREY}\n${textOp("F1", SUBTITLE_SIZE, MX, y, encodeText(subtitle))}${BLACK}\n`;
  y -= 10;
  ops += `0.5 w 0.7 G ${n2(MX)} ${n2(y)} m ${n2(RIGHT)} ${n2(y)} l S 0 G\n`;
  return { ops, y: y - 14 };
}

function drawItem(writer: PageWriter, item: ItemLayout, labels: ExportLabels) {
  const { row } = item;
  const price = row.priceRsd === undefined ? "" : priceText(row.priceRsd);
  const marker = row.available ? "" : ` ${labels.unavailable}`;

  item.nameLines.forEach((line, index) => {
    const y = writer.y - NAME_SIZE;
    writer.add(textOp("F2", NAME_SIZE, MX, y, encodeText(line)));
    if (index === 0 && price) {
      const x = RIGHT - textWidth(price, "F1", NAME_SIZE);
      const op = textOp("F1", NAME_SIZE, x, y, encodeText(price));
      writer.add(row.available ? op : `${GREY}\n${op}${BLACK}\n`);
    }
    if (index === item.nameLines.length - 1 && marker) {
      const x = MX + textWidth(line, "F2", NAME_SIZE);
      writer.add(`${GREY}\n${textOp("F1", NAME_SIZE, x, y, encodeText(marker))}${BLACK}\n`);
    }
    writer.y -= NAME_LH;
  });

  if (item.descLines.length) {
    writer.add(`${GREY}\n`);
    for (const line of item.descLines) {
      writer.add(
        textOp("F1", DESC_SIZE, MX + DESC_INDENT, writer.y - DESC_SIZE, encodeText(line)),
      );
      writer.y -= DESC_LH;
    }
    writer.add(`${BLACK}\n`);
  }

  for (const variant of row.variants) {
    const y = writer.y - VARIANT_SIZE;
    const label = variant.label || "—";
    const vPrice = priceText(variant.priceRsd);
    const labelX = MX + VARIANT_INDENT;
    const priceX = RIGHT - textWidth(vPrice, "F1", VARIANT_SIZE);
    const labelEnd = labelX + textWidth(label, "F1", VARIANT_SIZE);
    writer.add(textOp("F1", VARIANT_SIZE, labelX, y, encodeText(label)));
    writer.add(textOp("F1", VARIANT_SIZE, priceX, y, encodeText(vPrice)));
    const x1 = labelEnd + 4;
    const x2 = priceX - 4;
    if (x2 - x1 >= 8) {
      writer.add(
        `0.5 w [0.8 2.2] 0 d 0.55 G ${n2(x1)} ${n2(y + 2.5)} m ${n2(x2)} ${n2(y + 2.5)} l S [] 0 d 0 G\n`,
      );
    }
    writer.y -= VARIANT_LH;
  }

  writer.y -= ITEM_GAP;
}

function drawGroups(writer: PageWriter, groups: ExportGroup[], labels: ExportLabels) {
  for (const group of groups) {
    const items = group.rows.map((row) => layoutItem(row, labels));
    // Heading + first item travel together (never an orphaned heading).
    writer.ensure(HEADING_H + (items[0]?.height ?? 0));
    writer.y -= HEADING_H - HEADING_SIZE;
    writer.add(textOp("F2", HEADING_SIZE, MX, writer.y, encodeText(group.title || "—")));
    writer.y -= HEADING_SIZE;
    items.forEach((item, index) => {
      if (index > 0) writer.ensure(item.height);
      drawItem(writer, item, labels);
    });
  }
}

// -----------------------------------------------------------------------------
// Assembly
// -----------------------------------------------------------------------------

function utf16Hex(text: string): string {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i += 1) {
    hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

function latin1Bytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    const code = binary.charCodeAt(i);
    if (code > 0xff) {
      throw new Error(`pdf: non-byte char U+${code.toString(16)} in output`);
    }
    out[i] = code;
  }
  return out;
}

export type MenuPdfInput = {
  businessName: string;
  stamp: ExportStamp;
  model: MenuModel;
  labels: ExportLabels;
};

export function buildMenuPdf(input: MenuPdfInput): Uint8Array {
  assertExportSize(input.model);
  const { labels } = input;
  const groups = flattenMenu(input.model);

  const header = drawHeader(input.businessName, labels.subtitle);
  const writer = new PageWriter(header.ops, header.y);
  drawGroups(writer, groups, labels);
  const pages = writer.finish();

  const pageCount = pages.length;
  const contents = pages.map((content, index) => {
    const footer = labels.pageOf
      .replace("{page}", String(index + 1))
      .replace("{pages}", String(pageCount));
    const x = (PAGE_W - textWidth(footer, "F1", 8)) / 2;
    return `${content}${GREY}\n${textOp("F1", 8, x, FOOTER_Y, encodeText(footer))}${BLACK}\n`;
  });

  const differences = PDF_DIFFERENCES.map(([code, name]) => `${code} /${name}`).join(" ");
  const two = (n: number) => String(n).padStart(2, "0");
  const s = input.stamp;
  const creation = `D:${s.year}${two(s.month)}${two(s.day)}${two(s.hour)}${two(s.minute)}${two(s.second)}`;

  // Fixed object numbers: 1 Catalog, 2 Pages, 3 Encoding, 4/5 fonts,
  // 6 Resources, 7 Info, then (Page, Contents) pairs from 8.
  const objects: string[] = [];
  const pageObjectNumber = (index: number) => 8 + index * 2;
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(
    `<< /Type /Pages /Kids [${contents.map((_, i) => `${pageObjectNumber(i)} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );
  objects.push(
    `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${differences}] >>`,
  );
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding 3 0 R >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding 3 0 R >>`);
  objects.push(`<< /Font << /F1 4 0 R /F2 5 0 R >> /ProcSet [/PDF /Text] >>`);
  objects.push(
    `<< /Producer (ScanMe) /Title ${utf16Hex(input.businessName)} /CreationDate (${creation}) >>`,
  );
  contents.forEach((content) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(PAGE_W)} ${n2(PAGE_H)}] /Resources 6 0 R /Contents ${objects.length + 2} 0 R >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return latin1Bytes(out);
}
