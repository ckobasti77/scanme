"use client";

// ScanMe Menu V1 (K28) — Tim i pristupi in the izlog: the real screen over the
// invented team of "Demo restoran" and an in-memory store, so every dialog
// and action can be tried without Convex. `modal=pozivnica|pin|link-panela`
// opens a dialog; `stanje=bez-zona` is a venue without zones.

import { useMemo, useState } from "react";
import { fixtureTimPodaci, TIM_LINK_PUTANJA } from "@/components/menu/fixtures/tim";
import { IZLOG_SADA } from "@/components/menu/fixtures";
import { MENU_INVITE_TTL_MS } from "@/lib/menu/invite";
import type { PanelModal } from "@/lib/menu/izlog-params";
import type { MenuActor } from "@/lib/menu/permissions";
import { Tim } from "../panel/tim/tim";
import type { TimPodaci, TimRadnje } from "../panel/tim/model";

const OK = { ok: true as const };
/** An invented link; a real invitation carries a 256-bit token (convex/menuTeam.ts). */
const PRIMER_POZIVNICE = "https://scanme.rs/demo-restoran/client-panel/meni/poziv/primer-pozivnice";
/** The PIN the izlog "picks"; invented, shown once in the dialog like the real one. */
const PRIMER_PINA = "472";

export function TimIzlog({
  actor,
  lokal,
  modal,
  bezZona,
}: {
  actor: MenuActor;
  lokal: string;
  modal: PanelModal | null;
  bezZona: boolean;
}) {
  const [podaci, setPodaci] = useState<TimPodaci>(() =>
    fixtureTimPodaci({ bezZona, ja: actor === "owner" ? "owner" : actor === "manager" ? "manager" : "other" }),
  );

  const radnje = useMemo<TimRadnje>(() => {
    const clanovi = (izmena: (podaci: TimPodaci) => TimPodaci) => setPodaci(izmena);
    const osoblje = (id: string, izmena: Partial<NonNullable<TimPodaci["osoblje"]>[number]>) =>
      setPodaci((p) => ({ ...p, osoblje: p.osoblje?.map((o) => (o.id === id ? { ...o, ...izmena } : o)) }));
    return {
      async pozovi(email, uloga) {
        clanovi((p) => ({
          ...p,
          clanovi: p.clanovi && {
            ...p.clanovi,
            members: [
              ...p.clanovi.members.filter((m) => m.email !== email),
              {
                id: `clan_${p.clanovi.members.length + 1}`,
                email,
                name: null,
                role: uloga,
                status: "invited",
                inviteExpiresAt: IZLOG_SADA + MENU_INVITE_TTL_MS,
                isSelf: false,
              },
            ],
          },
        }));
        return { ok: true, url: PRIMER_POZIVNICE, expiresAt: IZLOG_SADA + MENU_INVITE_TTL_MS };
      },
      async promeniUlogu(memberId, uloga) {
        clanovi((p) => ({
          ...p,
          clanovi: p.clanovi && {
            ...p.clanovi,
            members: p.clanovi.members.map((m) => (m.id === memberId ? { ...m, role: uloga } : m)),
          },
        }));
        return OK;
      },
      async ukloni(memberId) {
        clanovi((p) => ({
          ...p,
          clanovi: p.clanovi && { ...p.clanovi, members: p.clanovi.members.filter((m) => m.id !== memberId) },
        }));
        return OK;
      },
      async opozovi(memberId) {
        clanovi((p) => ({
          ...p,
          clanovi: p.clanovi && { ...p.clanovi, members: p.clanovi.members.filter((m) => m.id !== memberId) },
        }));
        return OK;
      },
      async dodajOsobu(ime, panelRole) {
        setPodaci((p) => ({
          ...p,
          osoblje: [
            ...(p.osoblje ?? []),
            { id: `osoba_${(p.osoblje ?? []).length + 1}`, displayName: ime, panelRole, active: true, hasPin: false, activeZoneId: null },
          ],
        }));
        return OK;
      },
      async preimenuj(staffId, ime) {
        osoblje(staffId, { displayName: ime });
        return OK;
      },
      async ulogaUPanelu(staffId, panelRole) {
        osoblje(staffId, { panelRole });
        return OK;
      },
      async deaktiviraj(staffId) {
        osoblje(staffId, { active: false, hasPin: false, activeZoneId: null });
        return OK;
      },
      async postaviPin(staffId, pin) {
        osoblje(staffId, { hasPin: true });
        return { ok: true, pin: pin ?? PRIMER_PINA, endedSessions: 0 };
      },
      async resetujPin(staffId) {
        osoblje(staffId, { hasPin: false });
        return OK;
      },
      async otkljucajPinove() {
        return { ok: true, unlocked: 1 };
      },
      async postaviZonu(staffId, zoneId) {
        osoblje(staffId, { activeZoneId: zoneId });
        return OK;
      },
      async napraviLink() {
        setPodaci((p) => ({ ...p, link: { path: TIM_LINK_PUTANJA, url: `https://scanme.rs${TIM_LINK_PUTANJA}` } }));
        return OK;
      },
      async promeniLink() {
        const putanja = "/demo-restoran/konobar/p4r8w3";
        setPodaci((p) => ({ ...p, link: { path: putanja, url: `https://scanme.rs${putanja}` } }));
        return { ok: true, endedSessions: 3 };
      },
    };
  }, []);

  return <Tim actor={actor} lokal={lokal} sada={IZLOG_SADA} podaci={podaci} radnje={radnje} pocetniModal={modal} />;
}
