// Admin UX A5 — the CSV template offered for download in the import guide:
// every supported column (headers the column detection recognises) and one
// TEST example row. `;` separated with a BOM, so a Serbian Excel opens it in
// columns with diacritics intact; the parser reads `,` and tabs as well.

export const IMPORT_TEMPLATE_FILE_NAME = "scanme-sajam-import-sablon.csv";

/** Header → TEST example value. Nothing real: TEST codes, names and prices. */
export const IMPORT_TEMPLATE_COLUMNS: readonly (readonly [string, string])[] = [
  ["Izlagač", "TEST Izlagač A"],
  ["SMK", "SMK-TEST-FAIR-A"],
  ["SML", "SML-TEST-FAIR-A"],
  ["Ključ učešća", ""],
  ["Email za izveštaje", ""],
  ["Kontakt email", ""],
  ["Brend", "TEST Volta"],
  ["Štand", "TEST-A1"],
  ["Naziv štanda", "TEST štand A1"],
  ["Lokacija na mapi", "test-loc-em-a1"],
  ["Model", "TEST Volta X3"],
  ["Varijanta", "TEST Long Range"],
  ["Ključ modela", ""],
  ["Slug", ""],
  ["Cena", "TEST cena"],
  ["Paket", "Starter"],
  ["Paket važi od", "9.10.2026. 09:00"],
  ["QR kod", ""],
  ["Fotografija", ""],
  ["Pasoš", "da"],
  ["Redosled", "1"],
  ["Spec: Snaga", "TEST 150 kW"],
  ["Spec: Domet", "TEST 400 km"],
  ["Spec 1 naziv", "TEST Pogon"],
  ["Spec 1 vrednost", "TEST zadnji"],
];

function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

export function buildImportTemplateCsv(): string {
  const line = (cells: readonly string[]) => cells.map(csvCell).join(";");
  return `﻿${line(IMPORT_TEMPLATE_COLUMNS.map(([header]) => header))}\r\n${line(IMPORT_TEMPLATE_COLUMNS.map(([, value]) => value))}\r\n`;
}
