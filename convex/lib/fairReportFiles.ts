import type { FairPackageTier, FairReportFormat } from "../../lib/fair-contract";
import { belgradeParts } from "../../lib/belgrade-time";
import { fmt } from "../../lib/i18n/format";
import { eventReportSr as dict } from "../../lib/i18n/sr/event-report";
import { centralDirectory, concatBytes, crc32, dosDateTime, localFileRecord, type ZipEntry } from "../../lib/memories-export/zip";
import { PDF_DIFFERENCES, encodeText, textWidth, wrapText } from "../../lib/menu-export/pdf";
import { escapeXml } from "../../lib/menu-export/xlsx";
import type { ExportStamp } from "../../lib/menu-export/rows";
import { FAIR_REPORT_MODELS_CAP, FAIR_REPORT_ROWS_CAP, type FairDailyDataset } from "./fairReportDataset";
import type { FairLeadActivity } from "./fairLeadActivity";

// =============================================================================
// Sajam automobila 2026 — B6 report files (MASTER §12, HANDOFF §5.6). Pure and
// runtime-agnostic (Uint8Array/TextEncoder only), so the build action, the
// admin download and the tests run it anywhere. No new dependency: the PDF
// text primitives come from lib/menu-export/pdf.ts, the XLSX zip parts from
// lib/memories-export/zip.ts (both imported, never modified).
//
// One neutral document model (title, meta lines, table sections) renders to
// CSV, XLSX and PDF, so the three formats always carry the same numbers. The
// visual template is PRIVREMENO (MASTER §12): a plain, readable layout.
// =============================================================================

export type FairReportCell = string | number | null;
export type FairReportSection = {
  heading: string;
  note?: string;
  columns: string[];
  rows: FairReportCell[][];
  /** Relative PDF column widths (default: first column 3, the rest 1). */
  weights?: number[];
};
export type FairReportDocument = { title: string; subtitle: string; meta: string[]; sections: FairReportSection[] };

const DASH = "—";

// -----------------------------------------------------------------------------
// Formatting (Belgrade wall clock; Serbian number style in human formats)
// -----------------------------------------------------------------------------

const two = (n: number) => String(n).padStart(2, "0");

export function fairReportStamp(at: number): ExportStamp {
  return belgradeParts(at);
}

export function fairReportDateText(at: number): string {
  const p = belgradeParts(at);
  return `${two(p.day)}.${two(p.month)}.${p.year}.`;
}

export function fairReportDateTimeText(at: number): string {
  const p = belgradeParts(at);
  return `${two(p.day)}.${two(p.month)}.${p.year}. ${two(p.hour)}:${two(p.minute)}`;
}

function dateKeyText(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}.`;
}

/** 1234 → "1.234", 4.25 → "4,25" (PDF only; CSV/XLSX keep plain numbers). */
export function fairReportNumberText(value: number): string {
  const negative = value < 0;
  const [whole, fraction] = Math.abs(value).toFixed(Number.isInteger(value) ? 0 : 2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

const cappedText = (count: { count: number; capped: boolean }) => (count.capped ? `${count.count}+` : count.count);

// -----------------------------------------------------------------------------
// Dataset → document
// -----------------------------------------------------------------------------

/** The exhibitor's daily report. Only groups present in the dataset appear. */
export function fairDailyReportDocument(dataset: FairDailyDataset): FairReportDocument {
  const models = dataset.models;
  const name = (model: FairDailyDataset["models"][number]) => (model.variant ? `${model.displayName} ${model.variant}` : model.displayName);
  const anyCapped = models.some(
    (model) => model.interest?.capped || model.testDrive?.capped || model.surveys?.some((survey) => survey.capped),
  );
  const meta = [
    fmt(dict.builtAtLine, { date: fairReportDateTimeText(dataset.builtAt) }),
    fmt(dict.windowLine, { from: fairReportDateTimeText(dataset.windowStart), to: fairReportDateTimeText(dataset.windowEnd) }),
    ...(models.some((model) => model.ratings || model.audience) ? [dict.provisionalNote] : []),
    ...(dataset.modelsTruncated ? [fmt(dict.truncatedNote, { count: FAIR_REPORT_MODELS_CAP })] : []),
    ...(anyCapped ? [fmt(dict.cappedNote, { count: FAIR_REPORT_ROWS_CAP })] : []),
  ];

  const sections: FairReportSection[] = [
    {
      heading: dict.standsHeading,
      note: dict.standsNote,
      columns: [dict.colStand, dict.colTotal, dict.colUnique],
      rows: dataset.stands.map((stand) => [`${stand.displayName} (${stand.code})`, stand.total, stand.unique]),
    },
  ];

  if (models.length) {
    const groups = {
      scans: models.some((model) => model.scans),
      interest: models.some((model) => model.interest),
      testDrive: models.some((model) => model.testDrive),
    };
    const columns: string[] = [dict.colModel, dict.colPackage];
    if (groups.scans) columns.push(dict.colTotal, dict.colUnique);
    if (groups.interest) columns.push(dict.colInterest);
    if (groups.testDrive) columns.push(dict.colTestDrive);
    sections.push({
      heading: dict.modelsHeading,
      ...(groups.scans ? {} : { note: dict.noModelAnalytics }),
      columns,
      weights: [3, 1.4, ...columns.slice(2).map(() => 1)],
      rows: models.map((model) => {
        const row: FairReportCell[] = [name(model), dict.tiers[model.tier]];
        if (groups.scans) row.push(model.scans?.total ?? DASH, model.scans?.unique ?? DASH);
        if (groups.interest) row.push(model.interest ? cappedText(model.interest) : DASH);
        if (groups.testDrive) row.push(model.testDrive ? cappedText(model.testDrive) : DASH);
        return row;
      }),
    });
  }

  if (dataset.hourly) {
    sections.push({
      heading: dict.hourlyHeading,
      columns: [dict.colHour, dict.colTotal, dict.colUnique],
      weights: [2, 1, 1],
      rows: dataset.hourly.map((hour) => [`${hour.hourKey.slice(11)}:00`, hour.total, hour.unique]),
    });
  }

  if (dataset.comparison) {
    sections.push({
      heading: fmt(dict.comparisonHeading, { date: dateKeyText(dataset.comparison.previousDateKey) }),
      columns: [dict.colMetric, dict.colToday, dict.colPrevious, dict.colChange],
      rows: dataset.comparison.rows.map((row) => [dict.comparisonMetrics[row.metric], row.current, row.previous, row.current - row.previous]),
    });
  }

  const ratingRows = models.flatMap((model) =>
    (model.ratings ?? []).map((rating): FairReportCell[] => [name(model), dict.ratingFields[rating.field], rating.count, rating.average ?? DASH]),
  );
  if (ratingRows.length) {
    sections.push({ heading: dict.ratingsHeading, columns: [dict.colModel, dict.colField, dict.colCount, dict.colAverage], weights: [3, 1.6, 1, 1], rows: ratingRows });
  }

  const audienceRows = models.flatMap((model) =>
    (model.audience ?? []).flatMap((question) => [
      [name(model), `${question.prompt} (${dict.questionStatus[question.status]})`, DASH, question.totalVotes] as FairReportCell[],
      ...question.options.map((option): FairReportCell[] => ["", "", option.label, option.count]),
    ]),
  );
  if (audienceRows.length) {
    sections.push({ heading: dict.audienceHeading, columns: [dict.colModel, dict.colQuestion, dict.colAnswer, dict.colVotes], weights: [2, 3, 2, 1], rows: audienceRows });
  }

  const surveyRows = models.flatMap((model) =>
    (model.surveys ?? []).flatMap((survey) => [
      [name(model), [fmt(dict.surveyVersion, { version: survey.version }), survey.title].filter(Boolean).join(" · "), DASH, survey.capped ? `${survey.responses}+` : survey.responses] as FairReportCell[],
      ...survey.questions.flatMap((question) =>
        question.answers.map((answer, index): FairReportCell[] => [
          "",
          index === 0 ? question.prompt : "",
          question.kind === "yes_no" ? (answer.value === "yes" ? dict.yes : dict.no) : answer.label ?? answer.value,
          answer.count,
        ]),
      ),
    ]),
  );
  if (surveyRows.length) {
    sections.push({ heading: dict.surveyHeading, columns: [dict.colModel, dict.colQuestion, dict.colAnswer, dict.colResponses], weights: [2, 3, 2, 1], rows: surveyRows });
  }

  const sponsoredRows = models.flatMap((model) => (model.sponsored ? [[name(model), model.sponsored.openModel, model.sponsored.garageAdd] as FairReportCell[]] : []));
  if (sponsoredRows.length) {
    sections.push({ heading: dict.sponsoredHeading, columns: [dict.colModel, dict.colOpenModel, dict.colGarageAdd], rows: sponsoredRows });
  }

  return {
    title: fmt(dict.reportTitle, { exhibitor: dataset.exhibitorName }),
    subtitle: fmt(dict.reportSubtitle, { event: dataset.eventTitle, day: dataset.dayLabel, date: dateKeyText(dataset.dateKey) }),
    meta,
    sections,
  };
}

export type FairOrganizerDay = { label: string; dateKey: string; total: number; unique: number; interest: number; testDrive: number };

/** Organizer aggregate: event-wide sums per day — no exhibitor split, no PII, no survey answers. */
export function fairOrganizerDocument(input: { eventTitle: string; builtAt: number; days: FairOrganizerDay[] }): FairReportDocument {
  return {
    title: fmt(dict.organizerTitle, { event: input.eventTitle }),
    subtitle: dict.organizerSubtitle,
    meta: [fmt(dict.builtAtLine, { date: fairReportDateTimeText(input.builtAt) })],
    sections: [
      {
        heading: dict.organizerHeading,
        note: dict.organizerNote,
        columns: [dict.colDay, dict.colDate, dict.colTotal, dict.colUnique, dict.colInterest, dict.colTestDrive],
        weights: [2, 1.4, 1, 1, 1, 1],
        rows: input.days.map((day) => [day.label, dateKeyText(day.dateKey), day.total, day.unique, day.interest, day.testDrive]),
      },
    ],
  };
}

/** Admin UX A8 — activity columns of the PII export (the passport is no package metric and is never exported). */
export const FAIR_LEAD_EXPORT_ACTIVITY = ["scans", "ratings", "audienceVotes", "surveyAnswers", "sponsoredActions"] as const;
export type FairLeadExportActivity = (typeof FAIR_LEAD_EXPORT_ACTIVITY)[number];

export type FairLeadExportRow = {
  createdAt: number;
  kind: "interest" | "test_drive";
  modelName: string;
  contactName: string;
  email?: string;
  phone?: string;
  consentVersion: number;
  consentedAt: number;
  /** A8 — package of the lead's model at the moment of the lead. */
  tier?: FairPackageTier;
  /** A8 — summary per activity group that this package sends to the exhibitor; a group the package lacks is absent. */
  activity?: Partial<Record<FairLeadExportActivity, string>>;
};

const RATING_FIELDS = ["overall", "appearance", "specifications", "price"] as const;

/**
 * Admin UX A8 — one cell of text per activity group that goes to the
 * exhibitor (`activity` holds only those groups). Empty group → "—", never 0;
 * a read cut at its cap ends with "…".
 */
export function fairLeadActivityCells(activity: FairLeadActivity, modelName: (eventModelId: string) => string): Partial<Record<FairLeadExportActivity, string>> {
  const cells: Partial<Record<FairLeadExportActivity, string>> = {};
  const cell = (group: FairLeadExportActivity, items: string[], capped: boolean) => {
    cells[group] = items.length ? `${items.join("; ")}${capped ? " …" : ""}` : DASH;
  };
  if (activity.scans?.shared) cell("scans", activity.scans.items.map((item) => fmt(dict.leadActivityScan, { model: modelName(item.eventModelId), count: item.count })), activity.scans.capped);
  if (activity.ratings?.shared) {
    cell("ratings", activity.ratings.items.map((item) => {
      const values = RATING_FIELDS.flatMap((field) => (item[field] !== undefined ? [`${dict.ratingFields[field]} ${item[field]}`] : []));
      return `${modelName(item.eventModelId)}: ${values.join(", ")}`;
    }), activity.ratings.capped);
  }
  if (activity.audienceVotes?.shared) {
    cell("audienceVotes", activity.audienceVotes.items.map((item) => `${modelName(item.eventModelId)} — ${item.prompt}: ${item.answer}`), activity.audienceVotes.capped);
  }
  if (activity.surveyAnswers?.shared) {
    cell("surveyAnswers", activity.surveyAnswers.items.map((item) => {
      const answers = item.answers.map((answer) => `${answer.prompt}: ${answer.kind === "yes_no" ? (answer.answer === "yes" ? dict.yes : answer.answer === "no" ? dict.no : answer.answer) : answer.answer}`);
      return `${modelName(item.eventModelId)} — ${answers.join(", ")}`;
    }), activity.surveyAnswers.capped);
  }
  if (activity.sponsoredActions?.shared) {
    cell("sponsoredActions", activity.sponsoredActions.items.map((item) => `${modelName(item.eventModelId)}: ${item.kind === "open_model" ? dict.colOpenModel : dict.colGarageAdd}`), activity.sponsoredActions.capped);
  }
  return cells;
}

/**
 * The SEPARATE PII artifact (MASTER §12): one exhibitor's leads, never mixed
 * into a report. A8: the package of each lead and, per package, the
 * visitor's activity on this exhibitor's models — a column appears only when
 * some lead's package has it; a lead whose package lacks it has an empty cell.
 */
export function fairLeadsDocument(input: { eventTitle: string; exhibitorName: string; builtAt: number; rows: FairLeadExportRow[] }): FairReportDocument {
  const withTier = input.rows.some((row) => row.tier !== undefined);
  const groups = FAIR_LEAD_EXPORT_ACTIVITY.filter((group) => input.rows.some((row) => row.activity?.[group] !== undefined));
  return {
    title: fmt(dict.leadsTitle, { exhibitor: input.exhibitorName }),
    subtitle: fmt(dict.leadsSubtitle, { event: input.eventTitle }),
    meta: [fmt(dict.builtAtLine, { date: fairReportDateTimeText(input.builtAt) }), ...(groups.length ? [dict.leadsActivityNote] : [])],
    sections: [
      {
        heading: dict.leadsHeading,
        columns: [
          dict.colCreatedAt, dict.colKind, dict.colModel, dict.colName, dict.colEmail, dict.colPhone, dict.colConsentVersion, dict.colConsentedAt,
          ...(withTier ? [dict.colPackage] : []),
          ...groups.map((group) => dict.leadActivityColumns[group]),
        ],
        rows: input.rows.map((row) => [
          fairReportDateTimeText(row.createdAt),
          dict.leadKinds[row.kind],
          row.modelName,
          row.contactName,
          row.email ?? "",
          row.phone ?? "",
          row.consentVersion,
          fairReportDateTimeText(row.consentedAt),
          ...(withTier ? [row.tier ? dict.tiers[row.tier] : ""] : []),
          ...groups.map((group) => row.activity?.[group] ?? ""),
        ]),
      },
    ],
  };
}

// -----------------------------------------------------------------------------
// CSV (RFC 4180, comma, CRLF, UTF-8 BOM so Excel reads the diacritics)
// -----------------------------------------------------------------------------

const encoder = new TextEncoder();

function csvCell(cell: FairReportCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return String(Math.round(cell * 100) / 100);
  // A cell typed by a visitor (e.g. a lead name) must never run as a formula.
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function renderFairReportCsv(doc: FairReportDocument): Uint8Array {
  const lines: string[] = [csvCell(doc.title), csvCell(doc.subtitle), ...doc.meta.map(csvCell)];
  for (const section of doc.sections) {
    lines.push("", csvCell(section.heading));
    if (section.note) lines.push(csvCell(section.note));
    lines.push(section.columns.map(csvCell).join(","));
    for (const row of section.rows) lines.push(row.map(csvCell).join(","));
  }
  return encoder.encode(`﻿${lines.join("\r\n")}\r\n`);
}

// -----------------------------------------------------------------------------
// XLSX (one sheet; sections stacked; STORE zip like lib/menu-export/xlsx.ts)
// -----------------------------------------------------------------------------

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// cellXfs: 0 normal, 1 bold, 2 integer `#,##0` (numFmtId 3), 3 decimal `0.00` (numFmtId 2).
const XLSX_STYLES =
  XML_HEAD +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

const XLSX_CONTENT_TYPES =
  XML_HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const XLSX_ROOT_RELS =
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const XLSX_WORKBOOK_RELS =
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

function xlsxCell(ref: string, cell: FairReportCell, bold = false): string {
  if (cell === null || cell === "") return "";
  if (typeof cell === "number") {
    return `<c r="${ref}" s="${Number.isInteger(cell) ? 2 : 3}"><v>${Math.round(cell * 100) / 100}</v></c>`;
  }
  const preserve = /^\s|\s$|\n/.test(cell) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}"${bold ? ' s="1"' : ""} t="inlineStr"><is><t${preserve}>${escapeXml(cell)}</t></is></c>`;
}

export function renderFairReportXlsx(doc: FairReportDocument, stamp: ExportStamp): Uint8Array {
  const rows: string[] = [];
  let maxColumns = 1;
  const push = (cells: FairReportCell[], bold = false) => {
    const number = rows.length + 1;
    maxColumns = Math.max(maxColumns, cells.length);
    rows.push(`<row r="${number}">${cells.map((cell, index) => xlsxCell(`${columnLetter(index)}${number}`, cell, bold)).join("")}</row>\n`);
  };
  push([doc.title], true);
  push([doc.subtitle]);
  for (const line of doc.meta) push([line]);
  for (const section of doc.sections) {
    push([]);
    push([section.heading], true);
    if (section.note) push([section.note]);
    push(section.columns, true);
    for (const row of section.rows) push(row);
  }
  const widths = Array.from({ length: maxColumns }, (_, index) => (index === 0 ? 42 : 20));
  const sheet =
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${columnLetter(maxColumns - 1)}${rows.length}"/>` +
    "<cols>" +
    widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("") +
    "</cols>" +
    "<sheetData>\n" +
    rows.join("") +
    "</sheetData></worksheet>";
  const sheetName = escapeXml(dict.sheetName.replace(/[[\]:*?/\\]/g, "").slice(0, 31));
  const workbook =
    XML_HEAD +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>` +
    "</workbook>";
  const parts: Array<[string, string]> = [
    ["[Content_Types].xml", XLSX_CONTENT_TYPES],
    ["_rels/.rels", XLSX_ROOT_RELS],
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", XLSX_WORKBOOK_RELS],
    ["xl/styles.xml", XLSX_STYLES],
    ["xl/worksheets/sheet1.xml", sheet],
  ];
  const { dosDate, dosTime } = dosDateTime(stamp.year, stamp.month, stamp.day, stamp.hour, stamp.minute, stamp.second);
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

// -----------------------------------------------------------------------------
// PDF (A4, standard Helvetica with the menu export's Serbian encoding)
// -----------------------------------------------------------------------------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 44;
const CONTENT_W = PAGE_W - 2 * MX;
const TOP_Y = PAGE_H - 52;
const BOTTOM = 60;
const FOOTER_Y = 32;
const CELL_SIZE = 8.5;
const CELL_LH = 11;
const ROW_GAP = 3;
const GREY = "0.45 g";
const BLACK = "0 g";
const n2 = (n: number) => n.toFixed(2);

function literal(binary: string): string {
  return "(" + binary.replace(/[\\()]/g, (m) => "\\" + m) + ")";
}

function textOp(face: "F1" | "F2", size: number, x: number, y: number, text: string) {
  return `BT /${face} ${size} Tf ${n2(x)} ${n2(y)} Td ${literal(encodeText(text))} Tj ET\n`;
}

function cellText(cell: FairReportCell): string {
  if (cell === null) return "";
  return typeof cell === "number" ? fairReportNumberText(cell) : cell;
}

class PdfPages {
  pages: string[] = [];
  content = "";
  y = TOP_Y;
  add(ops: string) {
    this.content += ops;
  }
  ensure(height: number) {
    if (this.y - height < BOTTOM && this.y < TOP_Y) {
      this.pages.push(this.content);
      this.content = "";
      this.y = TOP_Y;
    }
  }
  finish() {
    this.pages.push(this.content);
    return this.pages;
  }
}

function drawLines(pages: PdfPages, text: string, face: "F1" | "F2", size: number, lineHeight: number, grey = false) {
  for (const line of wrapText(text, face, size, CONTENT_W)) {
    pages.ensure(lineHeight);
    const op = textOp(face, size, MX, pages.y - size, line);
    pages.add(grey ? `${GREY}\n${op}${BLACK}\n` : op);
    pages.y -= lineHeight;
  }
}

function drawSection(pages: PdfPages, section: FairReportSection) {
  const weights = section.weights ?? section.columns.map((_, index) => (index === 0 ? 3 : 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map((weight) => (CONTENT_W * weight) / totalWeight);
  const xs = widths.map((_, index) => MX + widths.slice(0, index).reduce((sum, width) => sum + width, 0));
  const layout = (cells: FairReportCell[], face: "F1" | "F2") =>
    section.columns.map((_, index) => wrapText(cellText(cells[index] ?? null), face, CELL_SIZE, widths[index] - 6));
  const drawRow = (cells: FairReportCell[], face: "F1" | "F2") => {
    const lines = layout(cells, face);
    const height = Math.max(1, ...lines.map((cell) => cell.length)) * CELL_LH + ROW_GAP;
    pages.ensure(height);
    lines.forEach((cellLines, index) => {
      const numeric = typeof cells[index] === "number";
      cellLines.forEach((line, lineIndex) => {
        const y = pages.y - CELL_SIZE - lineIndex * CELL_LH;
        const x = numeric ? xs[index] + widths[index] - 6 - textWidth(line, face, CELL_SIZE) : xs[index];
        pages.add(textOp(face, CELL_SIZE, x, y, line));
      });
    });
    pages.y -= height;
    return height;
  };

  pages.ensure(16 + CELL_LH * 3);
  pages.y -= 10;
  drawLines(pages, section.heading, "F2", 11.5, 15);
  if (section.note) drawLines(pages, section.note, "F1", 8, 10.5, true);
  pages.y -= 2;
  drawRow(section.columns, "F2");
  pages.add(`0.5 w 0.75 G ${n2(MX)} ${n2(pages.y + ROW_GAP - 1)} m ${n2(MX + CONTENT_W)} ${n2(pages.y + ROW_GAP - 1)} l S 0 G\n`);
  for (const row of section.rows) drawRow(row, "F1");
}

function latin1Bytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

function utf16Hex(text: string): string {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

export function renderFairReportPdf(doc: FairReportDocument, stamp: ExportStamp): Uint8Array {
  const pages = new PdfPages();
  drawLines(pages, doc.title, "F2", 16, 20);
  drawLines(pages, doc.subtitle, "F1", 10, 13);
  for (const line of doc.meta) drawLines(pages, line, "F1", 8, 10.5, true);
  pages.y -= 4;
  pages.add(`0.5 w 0.7 G ${n2(MX)} ${n2(pages.y)} m ${n2(MX + CONTENT_W)} ${n2(pages.y)} l S 0 G\n`);
  pages.y -= 6;
  for (const section of doc.sections) drawSection(pages, section);
  const bodies = pages.finish();

  const contents = bodies.map((content, index) => {
    const footer = fmt(dict.pageOf, { page: index + 1, pages: bodies.length });
    const x = (PAGE_W - textWidth(footer, "F1", 8)) / 2;
    return `${content}${GREY}\n${textOp("F1", 8, x, FOOTER_Y, footer)}${BLACK}\n`;
  });
  const differences = PDF_DIFFERENCES.map(([code, glyph]) => `${code} /${glyph}`).join(" ");
  const creation = `D:${stamp.year}${two(stamp.month)}${two(stamp.day)}${two(stamp.hour)}${two(stamp.minute)}${two(stamp.second)}`;
  // Fixed object numbers: 1 Catalog, 2 Pages, 3 Encoding, 4/5 fonts, 6 Resources, 7 Info, then (Page, Contents) pairs.
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${contents.map((_, i) => `${8 + i * 2} 0 R`).join(" ")}] /Count ${contents.length} >>`,
    `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${differences}] >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding 3 0 R >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding 3 0 R >>`,
    `<< /Font << /F1 4 0 R /F2 5 0 R >> /ProcSet [/PDF /Text] >>`,
    `<< /Producer (ScanMe) /Title ${utf16Hex(doc.title)} /CreationDate (${creation}) >>`,
  ];
  for (const content of contents) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(PAGE_W)} ${n2(PAGE_H)}] /Resources 6 0 R /Contents ${objects.length + 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
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

// -----------------------------------------------------------------------------
// Format dispatch
// -----------------------------------------------------------------------------

export const FAIR_REPORT_MIME: Record<FairReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

export function renderFairReport(doc: FairReportDocument, format: FairReportFormat, stamp: ExportStamp): Uint8Array {
  if (format === "pdf") return renderFairReportPdf(doc, stamp);
  if (format === "xlsx") return renderFairReportXlsx(doc, stamp);
  return renderFairReportCsv(doc);
}

/** ASCII file name part: "TEST izlagač A" → "test-izlagac-a". */
export function fairReportFileSlug(value: string): string {
  const folded = value
    .replace(/[Đđ]/g, (ch) => (ch === "Đ" ? "D" : "d"))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return folded || "izvestaj";
}

export function fairDailyReportFileName(dataset: Pick<FairDailyDataset, "eventSlug" | "dateKey" | "exhibitorName">, format: FairReportFormat): string {
  return `presek-${fairReportFileSlug(dataset.eventSlug)}-${dataset.dateKey}-${fairReportFileSlug(dataset.exhibitorName)}.${format}`;
}
