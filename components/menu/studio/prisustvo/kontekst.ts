"use client";

// ScanMe Menu V1 — the people who have the OPEN article detail open as well
// (K18). The editor provides it around the detail, so every field's conflict
// (ProblemKljuca) and the detail's strip can name them without threading a
// prop through each group. Empty outside a detail.

import { createContext, useContext } from "react";

const PRAZNO: readonly string[] = [];

export const DrugiNaArtikluKontekst = createContext<readonly string[]>(PRAZNO);

export function useDrugiNaArtiklu(): readonly string[] {
  return useContext(DrugiNaArtikluKontekst);
}
