import { describe, expect, test } from "vitest";
import { detectImportDelimiter, parseImportTable } from "./parse";

// Admin UX A5 — the hand-written TSV/CSV parser of the catalog import.

describe("fair import table parser (A5)", () => {
  test("a paste from Excel / Google Sheets is tab separated; cells are trimmed", () => {
    const table = parseImportTable("Izlagač\tBrend\tModel\nTEST Izlagač A\t TEST Volta \tTEST Volta X1\n");
    expect(table.delimiter).toBe("\t");
    expect(table.headers).toEqual(["Izlagač", "Brend", "Model"]);
    expect(table.rows).toEqual([{ line: 2, cells: ["TEST Izlagač A", "TEST Volta", "TEST Volta X1"] }]);
  });

  test("quoted cells keep the delimiter, tabs, doubled quotes and line breaks", () => {
    const tsv = "Model\tSpec: Oprema\tCena\nTEST X1\t\"TEST a\tb\"\t\"TEST \"\"cena\"\"\"\nTEST X2\t\"TEST red 1\r\nTEST red 2\"\tTEST\n";
    const table = parseImportTable(tsv);
    expect(table.rows.map((row) => row.cells)).toEqual([
      ["TEST X1", "TEST a\tb", "TEST \"cena\""],
      ["TEST X2", "TEST red 1\nTEST red 2", "TEST"],
    ]);
    // The row after a multi-line cell keeps its real line number.
    expect(parseImportTable(`${tsv}TEST X3\t\tTEST`).rows[2].line).toBe(5);
  });

  test("CSV: `;` from a Serbian Excel or `,`; the quoted delimiter does not count when detecting", () => {
    expect(detectImportDelimiter("Model;Cena;Paket\nX;1,5;Starter")).toBe(";");
    expect(detectImportDelimiter("Model,Cena\nX,\"1;5\"")).toBe(",");
    expect(detectImportDelimiter("\"Model;Varijanta\",Cena,Paket\n")).toBe(",");
    const table = parseImportTable("Model,Cena\n\"TEST X1, Premium\",\"TEST 1,5\"\n");
    expect(table.rows[0].cells).toEqual(["TEST X1, Premium", "TEST 1,5"]);
  });

  test("BOM, \\r\\n and empty rows (also rows of empty cells) are dropped; lines stay true", () => {
    const table = parseImportTable("﻿Model;Cena\r\n\r\nTEST X1;TEST\r\n;;\r\nTEST X2;\r\n\r\n");
    expect(table.headers).toEqual(["Model", "Cena"]);
    expect(table.rows).toEqual([
      { line: 3, cells: ["TEST X1", "TEST"] },
      { line: 5, cells: ["TEST X2", ""] },
    ]);
  });

  test("a wider spreadsheet selection: empty trailing headers and cells are not columns; short rows are padded", () => {
    const table = parseImportTable("Model\tCena\t\t\nTEST X1\t\t\t\nTEST X2\tTEST\t\t\n");
    expect(table.headers).toEqual(["Model", "Cena"]);
    expect(table.rows.map((row) => row.cells)).toEqual([["TEST X1", ""], ["TEST X2", "TEST"]]);
  });

  test("an unclosed quote is reported, empty text gives no columns", () => {
    expect(parseImportTable("Model\n\"TEST X1").unclosedQuote).toBe(true);
    expect(parseImportTable("  \n\n")).toEqual({ delimiter: ",", headers: [], rows: [], unclosedQuote: false });
  });
});
