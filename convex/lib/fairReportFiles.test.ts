// Sajam 2026 B6 — report files: one neutral document rendered to CSV, XLSX
// and PDF without any new dependency (MASTER §12; template is PRIVREMENO).

import { describe, expect, test } from "vitest";
import type { Id, TableNames } from "../_generated/dataModel";
import { eventReportSr } from "../../lib/i18n/sr/event-report";
import type { FairDailyDataset } from "./fairReportDataset";
import {
  fairDailyReportDocument,
  fairDailyReportFileName,
  fairLeadsDocument,
  fairOrganizerDocument,
  fairReportNumberText,
  fairReportStamp,
  renderFairReport,
  renderFairReportCsv,
} from "./fairReportFiles";

const id = <T extends TableNames>(value: string) => value as Id<T>;
const decoder = new TextDecoder();
const BUILT = Date.parse("2026-10-10T00:10:00+02:00");

const dataset: FairDailyDataset = {
  version: 1,
  eventId: id("event-1"),
  eventTitle: "TEST elektromobilnost",
  eventSlug: "test-elektromobilnost-2026",
  eventDayId: id("day-1"),
  dateKey: "2026-10-09",
  dayLabel: "TEST dan 1",
  participationId: id("participation-a"),
  exhibitorName: "TEST izlagač Đurđević",
  windowStart: Date.parse("2026-10-09T00:00:00+02:00"),
  windowEnd: Date.parse("2026-10-10T00:00:00+02:00"),
  builtAt: BUILT,
  stands: [{ standId: id("stand-a"), code: "TEST-A", displayName: "TEST štand A", total: 1234, unique: 56 }],
  models: [
    { eventModelId: id("m0"), displayName: "TEST Volta X0", standId: id("stand-a"), tier: "included", metrics: ["stand_scans"] },
    {
      eventModelId: id("m1"), displayName: "TEST Volta X1", variant: "Č", standId: id("stand-a"), tier: "starter",
      metrics: ["stand_scans", "model_scans", "hourly_scans", "day_comparison", "interest", "rating_overall", "audience"],
      scans: { total: 10, unique: 4 }, interest: { count: 1000, capped: true }, ratings: [{ field: "overall", count: 3, average: 4.33 }],
      audience: [{ questionId: id("q1"), prompt: "TEST pitanje?", status: "published", totalVotes: 6, options: [{ optionId: "o1", label: "Da", count: 4 }, { optionId: "o2", label: "Ne", count: 2 }] }],
    },
  ],
  modelsTruncated: false,
  hourly: [{ hourKey: "2026-10-09T10", total: 10, unique: 4 }],
};

describe("document", () => {
  test("only groups present in the dataset appear; a model without a group shows a dash, never 0", () => {
    const doc = fairDailyReportDocument(dataset);
    const headings = doc.sections.map((section) => section.heading);
    expect(headings).toEqual([eventReportSr.standsHeading, eventReportSr.modelsHeading, eventReportSr.hourlyHeading, eventReportSr.ratingsHeading, eventReportSr.audienceHeading]);
    expect(headings).not.toContain(eventReportSr.surveyHeading);
    expect(headings).not.toContain(eventReportSr.sponsoredHeading);
    const models = doc.sections[1];
    expect(models.columns).toEqual([eventReportSr.colModel, eventReportSr.colPackage, eventReportSr.colTotal, eventReportSr.colUnique, eventReportSr.colInterest]);
    expect(models.columns).not.toContain(eventReportSr.colTestDrive);
    expect(models.rows[0]).toEqual(["TEST Volta X0", eventReportSr.tiers.included, "—", "—", "—"]);
    expect(models.rows[1]).toEqual(["TEST Volta X1 Č", eventReportSr.tiers.starter, 10, 4, "1000+"]);
    expect(doc.meta.some((line) => line.includes("1000"))).toBe(true);
  });

  test("numbers in human formats use Serbian separators", () => {
    expect(fairReportNumberText(1234)).toBe("1.234");
    expect(fairReportNumberText(4.333)).toBe("4,33");
    expect(fairReportNumberText(-3)).toBe("-3");
  });

  test("file names are ASCII slugs of event, day and exhibitor", () => {
    expect(fairDailyReportFileName(dataset, "pdf")).toBe("presek-test-elektromobilnost-2026-2026-10-09-test-izlagac-durdevic.pdf");
  });
});

describe("renderers", () => {
  test("CSV: UTF-8 BOM, CRLF, quoted commas and no formula injection from visitor text", () => {
    const bytes = renderFairReportCsv(fairLeadsDocument({
      eventTitle: "TEST", exhibitorName: "TEST A", builtAt: BUILT,
      rows: [{ createdAt: BUILT, kind: "interest", modelName: "TEST, model", contactName: "=HYPERLINK(\"x\")", email: "a@example.invalid", consentVersion: 1, consentedAt: BUILT }],
    }));
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = decoder.decode(bytes);
    expect(csv).toContain("\r\n");
    expect(csv).toContain('"TEST, model"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  test("XLSX is a zip with the six OOXML parts", () => {
    const bytes = renderFairReport(fairDailyReportDocument(dataset), "xlsx", fairReportStamp(BUILT));
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = decoder.decode(bytes);
    for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) expect(text).toContain(part);
    expect(text).toContain("TEST Volta X1 Č");
  });

  test("PDF is a well-formed PDF 1.4 with an xref whose offsets point at objects", () => {
    const bytes = renderFairReport(fairDailyReportDocument(dataset), "pdf", fairReportStamp(BUILT));
    const text = String.fromCharCode(...bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    expect(offsets.length).toBeGreaterThan(7);
    offsets.forEach((offset, index) => expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`));
  });

  test("the organizer document has only day sums — no exhibitor, model or contact column", () => {
    const doc = fairOrganizerDocument({ eventTitle: "TEST", builtAt: BUILT, days: [{ label: "TEST dan 1", dateKey: "2026-10-09", total: 9, unique: 5, interest: 2, testDrive: 1 }] });
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].columns).not.toContain(eventReportSr.colModel);
    expect(doc.sections[0].columns).not.toContain(eventReportSr.colEmail);
    expect(doc.sections[0].rows).toEqual([["TEST dan 1", "09.10.2026.", 9, 5, 2, 1]]);
  });
});
