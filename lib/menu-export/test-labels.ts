// Shared fixtures for the export writer tests (not a test file itself).
import type { ExportLabels, ExportStamp } from "./rows";

export const TEST_LABELS: ExportLabels = {
  subtitle: "Izvoz nacrta: 05.09.2026.",
  unavailable: "(nema više)",
  pageOf: "Strana {page} od {pages}",
  columns: {
    group: "Grupa",
    shape: "Oblik grupe",
    name: "Naziv",
    description: "Opis",
    productType: "Tip",
    price: "Cena (RSD)",
    variants: "Varijante",
    available: "Dostupno",
    daypart: "Daypart",
  },
  yes: "Da",
  no: "Ne",
  sheetName: "Meni",
};

export const TEST_STAMP: ExportStamp = {
  year: 2026,
  month: 9,
  day: 5,
  hour: 12,
  minute: 30,
  second: 0,
};
