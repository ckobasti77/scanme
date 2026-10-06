// Admin UX A4 — „Dodela u većem broju“: two columns pasted from Excel, Google
// Sheets or a CSV file (code from the sticker — SMQ or resolver code — and the
// model's externalKey or id). The delimiter is found automatically (tab, `;`
// from a Serbian Excel, `,`), quotes, a BOM and `\r\n` are handled, and a
// header row is skipped. Pure; the backend dry run checks every pair. A5's
// catalog import parser may later replace this local one.

import { FAIR_QR_BULK_MAX_ROWS } from "@/lib/fair-contract";

export type QrBulkPair = { line: number; code: string; model: string };
export type QrBulkParse = {
  rows: QrBulkPair[];
  /** Lines (1-based) that do not have exactly two filled columns. */
  invalidLines: number[];
  headerSkipped: boolean;
  tooMany: boolean;
};

type Delimiter = "\t" | ";" | "," | "space";

function detectDelimiter(lines: readonly string[]): Delimiter {
  if (lines.some((line) => line.includes("\t"))) return "\t";
  const count = (char: string) => lines.reduce((sum, line) => sum + line.split(char).length - 1, 0);
  const semicolons = count(";");
  const commas = count(",");
  if (semicolons || commas) return semicolons >= commas ? ";" : ",";
  return "space";
}

/** One CSV line: `"…"` fields may contain the delimiter, `""` is a quote. */
function splitLine(line: string, delimiter: Delimiter): string[] {
  if (delimiter === "space") return line.trim().split(/\s+/);
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === "\"" && line[index + 1] === "\"") {
        cell += "\"";
        index++;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"" && !cell.trim()) {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

const HEADER_CODE = /^(kod|code|qr|smq|resolver|nalepnica|sticker)\b/i;
const HEADER_MODEL = /^(model|externalkey|external key|kljuc|ključ|id)\b/i;

function looksLikeHeader(cells: readonly string[]): boolean {
  const [first = "", second = ""] = cells;
  if (/^SMQ-[A-Z0-9]/i.test(first)) return false;
  return HEADER_CODE.test(first) || HEADER_MODEL.test(second);
}

export function parseQrBulkText(text: string): QrBulkParse {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((line, index) => ({ line: index + 1, text: line })).filter((row) => row.text.trim());
  const delimiter = detectDelimiter(lines.map((row) => row.text));
  const rows: QrBulkPair[] = [];
  const invalidLines: number[] = [];
  let headerSkipped = false;
  for (const [position, { line, text: raw }] of lines.entries()) {
    const cells = splitLine(raw, delimiter);
    // Trailing empty cells (a wider spreadsheet selection) do not count.
    while (cells.length > 2 && !cells[cells.length - 1]) cells.pop();
    if (position === 0 && looksLikeHeader(cells)) {
      headerSkipped = true;
      continue;
    }
    if (cells.length !== 2 || !cells[0] || !cells[1]) {
      invalidLines.push(line);
      continue;
    }
    rows.push({ line, code: cells[0], model: cells[1] });
  }
  return { rows, invalidLines, headerSkipped, tooMany: rows.length > FAIR_QR_BULK_MAX_ROWS };
}
