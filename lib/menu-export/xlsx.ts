// Menu export — a minimal OOXML .xlsx writer (RFC-003 §2.9, TASK-58).
//
// An .xlsx is a ZIP of XML parts, so this composes the hand-rolled STORE ZIP
// writer the Memories export already ships (lib/memories-export/zip.ts —
// Uint8Array/DataView/TextEncoder only, edge-safe) with six small XML parts.
// Excel, LibreOffice and Numbers all accept STORE (uncompressed) entries; OPC
// has no "mimetype-first" rule (that is ODF/EPUB). Inline strings
// (`t="inlineStr"`) avoid a sharedStrings part; prices are numeric cells with
// the built-in `#,##0` format so a Serbian Excel shows `1.200`. styles.xml IS
// required: without it every `s="…"` points at nothing and Excel asks to
// repair; the minimal sheet carries the two mandatory fills (`none`, `gray125`).

import {
  centralDirectory,
  concatBytes,
  crc32,
  dosDateTime,
  localFileRecord,
  type ZipEntry,
} from "../memories-export/zip";
import {
  assertExportSize,
  flattenMenu,
  priceText,
  type ExportLabels,
  type ExportRow,
  type ExportStamp,
} from "./rows";
import type { MenuModel } from "../menu-blocks";

const encoder = new TextEncoder();

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// XML 1.0 allows only \t \n \r below 0x20; Excel refuses anything else, and
// lone surrogates are not valid UTF-8 text.
function stripInvalidXml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

export function escapeXml(text: string): string {
  return stripInvalidXml(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COLUMN_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

function textCell(ref: string, text: string, style?: number): string {
  const clean = stripInvalidXml(text);
  const preserve = /^\s|\s$|\n/.test(clean) ? ' xml:space="preserve"' : "";
  const s = style === undefined ? "" : ` s="${style}"`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t${preserve}>${escapeXml(clean)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style: number): string {
  return `<c r="${ref}" s="${style}"><v>${Math.round(value)}</v></c>`;
}

function rowXml(rowNumber: number, cells: Array<string | null>): string {
  const parts = cells.filter((cell): cell is string => cell !== null);
  return `<row r="${rowNumber}">${parts.join("")}</row>\n`;
}

function headerRow(labels: ExportLabels): string {
  const c = labels.columns;
  const heads = [
    c.group, c.shape, c.name, c.description, c.productType,
    c.price, c.variants, c.available, c.daypart,
  ];
  return rowXml(
    1,
    heads.map((head, i) => textCell(`${COLUMN_LETTERS[i]}1`, head, 1)),
  );
}

function itemRow(rowNumber: number, row: ExportRow, labels: ExportLabels): string {
  const ref = (i: number) => `${COLUMN_LETTERS[i]}${rowNumber}`;
  const variants = row.variants
    .map((v) => `${v.label}: ${priceText(v.priceRsd)}`)
    .join("; ");
  return rowXml(rowNumber, [
    textCell(ref(0), row.groupTitle),
    textCell(ref(1), row.shape),
    textCell(ref(2), row.name),
    row.description ? textCell(ref(3), row.description) : null,
    textCell(ref(4), row.productType),
    row.priceRsd === undefined ? null : numberCell(ref(5), row.priceRsd, 2),
    variants ? textCell(ref(6), variants) : null,
    textCell(ref(7), row.available ? labels.yes : labels.no),
    row.daypartKey ? textCell(ref(8), row.daypartKey) : null,
  ]);
}

function sheetXml(model: MenuModel, labels: ExportLabels): string {
  const rows: string[] = [headerRow(labels)];
  let rowNumber = 1;
  for (const group of flattenMenu(model)) {
    for (const row of group.rows) {
      rowNumber += 1;
      rows.push(itemRow(rowNumber, row, labels));
    }
  }
  // Child order inside <worksheet> is schema-fixed: dimension, sheetViews,
  // cols, sheetData — out-of-order children trigger the repair prompt.
  return (
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:I${rowNumber}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    "<cols>" +
    [22, 16, 32, 60, 16, 12, 40, 10, 12]
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join("") +
    "</cols>" +
    "<sheetData>\n" +
    rows.join("") +
    "</sheetData></worksheet>"
  );
}

const CONTENT_TYPES =
  XML_HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS =
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

function workbookXml(sheetName: string): string {
  const name = escapeXml(sheetName.replace(/[[\]:*?/\\]/g, "").slice(0, 31) || "Meni");
  return (
    XML_HEAD +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
    "</workbook>"
  );
}

const WORKBOOK_RELS =
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

// cellXfs: 0 normal, 1 bold (header), 2 numeric `#,##0` (built-in numFmtId 3).
const STYLES =
  XML_HEAD +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

export const XLSX_PART_NAMES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/styles.xml",
  "xl/worksheets/sheet1.xml",
] as const;

export type MenuXlsxInput = {
  stamp: ExportStamp;
  model: MenuModel;
  labels: ExportLabels;
};

export function buildMenuXlsx(input: MenuXlsxInput): Uint8Array {
  assertExportSize(input.model);
  const parts: Array<[string, string]> = [
    [XLSX_PART_NAMES[0], CONTENT_TYPES],
    [XLSX_PART_NAMES[1], ROOT_RELS],
    [XLSX_PART_NAMES[2], workbookXml(input.labels.sheetName)],
    [XLSX_PART_NAMES[3], WORKBOOK_RELS],
    [XLSX_PART_NAMES[4], STYLES],
    [XLSX_PART_NAMES[5], sheetXml(input.model, input.labels)],
  ];
  const s = input.stamp;
  const { dosDate, dosTime } = dosDateTime(s.year, s.month, s.day, s.hour, s.minute, s.second);

  const records: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;
  for (const [name, xml] of parts) {
    const data = encoder.encode(xml);
    const entry = { name, crc: crc32(data), size: data.length, dosDate, dosTime };
    const record = localFileRecord(entry, data);
    entries.push({ ...entry, offset });
    records.push(record);
    offset += record.length;
  }
  records.push(centralDirectory(entries, offset));
  return concatBytes(records);
}
