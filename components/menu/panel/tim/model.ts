// ScanMe Menu V1 (K28) — the data and actions of Tim i pristupi (plan
// docs/meni/planovi/K24.md §4.6). The screen is presentational: the route
// (tim-ruta.tsx) fills these from convex/menuTeam.ts, convex/menuStaff.ts and
// convex/menuFloor.ts; the izlog fills them from fixtures over an in-memory
// store. Every action answers with a value; a thrown error is a lost connection.

import type { MenuActor, MenuRole } from "@/lib/menu/permissions";
import type { SacuvajIshod } from "../cuvanje";

export type TimNalogClan = {
  key: string;
  name: string | null;
  email: string | null;
  role: "owner" | "manager";
  isSelf: boolean;
};

export type TimClan = {
  id: string;
  email: string;
  name: string | null;
  role: MenuRole;
  status: "invited" | "active";
  inviteExpiresAt: number | null;
  isSelf: boolean;
};

export type TimOsoba = {
  id: string;
  displayName: string;
  panelRole: "staff" | "manager";
  active: boolean;
  /** Only whether a PIN is set — the PIN itself is never readable. */
  hasPin: boolean;
  activeZoneId: string | null;
};

export type TimZona = { id: string; name: string };

export type TimAktivnost = {
  id: string;
  action: string;
  createdAt: number;
  actor:
    | { kind: "user"; name: string | null }
    | { kind: "staff"; name: string | null }
    | { kind: "scanme" }
    | { kind: "guest" }
    | { kind: "system" };
  subject: string | null;
};

export type TimLink = { path: string; url: string } | null;

export type TimPodaci = {
  /** undefined while loading. */
  clanovi: { account: TimNalogClan[]; members: TimClan[] } | undefined;
  osoblje: TimOsoba[] | undefined;
  /** Active zones; an empty list hides every zone control (`stanje=bez-zona`). */
  zone: TimZona[];
  /** undefined while loading, null before the link exists. */
  link: TimLink | undefined;
  aktivnost: TimAktivnost[] | undefined;
};

export type TimRadnje = {
  pozovi(email: string, uloga: MenuRole): Promise<{ ok: true; url: string; expiresAt: number } | { ok: false; code: string }>;
  promeniUlogu(memberId: string, uloga: MenuRole): Promise<SacuvajIshod>;
  ukloni(memberId: string): Promise<SacuvajIshod>;
  opozovi(memberId: string): Promise<SacuvajIshod>;
  dodajOsobu(ime: string, panelRole: "staff" | "manager"): Promise<SacuvajIshod>;
  preimenuj(staffId: string, ime: string): Promise<SacuvajIshod>;
  ulogaUPanelu(staffId: string, panelRole: "staff" | "manager"): Promise<SacuvajIshod>;
  deaktiviraj(staffId: string): Promise<SacuvajIshod>;
  /** `pin` undefined = the system picks a free PIN. The PIN comes back ONCE, here. */
  postaviPin(staffId: string, pin?: string): Promise<{ ok: true; pin: string; endedSessions: number } | { ok: false; code: string }>;
  resetujPin(staffId: string): Promise<SacuvajIshod>;
  otkljucajPinove(): Promise<{ ok: true; unlocked: number } | { ok: false; code: string }>;
  postaviZonu(staffId: string, zoneId: string | null): Promise<SacuvajIshod>;
  napraviLink(): Promise<SacuvajIshod>;
  promeniLink(): Promise<{ ok: true; endedSessions: number } | { ok: false; code: string }>;
};

/** The izlog opens one dialog right away (`modal=pozivnica|pin|link-panela`). */
export type TimModal = "pozivnica" | "pin" | "link-panela";

export type TimProps = {
  actor: MenuActor;
  /** The venue name (for dialogs). */
  lokal: string;
  /** "Now" for invitation terms; the route passes Date.now() at render, the izlog a fixed time. */
  sada: number;
  podaci: TimPodaci;
  radnje: TimRadnje;
  pocetniModal?: TimModal | null;
};
