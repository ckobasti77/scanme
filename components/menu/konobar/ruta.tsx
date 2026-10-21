"use client";

// ScanMe Menu V1 (K22) — the live waiter panel: the ONLY place of the panel
// with Convex. Who works on this device comes from the PIN sign-in (the
// session route sets the HttpOnly cookie smk_s; the token is also handed to
// this component to carry its subscriptions) or from the Owner's/Manager's
// own account. Subscriptions are per venue, never per table (plan K19-17):
// `me`, the work queue (`activeRequests`), and the detail only while one is
// open. A sign-in that ended (12 h, logout elsewhere, PIN reset, a new panel
// link) makes `me` null and the PIN screen comes back.
//
// K23 adds, still per venue (plan K19-17): the static floor (`floor`), the
// occupancy only when the venue uses that module, and the cards of the open
// table only while a table is open (`positionDetail`).
//
// K25 adds the reservations (plan K24-13): ONE more subscription per device,
// `menuReservations.forPanel`, with `fromMs` from the device (the start of the
// current Belgrade hour minus 12 h, so the argument changes once an hour), and
// the detail only while a reservation is open (`menuReservations.detail`).
//
// K34: the device clock is moved to server time (`clockOffset`, measured once when
// the page loads and handed to the PIN screen and the panel through
// PomakSataKontekst), for the timers and for that reservations window.

import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clockOffset } from "@/lib/menu/elapsed-time";
import type { StaffSessionBody } from "@/lib/menu/http/staff-session";
import type { MenuRequestStatus } from "@/lib/menu/request-status";
import type { MenuReservationStatus } from "@/lib/menu/reservation-status";
import { useVeza } from "../gost/use-veza";
import { ObavestiGostaRuta } from "../odgovor/obavesti-gosta-ruta";
import type { KonobarIshod, KonobarRadnje, KonobarRezervacije, KonobarRezIshod, KonobarSalaIshod, PinIshod } from "./model";
import { KonobarPanel } from "./panel";
import { PinEkran } from "./pin/pin-ekran";
import { msDoSledecegSata, okvirOd } from "./rezervacije/okvir-vremena";
import { PomakSataKontekst } from "./use-sat";

export type KonobarRutaProps = {
  slug: string;
  panelCode: string;
  lokal: string;
  pinDostupan: boolean;
  /** The verified token of the smk_s cookie (null = not signed in on this device). */
  pocetniToken: string | null;
  pocetnoMs: number;
};

function sesijaPutanja(slug: string, panelCode: string) {
  return `/${slug}/konobar/${panelCode}/sesija`;
}

export function KonobarRuta(props: KonobarRutaProps) {
  // K34: how far this device's clock is from the server's, measured once, here, when the page loads (not in the
  // PIN screen or the panel, which can mount minutes later). `pocetnoMs` is the server's instant of this render.
  // The clocks below add it, so a device minutes off does not show new requests as late (or late ones as calm).
  const [pomak] = useState(() => clockOffset(props.pocetnoMs, Date.now()));
  return (
    <PomakSataKontekst.Provider value={pomak}>
      <KonobarRutaUnutra {...props} pomak={pomak} />
    </PomakSataKontekst.Provider>
  );
}

function KonobarRutaUnutra({
  slug,
  panelCode,
  lokal,
  pinDostupan,
  pocetniToken,
  pocetnoMs,
  pomak,
}: KonobarRutaProps & { pomak: number }) {
  const [token, setToken] = useState<string | null>(pocetniToken);
  const [nalogom, setNalogom] = useState(false);
  const [izabranId, setIzabranId] = useState<string | null>(null);
  const [mestoId, setMestoId] = useState<string | null>(null);
  const [rezervacijaId, setRezervacijaId] = useState<string | null>(null);
  const [odjavljuje, setOdjavljuje] = useState(false);
  const [bioPrijavljen, setBioPrijavljen] = useState(pocetniToken !== null);
  // K33: the sign-in happened on this page (PIN or account): the panel puts the focus on the queue's heading once.
  const [upravoPrijavljen, setUpravoPrijavljen] = useState(false);
  // The reservations' time window moves once an hour (the query never reads the clock).
  const [okvirMs, setOkvirMs] = useState(() => okvirOd(pocetnoMs));
  useEffect(() => {
    let tajmer: ReturnType<typeof setTimeout> | undefined;
    const pomeri = () => {
      // K34: server time (the window is compared with the server's reservation times), like `pocetnoMs` above.
      const sada = Date.now() + pomak;
      setOkvirMs(okvirOd(sada));
      tajmer = setTimeout(pomeri, msDoSledecegSata(sada) + 50);
    };
    tajmer = setTimeout(pomeri, 0);
    return () => {
      if (tajmer !== undefined) clearTimeout(tajmer);
    };
  }, [pomak]);

  const prijava = token !== null ? { slug, panelCode, sessionToken: token } : nalogom ? { slug, panelCode } : null;
  const me = useQuery(api.menuWaiter.me, prijava ?? "skip");
  const nalog = useQuery(api.menuWaiter.accountEntry, prijava ? "skip" : { slug, panelCode });
  const prijavljen = prijava !== null && me !== null && me !== undefined;
  const red = useQuery(api.menuWaiter.activeRequests, prijavljen && prijava ? prijava : "skip");
  const detalj = useQuery(
    api.menuWaiter.requestDetail,
    prijavljen && prijava && izabranId ? { ...prijava, requestId: izabranId as Id<"menuRequests"> } : "skip",
  );
  const sala = useQuery(api.menuWaiter.floor, prijavljen && prijava ? prijava : "skip");
  const zauzetost = useQuery(api.menuWaiter.occupancy, prijavljen && prijava && sala?.occupancyEnabled ? prijava : "skip");
  const detaljMesta = useQuery(
    api.menuWaiter.positionDetail,
    prijavljen && prijava && mestoId ? { ...prijava, positionId: mestoId as Id<"menuPositions"> } : "skip",
  );
  const rezervacijeSirovo = useQuery(api.menuReservations.forPanel, prijavljen && prijava ? { ...prijava, fromMs: okvirMs } : "skip");
  const detaljRezervacije = useQuery(
    api.menuReservations.detail,
    prijavljen && prijava && rezervacijaId ? { ...prijava, reservationId: rezervacijaId as Id<"menuReservations"> } : "skip",
  );
  // null while loading (no filter yet); an empty "off" venue when the server has nothing for this device.
  const rezervacije = useMemo<KonobarRezervacije | null>(
    () =>
      rezervacijeSirovo === undefined
        ? null
        : rezervacijeSirovo === null
          ? { rows: [], skraceno: false, mode: "off", holdMinutes: 15 }
          : {
              rows: rezervacijeSirovo.rows,
              skraceno: rezervacijeSirovo.truncated,
              mode: rezervacijeSirovo.mode,
              holdMinutes: rezervacijeSirovo.holdMinutes,
            },
    [rezervacijeSirovo],
  );

  const preuzmi = useMutation(api.menuWaiter.accept);
  const zavrsi = useMutation(api.menuWaiter.complete);
  const otkazi = useMutation(api.menuWaiter.cancel);
  const loginNalogom = useMutation(api.menuWaiter.loginWithAccount);
  const odjaviSesiju = useMutation(api.menuWaiter.logout);
  const zauzmi = useMutation(api.menuWaiter.setOccupancy);
  const mojaZona = useMutation(api.menuWaiter.setMyZone);
  const zonaOsoblja = useMutation(api.menuWaiter.setStaffZone);
  const vidiPodsetnik = useMutation(api.menuWaiter.seeNotice);
  const prihvatiRez = useMutation(api.menuReservations.accept);
  const odbijRez = useMutation(api.menuReservations.decline);
  const predloziRez = useMutation(api.menuReservations.proposeChange);
  const gostPrihvataRez = useMutation(api.menuReservations.acceptProposal);
  const otkaziRez = useMutation(api.menuReservations.cancelByStaff);
  const poveziRez = useMutation(api.menuReservations.bindPosition);
  const stigliRez = useMutation(api.menuReservations.markArrived);

  const naMrezi = useVeza();
  const konekcija = useConvexConnectionState();
  const veza = !naMrezi || (konekcija.hasEverConnected && !konekcija.isWebSocketConnected) ? "offline" : "online";

  async function prijaviPinom(pin: string): Promise<PinIshod> {
    let odgovor: Response;
    try {
      odgovor = await fetch(sesijaPutanja(slug, panelCode), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
        credentials: "same-origin",
      });
    } catch {
      return { ok: false, stanje: { kind: "veza" } };
    }
    const telo = (await odgovor.json().catch(() => null)) as StaffSessionBody | null;
    if (!telo) return { ok: false, stanje: { kind: "veza" } };
    if (telo.ok) {
      setNalogom(false);
      setIzabranId(null);
      setMestoId(null);
      setRezervacijaId(null);
      setToken(telo.sessionToken);
      setBioPrijavljen(true);
      setUpravoPrijavljen(true);
      return { ok: true };
    }
    switch (telo.code) {
      case "staff/wrong_pin":
        return { ok: false, stanje: { kind: "pogresan", attemptsLeft: telo.attemptsLeft ?? 0 } };
      case "staff/locked":
        return { ok: false, stanje: { kind: "blokada", lockedUntil: telo.lockedUntil ?? Date.now() + pomak } };
      case "staff/rate_limited":
        return { ok: false, stanje: { kind: "previse" } };
      case "staff/pin_unavailable":
        return { ok: false, stanje: { kind: "nedostupno" } };
      case "staff/panel_not_found":
        // The link changed meanwhile: the page answers 404 now.
        window.location.reload();
        return { ok: false, stanje: { kind: "veza" } };
      default:
        return { ok: false, stanje: { kind: "veza" } };
    }
  }

  async function udjiNalogom() {
    const ishod = await loginNalogom({ slug, panelCode });
    if (ishod.ok) {
      setToken(null);
      setNalogom(true);
      setUpravoPrijavljen(true);
    }
  }

  async function odjava() {
    if (nalogom && token === null) {
      setNalogom(false);
      setIzabranId(null);
      setMestoId(null);
      setRezervacijaId(null);
      return;
    }
    setOdjavljuje(true);
    try {
      // The route clears the HttpOnly cookie (and ends the session when the cookie is there).
      await fetch(sesijaPutanja(slug, panelCode), { method: "DELETE", credentials: "same-origin" });
    } catch {
      // The cookie then stays until it expires; the session below still ends.
    }
    // End the server session with the token this page holds too (idempotent), so a lost cookie
    // or a failed request never leaves the sign-in alive for 12 h.
    if (token) await odjaviSesiju({ slug, panelCode, sessionToken: token }).catch(() => undefined);
    setOdjavljuje(false);
    setToken(null);
    setIzabranId(null);
    setMestoId(null);
    setRezervacijaId(null);
    setBioPrijavljen(false);
  }

  const prijavaArgs = prijava ?? { slug, panelCode };
  const radnje: KonobarRadnje = {
    preuzmi: async (id) => (await preuzmi({ ...prijavaArgs, requestId: id as Id<"menuRequests"> })) as KonobarIshod,
    zavrsi: async (id) => (await zavrsi({ ...prijavaArgs, requestId: id as Id<"menuRequests"> })) as KonobarIshod,
    otkazi: async (id, ocekivaniStatus: MenuRequestStatus) =>
      (await otkazi({ ...prijavaArgs, requestId: id as Id<"menuRequests">, expectedStatus: ocekivaniStatus })) as KonobarIshod,
    odjava,
    // K27 — `U redu` on a reminder from Operativa (only the PIN waiter it was sent to can close it).
    zatvoriPodsetnik: async (id) => await vidiPodsetnik({ ...prijavaArgs, noticeId: id as Id<"menuStaffNotices"> }),
    postaviZauzetost: async (positionId, stanje) =>
      (await zauzmi({ ...prijavaArgs, positionId: positionId as Id<"menuPositions">, state: stanje })) as KonobarSalaIshod,
    postaviMojuZonu: async (zoneId) =>
      (await mojaZona({ ...prijavaArgs, zoneId: zoneId as Id<"menuZones"> | null })) as KonobarSalaIshod,
    postaviZonuOsoblja: async (staffId, zoneId) =>
      (await zonaOsoblja({
        ...prijavaArgs,
        staffId: staffId as Id<"menuStaff">,
        zoneId: zoneId as Id<"menuZones"> | null,
      })) as KonobarSalaIshod,
    // K25 — every reservation action carries the status the waiter saw; the server writes nothing when it moved.
    prihvatiRezervaciju: async (id, ocekivani) =>
      (await prihvatiRez({ ...prijavaArgs, reservationId: id as Id<"menuReservations">, expectedStatus: ocekivani })) as KonobarRezIshod,
    odbijRezervaciju: async (id, ocekivani) =>
      (await odbijRez({ ...prijavaArgs, reservationId: id as Id<"menuReservations">, expectedStatus: ocekivani })) as KonobarRezIshod,
    predloziIzmenu: async (id, proposedAt, poruka, ocekivani: MenuReservationStatus) =>
      (await predloziRez({
        ...prijavaArgs,
        reservationId: id as Id<"menuReservations">,
        expectedStatus: ocekivani,
        proposedAt,
        ...(poruka ? { proposalNote: poruka } : {}),
      })) as KonobarRezIshod,
    gostPrihvataPredlog: async (id, ocekivani) =>
      (await gostPrihvataRez({ ...prijavaArgs, reservationId: id as Id<"menuReservations">, expectedStatus: ocekivani })) as KonobarRezIshod,
    otkaziRezervaciju: async (id, ocekivani) =>
      (await otkaziRez({ ...prijavaArgs, reservationId: id as Id<"menuReservations">, expectedStatus: ocekivani })) as KonobarRezIshod,
    poveziSto: async (id, positionId, ocekivani) =>
      (await poveziRez({
        ...prijavaArgs,
        reservationId: id as Id<"menuReservations">,
        expectedStatus: ocekivani,
        positionId: positionId as Id<"menuPositions"> | null,
      })) as KonobarRezIshod,
    gostiStigli: async (id, positionId, ocekivani) =>
      (await stigliRez({
        ...prijavaArgs,
        reservationId: id as Id<"menuReservations">,
        expectedStatus: ocekivani,
        ...(positionId ? { positionId: positionId as Id<"menuPositions"> } : {}),
      })) as KonobarRezIshod,
  };

  if (!prijavljen || !me) {
    // While a known token is being checked, keep the PIN screen calm (no "expired" flash).
    const istekla = bioPrijavljen && prijava !== null && me === null;
    return (
      <PinEkran
        lokal={lokal}
        pinDostupan={pinDostupan}
        onPrijava={prijaviPinom}
        nalog={nalog ? { ime: nalog.displayName } : null}
        onNalog={() => void udjiNalogom()}
        istekla={istekla}
        pocetnoMs={pocetnoMs}
      />
    );
  }

  return (
    <KonobarPanel
      lokal={me.businessName}
      korisnik={{ kind: me.kind, displayName: me.displayName, expiresAt: me.expiresAt }}
      red={
        red === undefined
          ? undefined
          : red === null
            ? { zahtevi: [], skraceno: false, otkazani: [] }
            : { zahtevi: red.requests, skraceno: red.truncated, otkazani: red.recentlyCancelled, podsetnici: red.notices }
      }
      izabranId={izabranId}
      detalj={detalj}
      onIzaberi={setIzabranId}
      radnje={radnje}
      veza={veza}
      odjavljuje={odjavljuje}
      pocetnoMs={pocetnoMs}
      sala={sala ?? undefined}
      zauzetost={sala && !sala.occupancyEnabled ? { off: true } : (zauzetost ?? undefined)}
      izabranoMestoId={mestoId}
      onIzaberiMesto={setMestoId}
      detaljMesta={detaljMesta}
      rezervacije={rezervacije}
      izabranaRezervacijaId={rezervacijaId}
      onIzaberiRezervaciju={setRezervacijaId}
      detaljRezervacije={detaljRezervacije}
      fokusNaRed={upravoPrijavljen}
      odgovorGostu={(id, d) => (
        <ObavestiGostaRuta
          key={id}
          prijava={prijavaArgs}
          rezervacijaId={id}
          rezervacija={{
            status: d.reservation.status,
            guestName: d.reservation.guestName,
            partySize: d.reservation.partySize,
            requestedAt: d.reservation.requestedAt,
            proposedAt: d.reservation.proposedAt,
            proposalNote: d.reservation.proposalNote,
            contactEmail: d.reservation.contactEmail,
            contactPhone: d.reservation.contactPhone,
          }}
          offline={veza === "offline"}
        />
      )}
    />
  );
}
