"use client";

// ScanMe Menu V1 (K28) — the route side of Tim i pristupi (master §10.6; plan
// docs/meni/planovi/K24.md §4.6). Subscriptions: the team (convex/menuTeam.ts
// `list`), the staff (convex/menuStaff.ts `list`, `panelLink`), the zones
// (convex/menuFloor.ts `overview`) and the activity. Every mutation throws a
// ConvexError with a machine code; here it becomes a value for the screen's
// save cycle. The screen itself is presentational (tim.tsx).

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useMemo, useState, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { SacuvajIshod } from "../cuvanje";
import { usePanelKontekst } from "../ruta";
import type { TimPodaci, TimRadnje } from "./model";
import { Tim } from "./tim";

function kod(error: unknown): string {
  return error instanceof ConvexError && typeof error.data === "string" ? error.data : "mreza";
}

async function ishod(rad: () => Promise<unknown>): Promise<SacuvajIshod> {
  try {
    await rad();
    return { ok: true };
  } catch (error) {
    return { ok: false, code: kod(error) };
  }
}

const praznaPretplata = () => () => {};

function useOrigin(): string {
  return useSyncExternalStore(
    praznaPretplata,
    () => window.location.origin,
    () => "",
  );
}

export function TimRuta() {
  const { slug, actor, lokal, menuServiceId } = usePanelKontekst();
  const { isLoading } = useConvexAuth();
  const origin = useOrigin();
  const [sada] = useState(() => Date.now());
  const args = isLoading ? "skip" : { menuServiceId };
  const tim = useQuery(api.menuTeam.list, args);
  const osoblje = useQuery(api.menuStaff.list, args);
  const link = useQuery(api.menuStaff.panelLink, args);
  const aktivnost = useQuery(api.menuTeam.activity, args);
  const sala = useQuery(api.menuFloor.overview, isLoading ? "skip" : { slug });

  const pozovi = useMutation(api.menuTeam.invite);
  const promeniUlogu = useMutation(api.menuTeam.changeRole);
  const ukloni = useMutation(api.menuTeam.remove);
  const opozovi = useMutation(api.menuTeam.revokeInvite);
  const dodajOsobu = useMutation(api.menuStaff.create);
  const preimenuj = useMutation(api.menuStaff.rename);
  const ulogaUPanelu = useMutation(api.menuStaff.setPanelRole);
  const deaktiviraj = useMutation(api.menuStaff.deactivate);
  const postaviPin = useMutation(api.menuStaff.setPin);
  const resetujPin = useMutation(api.menuStaff.resetPin);
  const otkljucaj = useMutation(api.menuStaff.unlockPins);
  const postaviZonu = useMutation(api.menuStaff.setZone);
  const napraviLink = useMutation(api.menuStaff.ensurePanelCode);
  const promeniLink = useMutation(api.menuStaff.rotatePanelCode);

  const radnje = useMemo<TimRadnje>(
    () => ({
      async pozovi(email, uloga) {
        try {
          const odgovor = await pozovi({ menuServiceId, email, role: uloga });
          return { ok: true, url: `${origin}${odgovor.path}`, expiresAt: odgovor.expiresAt };
        } catch (error) {
          return { ok: false, code: kod(error) };
        }
      },
      promeniUlogu: (memberId, uloga) =>
        ishod(() => promeniUlogu({ memberId: memberId as Id<"menuMembers">, role: uloga })),
      ukloni: (memberId) => ishod(() => ukloni({ memberId: memberId as Id<"menuMembers"> })),
      opozovi: (memberId) => ishod(() => opozovi({ memberId: memberId as Id<"menuMembers"> })),
      dodajOsobu: (ime, panelRole) => ishod(() => dodajOsobu({ menuServiceId, displayName: ime, panelRole })),
      preimenuj: (staffId, ime) => ishod(() => preimenuj({ staffId: staffId as Id<"menuStaff">, displayName: ime })),
      ulogaUPanelu: (staffId, panelRole) =>
        ishod(() => ulogaUPanelu({ staffId: staffId as Id<"menuStaff">, panelRole })),
      deaktiviraj: (staffId) => ishod(() => deaktiviraj({ staffId: staffId as Id<"menuStaff"> })),
      async postaviPin(staffId, pin) {
        try {
          const odgovor = await postaviPin({ staffId: staffId as Id<"menuStaff">, ...(pin === undefined ? {} : { pin }) });
          return { ok: true, pin: odgovor.pin, endedSessions: odgovor.endedSessions };
        } catch (error) {
          return { ok: false, code: kod(error) };
        }
      },
      resetujPin: (staffId) => ishod(() => resetujPin({ staffId: staffId as Id<"menuStaff"> })),
      async otkljucajPinove() {
        try {
          const odgovor = await otkljucaj({ menuServiceId });
          return { ok: true, unlocked: odgovor.unlocked };
        } catch (error) {
          return { ok: false, code: kod(error) };
        }
      },
      postaviZonu: (staffId, zoneId) =>
        ishod(() => postaviZonu({ staffId: staffId as Id<"menuStaff">, zoneId: zoneId as Id<"menuZones"> | null })),
      napraviLink: () => ishod(() => napraviLink({ menuServiceId })),
      async promeniLink() {
        try {
          const odgovor = await promeniLink({ menuServiceId });
          return { ok: true, endedSessions: odgovor.endedSessions };
        } catch (error) {
          return { ok: false, code: kod(error) };
        }
      },
    }),
    [
      menuServiceId,
      origin,
      pozovi,
      promeniUlogu,
      ukloni,
      opozovi,
      dodajOsobu,
      preimenuj,
      ulogaUPanelu,
      deaktiviraj,
      postaviPin,
      resetujPin,
      otkljucaj,
      postaviZonu,
      napraviLink,
      promeniLink,
    ],
  );

  // A refused query answers null; the screen shows its loading/empty states for undefined and empty lists.
  const podaci: TimPodaci = {
    clanovi: tim === null ? { account: [], members: [] } : tim,
    osoblje: osoblje === null ? [] : osoblje,
    zone: sala?.zones.map((zona) => ({ id: zona.id, name: zona.name })) ?? [],
    link: link === undefined ? undefined : link === null ? null : { path: link.path, url: `${origin}${link.path}` },
    aktivnost: aktivnost === null ? [] : aktivnost,
  };

  return <Tim actor={actor} lokal={lokal} sada={sada} podaci={podaci} radnje={radnje} />;
}
