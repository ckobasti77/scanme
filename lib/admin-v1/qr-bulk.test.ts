import { describe, expect, test } from "vitest";
import { FAIR_QR_BULK_MAX_ROWS } from "@/lib/fair-contract";
import { parseQrBulkText } from "./qr-bulk";

// Admin UX A4 — two pasted columns (code, model) from Excel, Google Sheets or
// a CSV file: delimiter, quotes, BOM, \r\n, header row, wrong rows, the row cap.

describe("parseQrBulkText", () => {
  test("tab-separated rows from a spreadsheet, with a header and Windows line ends", () => {
    const parsed = parseQrBulkText("﻿Kod\tModel\r\nSMQ-TEST-0001\ttest-em26-volta-x1\r\n7KQ2M9XA\ttest-em26-volta-x2\r\n\r\n");
    expect(parsed).toEqual({
      rows: [{ line: 2, code: "SMQ-TEST-0001", model: "test-em26-volta-x1" }, { line: 3, code: "7KQ2M9XA", model: "test-em26-volta-x2" }],
      invalidLines: [],
      headerSkipped: true,
      tooMany: false,
    });
  });

  test("`;` from a Serbian Excel, `,` from a CSV file with quotes, and plain spaces", () => {
    expect(parseQrBulkText("SMQ-TEST-0001;test-a\nSMQ-TEST-0002;test-b").rows.map((row) => [row.code, row.model])).toEqual([["SMQ-TEST-0001", "test-a"], ["SMQ-TEST-0002", "test-b"]]);
    expect(parseQrBulkText("\"SMQ-TEST-0001\",\"test, a\"\n\"7KQ2\"\"X\",test-b").rows.map((row) => [row.code, row.model])).toEqual([["SMQ-TEST-0001", "test, a"], ["7KQ2\"X", "test-b"]]);
    expect(parseQrBulkText("SMQ-TEST-0001   test-a\n 7KQ2M9XA test-b ").rows.map((row) => [row.code, row.model])).toEqual([["SMQ-TEST-0001", "test-a"], ["7KQ2M9XA", "test-b"]]);
  });

  test("a data first row is not a header; rows without two columns are reported by line", () => {
    const parsed = parseQrBulkText("SMQ-TEST-0001\ttest-a\nsamo-jedna-kolona\n\t\ttest-c\nSMQ-TEST-0003\ttest-c\t\t\nSMQ-TEST-0004\ttest-d\tvisak");
    expect(parsed.headerSkipped).toBe(false);
    expect(parsed.rows.map((row) => row.line)).toEqual([1, 4]);
    expect(parsed.invalidLines).toEqual([2, 3, 5]);
  });

  test("more rows than one bulk commit allows are flagged", () => {
    const text = Array.from({ length: FAIR_QR_BULK_MAX_ROWS + 1 }, (_, index) => `SMQ-TEST-${index}\ttest-${index}`).join("\n");
    expect(parseQrBulkText(text).tooMany).toBe(true);
    expect(parseQrBulkText("").rows).toEqual([]);
  });
});
