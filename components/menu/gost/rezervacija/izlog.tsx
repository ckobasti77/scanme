"use client";

// ScanMe Menu V1 (K25) — the reservation form in the izlog
// (/dev/menu-public-preview?rezervacija=forma|greska): the REAL form over an
// in-memory venue (./izlog-podaci.ts) instead of the Server Action and Convex.
// A client wrapper because the in-memory actions are functions, which a server
// component cannot pass down. Dev only; nothing is sent anywhere.

import { RezervacijaForma, type RezervacijaFormaProps } from "./forma";
import { IZLOG_AKCIJE } from "./izlog-podaci";

export function RezervacijaFormaIzlog(props: Omit<RezervacijaFormaProps, "akcije" | "satUzivo">) {
  return <RezervacijaForma {...props} akcije={IZLOG_AKCIJE} />;
}
