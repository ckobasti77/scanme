// Izlog fixtures of Tim i pristupi (K28): an invented team of "Demo restoran".
// Addresses are example.com; the waiter-panel link is invented. No PIN is
// ever part of a fixture (a row only knows whether a PIN is set).

import type { TimAktivnost, TimClan, TimNalogClan, TimOsoba, TimPodaci, TimZona } from "../panel/tim/model";
import { IZLOG_SADA } from "./lokal";

const DAN = 24 * 60 * 60 * 1000;
const MINUT = 60 * 1000;

export const TIM_ZONE: TimZona[] = [
  { id: "zona_sala", name: "Sala" },
  { id: "zona_terasa", name: "Terasa" },
];

/** `ja`: whose panel the izlog shows (the own row says "Vi"); a ScanMe admin has no own row. */
export function fixtureTimNalog(ja: "owner" | "manager" | "other" = "owner"): TimNalogClan[] {
  return [
    { key: "nalog_ana", name: "Ana Petrović", email: "ana@example.com", role: "owner", isSelf: ja === "owner" },
    { key: "nalog_milos", name: "Miloš Jovanović", email: "milos@example.com", role: "manager", isSelf: ja === "manager" },
  ];
}

export function fixtureTimClanovi(): TimClan[] {
  return [
    {
      id: "clan_jelena",
      email: "jelena@example.com",
      name: "Jelena Ilić",
      role: "manager",
      status: "active",
      inviteExpiresAt: null,
      isSelf: false,
    },
    {
      id: "clan_marko",
      email: "marko@example.com",
      name: null,
      role: "editor",
      status: "invited",
      inviteExpiresAt: IZLOG_SADA + 5 * DAN,
      isSelf: false,
    },
    {
      id: "clan_vesna",
      email: "vesna@example.com",
      name: null,
      role: "editor",
      status: "invited",
      inviteExpiresAt: IZLOG_SADA - 2 * DAN,
      isSelf: false,
    },
  ];
}

export function fixtureTimOsoblje(bezZona: boolean): TimOsoba[] {
  return [
    { id: "osoba_milan", displayName: "Milan", panelRole: "staff", active: true, hasPin: true, activeZoneId: bezZona ? null : "zona_sala" },
    { id: "osoba_jovana", displayName: "Jovana", panelRole: "manager", active: true, hasPin: true, activeZoneId: bezZona ? null : "zona_terasa" },
    { id: "osoba_nikola", displayName: "Nikola P.", panelRole: "staff", active: true, hasPin: false, activeZoneId: null },
    { id: "osoba_sara", displayName: "Sara", panelRole: "staff", active: false, hasPin: false, activeZoneId: null },
  ];
}

export function fixtureTimAktivnost(): TimAktivnost[] {
  const red = (id: string, action: string, minuta: number, actor: TimAktivnost["actor"], subject: string | null = null): TimAktivnost => ({
    id,
    action,
    createdAt: IZLOG_SADA - minuta * MINUT,
    actor,
    subject,
  });
  return [
    red("a1", "staff.pin_set", 12, { kind: "user", name: "Ana Petrović" }, "Nikola P."),
    red("a2", "team.invited", 45, { kind: "user", name: "Ana Petrović" }),
    red("a3", "version.published", 180, { kind: "user", name: "Jelena Ilić" }),
    red("a4", "staff.zone_assigned", 300, { kind: "staff", name: "Jovana" }, "Milan"),
    red("a5", "panel.code_rotated", 2 * 24 * 60, { kind: "user", name: "Miloš Jovanović" }),
    red("a6", "service.provisioned", 20 * 24 * 60, { kind: "scanme" }),
  ];
}

export const TIM_LINK_PUTANJA = "/demo-restoran/konobar/k7m2x9";

export function fixtureTimPodaci({
  bezZona,
  bezLinka = false,
  ja = "owner",
}: {
  bezZona: boolean;
  bezLinka?: boolean;
  ja?: "owner" | "manager" | "other";
}): TimPodaci {
  return {
    clanovi: { account: fixtureTimNalog(ja), members: fixtureTimClanovi() },
    osoblje: fixtureTimOsoblje(bezZona),
    zone: bezZona ? [] : TIM_ZONE,
    link: bezLinka ? null : { path: TIM_LINK_PUTANJA, url: `https://scanme.rs${TIM_LINK_PUTANJA}` },
    aktivnost: fixtureTimAktivnost(),
  };
}
