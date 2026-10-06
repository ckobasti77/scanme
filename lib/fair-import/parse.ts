// Admin UX A5 — the table of a catalog import as pasted from Excel or Google
// Sheets (tab separated) or read from a CSV file (`;` from a Serbian Excel or
// `,`). Written by hand (no new npm package): quoted cells may hold the
// delimiter, tabs, `""` and line breaks; a BOM, `\r\n` and empty rows are
// handled. Pure; the first non-empty row is the header.

export type ImportDelimiter = "\t" | ";" | ",";

export type ParsedImportRow = {
  /** 1-based line of the row's first character in the source text (what a spreadsheet user sees as the row number). */
  line: number;
  cells: string[];
};

export type ParsedImportTable = {
  delimiter: ImportDelimiter;
  headers: string[];
  /** Data rows (without the header and without empty rows), every row padded to the header width. */
  rows: ParsedImportRow[];
  /** A quote was opened and never closed — the end of the text was read as one cell. */
  unclosedQuote: boolean;
};

const BOM = /^﻿/;

/** Tab when the first row has one (spreadsheet paste); otherwise `;` or `,`, whichever the header uses more (outside quotes). */
export function detectImportDelimiter(text: string): ImportDelimiter {
  const counts = { "\t": 0, ";": 0, ",": 0 };
  let quoted = false;
  for (const char of text.replace(BOM, "")) {
    if (char === "\"") quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (counts["\t"] + counts[";"] + counts[","] > 0) break;
    } else if (!quoted && char in counts) counts[char as ImportDelimiter] += 1;
  }
  if (counts["\t"] > 0) return "\t";
  return counts[";"] > counts[","] ? ";" : ",";
}

function splitRecords(text: string, delimiter: ImportDelimiter): { records: ParsedImportRow[]; unclosedQuote: boolean } {
  const records: ParsedImportRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  // A quote opens a quoted cell only at the start of the cell (as Excel and Sheets write them).
  let cellStart = true;
  const endCell = () => {
    cells.push(cell);
    cell = "";
    cellStart = true;
  };
  const endRecord = () => {
    endCell();
    records.push({ line: recordLine, cells });
    cells = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === "\"" && text[index + 1] === "\"") {
        cell += "\"";
        index++;
      } else if (char === "\"") {
        quoted = false;
      } else {
        if (char === "\n") line++;
        // A line break inside a quoted cell is kept as `\n` (also from `\r\n`).
        if (char === "\r" && text[index + 1] === "\n") continue;
        cell += char === "\r" ? "\n" : char;
      }
      continue;
    }
    if (char === "\"" && cellStart) {
      quoted = true;
      cellStart = false;
    } else if (char === delimiter) {
      endCell();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += char;
      cellStart = false;
    }
  }
  if (cell !== "" || cells.length) endRecord();
  return { records, unclosedQuote: quoted };
}

/** Parses the whole text; `delimiter` overrides the detection. Cell values are trimmed. */
export function parseImportTable(text: string, delimiter: ImportDelimiter = detectImportDelimiter(text)): ParsedImportTable {
  const { records, unclosedQuote } = splitRecords(text.replace(BOM, ""), delimiter);
  const filled = records
    .map((record) => ({ line: record.line, cells: record.cells.map((value) => value.trim()) }))
    .filter((record) => record.cells.some(Boolean));
  const [header, ...rows] = filled;
  if (!header) return { delimiter, headers: [], rows: [], unclosedQuote };
  // A wider spreadsheet selection adds empty header cells at the end; they are not columns.
  const headers = [...header.cells];
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const lastFilled = (cells: string[]) => cells.reduce((last, value, index) => (value ? index + 1 : last), 0);
  const width = Math.max(headers.length, ...rows.map((row) => lastFilled(row.cells)));
  while (headers.length < width) headers.push("");
  return {
    delimiter,
    headers,
    rows: rows.map((row) => ({ line: row.line, cells: Array.from({ length: width }, (_, index) => row.cells[index] ?? "") })),
    unclosedQuote,
  };
}
