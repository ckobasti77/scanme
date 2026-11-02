"use client";

// ScanMe Menu V1 (K22) — the izlog of the waiter panel: the REAL PIN screen
// and the REAL panel over the invented "Demo restoran" (components/menu/
// fixtures/konobar.ts) and an in-memory store that applies the server's
// rules: the status table of lib/menu/request-status.ts (Preuzmi, Završi,
// Otkaži, "already taken") and the wrong-PIN rules of lib/menu/pin-policy.ts
// (five misses lock the device for 15 minutes). No Convex, no network. The
// clock starts at 18:27 (IZLOG_SADA) and then runs, so timers tick.
//
// K23: the floor of the same venue (fixtureSale) — Raspored / Tabela, the
// table detail, the own zone and the manager's re-assignment, the occupancy
// module (off unless `zauzetost=1`; with it, states are set by hand exactly
// as menuWaiter.setOccupancy does: refused when off, null = neutral), the
// venue's threshold (`kasni=1` = 5 min) and the device sound.
//
// K25: the reservations of the same venue (fixtureKonobarRezervacije: mode
// "form", hold 15 min) — the `Rezervacije` filter, the detail of a reservation
// (`ekran=rezervacije&rezervacija=rv_07`), the table with a bound, late
// reservation (`ekran=sto&rezervacija=1`: Sto 7), the guest's cancellation strip
// (`otkazana=1`). The actions change the rows in memory by the server's rules
// (lib/menu/reservation-status.ts): accept, decline, propose, the guest agrees,
// bind a table, arrive (with `zauzetost=1` the table becomes Zauzet), cancel.

import { useMemo, useState } from "react";
import {
  KONOBAR_IZLOG_MENADZER,
  KONOBAR_IZLOG_PIN,
  fixtureKonobar,
  fixtureKonobarRezervacije,
  fixtureSale,
  mestoPoNazivu,
  rezervacijeIstogStola,
  zonaPoNazivu,
} from "@/components/menu/fixtures/konobar";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { useVeza } from "@/components/menu/gost/use-veza";
import type {
  KonobarDetalj,
  KonobarIshod,
  KonobarKorisnik,
  KonobarPodsetnik,
  KonobarRadnje,
  KonobarRezIshod,
  KonobarRezervacije,
  KonobarRezervacijaDetalj,
  KonobarSala,
  KonobarSalaIshod,
  KonobarZahtev,
  KonobarZauzetost,
  PinIshod,
  PinStanje,
} from "@/components/menu/konobar/model";
import { KonobarPanel } from "@/components/menu/konobar/panel";
import { PinEkran } from "@/components/menu/konobar/pin/pin-ekran";
import { OdgovorIzlog } from "./odgovor-izlog";
import { primeniRezervaciju, type RezMemorija, type RezNaredba } from "@/components/menu/konobar/rezervacije/memorija";
import type { KonobarPreviewParams } from "@/lib/menu/izlog-params";
import {
  PIN_DEVICE_MAX_FAILURES,
  PIN_LOCK_MS,
  evaluateAttempt,
  registerFailure,
  registerSuccess,
  type PinCounter,
} from "@/lib/menu/pin-policy";
import { nextStatus, type MenuRequestStatus, type RequestAction } from "@/lib/menu/request-status";

const JA = "staff:ja";
/** K27 `ping=1`: the invented sender of the reminder and how long before the izlog clock it was sent. */
const PODSETNIK_OD = "Jelena";
const PODSETNIK_PRE_MS = 2 * 60_000;
const ODGOVOR_MS = 350;
const cekaj = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pocetniPin(stanje: KonobarPreviewParams["stanje"]): { brojac: PinCounter | null; stanje: PinStanje } {
  if (stanje === "blokada") {
    const lockedUntil = IZLOG_SADA + PIN_LOCK_MS - 60_000;
    return { brojac: { failures: 0, windowStartedAt: IZLOG_SADA, lockedUntil }, stanje: { kind: "blokada", lockedUntil } };
  }
  if (stanje === "pogresan-pin") {
    return {
      brojac: { failures: 2, windowStartedAt: IZLOG_SADA - 60_000 },
      stanje: { kind: "pogresan", attemptsLeft: PIN_DEVICE_MAX_FAILURES - 2 },
    };
  }
  return { brojac: null, stanje: { kind: "unos" } };
}

function refPreuzeo(zahtev: KonobarZahtev): string | null {
  if (!zahtev.acceptedBy) return null;
  return zahtev.acceptedBy.isMe ? JA : `staff:${zahtev.acceptedBy.name}`;
}

export function KonobarIzlog({ params }: { params: KonobarPreviewParams }) {
  const fx = useMemo(
    () =>
      fixtureKonobar({
        stanje: params.stanje === "prazno" || params.stanje === "mnogo" ? params.stanje : null,
        uloga: params.uloga,
      }),
    [params.stanje, params.uloga],
  );
  const pin = pocetniPin(params.stanje);
  const nalogom = params.uloga === "menadzer";
  const [prijavljen, setPrijavljen] = useState(params.ekran !== "pin" && params.stanje !== "bez-peppera");
  // K33: signed in on the PIN screen of this page (PIN or account): the panel puts the focus on the queue's heading once.
  const [poPrijavi, setPoPrijavi] = useState(false);
  const [korisnik, setKorisnik] = useState<KonobarKorisnik>(fx.korisnik);
  const [zahtevi, setZahtevi] = useState<KonobarZahtev[]>(fx.zahtevi);
  const [detalji, setDetalji] = useState<Record<string, KonobarDetalj>>(fx.detalji);
  const [izabranId, setIzabranId] = useState<string | null>(
    params.ekran === "detalj" ? (params.zahtev && fx.detalji[params.zahtev] ? params.zahtev : "rq_03") : null,
  );
  // K27 `ping=1`: one reminder for an order Milan has accepted (the first one of the fixture), sent 2 minutes ago.
  const [podsetnici, setPodsetnici] = useState<KonobarPodsetnik[]>(() => {
    const preuzet = params.podsetnik ? fx.zahtevi.find((zahtev) => zahtev.status === "accepted" && zahtev.acceptedBy?.isMe) : undefined;
    return preuzet
      ? [
          {
            id: "nt_01",
            requestId: preuzet.id,
            kind: preuzet.kind,
            positionLabel: preuzet.positionLabel,
            requestCreatedAt: preuzet.createdAt,
            createdAt: IZLOG_SADA - PODSETNIK_PRE_MS,
            from: PODSETNIK_OD,
          },
        ]
      : [];
  });
  const [brojac, setBrojac] = useState<PinCounter | null>(pin.brojac);
  const pocetnaSala = useMemo(
    () => fixtureSale({ zauzetost: params.zauzetost, kasniMin: params.kasni ? 5 : null, uloga: params.uloga, zona: params.zona }),
    [params.zauzetost, params.kasni, params.uloga, params.zona],
  );
  const [sala, setSala] = useState<KonobarSala>(pocetnaSala.sala);
  const [zauzetost, setZauzetost] = useState<KonobarZauzetost>(pocetnaSala.zauzetost);
  // `rezervacija=1` opens Sto 7, the table with the bound, late reservation rv_07.
  const [mestoId, setMestoId] = useState<string | null>(() =>
    params.ekran === "sto"
      ? (mestoPoNazivu(pocetnaSala.sala, params.sto ?? (params.rezervacija === "1" ? "Sto 7" : "Sto 3")) ?? mestoPoNazivu(pocetnaSala.sala, "Sto 3"))
      : null,
  );
  const rezFx = useMemo(
    () => fixtureKonobarRezervacije({ otkazana: params.otkazana, prazno: params.stanje === "prazno" }),
    [params.otkazana, params.stanje],
  );
  const [rezMem, setRezMem] = useState<RezMemorija>({ redovi: rezFx.rezervacije.rows, detalji: rezFx.detalji });
  const [rezId, setRezId] = useState<string | null>(
    params.ekran === "rezervacije" && params.rezervacija && rezFx.detalji[params.rezervacija] ? params.rezervacija : null,
  );
  const rezervacije = useMemo<KonobarRezervacije>(() => ({ ...rezFx.rezervacije, rows: rezMem.redovi }), [rezFx, rezMem.redovi]);
  // The izlog clock: 18:27 when the izlog opened, then real time.
  const [pomak] = useState(() => IZLOG_SADA - Date.now());
  const ime = korisnik.displayName;
  // `veza=offline` forces it; otherwise the browser's own state (so a lost connection and its recovery can be tried).
  const naMrezi = useVeza(params.offline);

  function primeni(id: string, akcija: RequestAction, ocekivani?: MenuRequestStatus): KonobarIshod {
    const zahtev = detalji[id]?.request;
    if (!zahtev) return { ok: false, code: "request/not_found" };
    if (ocekivani !== undefined && zahtev.status !== ocekivani) return { ok: false, code: "staff/status_changed", status: zahtev.status };
    const ishod = nextStatus({ status: zahtev.status, acceptedByRef: refPreuzeo(zahtev) }, akcija, { kind: "staff", ref: JA });
    if (ishod.kind === "refused") {
      return { ok: false, code: ishod.code, status: zahtev.status, takenBy: zahtev.acceptedBy?.name };
    }
    if (ishod.kind === "same") return { ok: true, status: zahtev.status, changed: false };
    const sada = Date.now() + pomak;
    const preuzet = ishod.to === "accepted" || ishod.alsoAccepted;
    const novi = {
      ...zahtev,
      status: ishod.to,
      acceptedAt: preuzet ? sada : zahtev.acceptedAt,
      acceptedBy: preuzet ? { name: ime, isMe: true } : zahtev.acceptedBy,
      doneAt: ishod.to === "done" ? sada : zahtev.doneAt,
      doneBy: ishod.to === "done" ? ime : zahtev.doneBy,
      cancelledAt: ishod.to === "cancelled" ? sada : zahtev.cancelledAt,
      cancelledBy: ishod.to === "cancelled" ? ("staff" as const) : zahtev.cancelledBy,
    };
    setDetalji((staro) => ({ ...staro, [id]: { ...staro[id], request: novi } }));
    setZahtevi((staro) =>
      ishod.to === "done" || ishod.to === "cancelled"
        ? staro.filter((red) => red.id !== id)
        : staro.map((red) => (red.id === id ? { ...red, status: novi.status, acceptedAt: novi.acceptedAt, acceptedBy: novi.acceptedBy } : red)),
    );
    return { ok: true, status: ishod.to, changed: true };
  }

  /** menuWaiter.setOccupancy in memory: refused when the module is off; null = neutral. */
  function zauzmi(positionId: string, stanje: Parameters<KonobarRadnje["postaviZauzetost"]>[1]): KonobarSalaIshod {
    if (!sala.occupancyEnabled || zauzetost.off) return { ok: false, code: "staff/occupancy_off" };
    if (!sala.positions.some((mesto) => mesto.id === positionId)) return { ok: false, code: "menu/not_found" };
    const pre = zauzetost.states.find((red) => red.positionId === positionId);
    if ((pre?.state ?? null) === stanje) return { ok: true, changed: false };
    const ostali = zauzetost.states.filter((red) => red.positionId !== positionId);
    setZauzetost({
      off: false,
      states: stanje === null ? ostali : [...ostali, { positionId, state: stanje, updatedAt: Date.now() + pomak, updatedBy: ime }],
    });
    return { ok: true, changed: true };
  }

  /** menuWaiter.setMyZone / setStaffZone in memory. */
  function zona(staffId: string | null, zoneId: string | null): KonobarSalaIshod {
    if (!staffId) return { ok: false, code: "menu/forbidden" };
    if (zoneId !== null && !sala.zones.some((z) => z.id === zoneId)) return { ok: false, code: "menu/not_found" };
    setSala((staro) => ({
      ...staro,
      staff: staro.staff.map((clan) => (clan.id === staffId ? { ...clan, activeZoneId: zoneId } : clan)),
      me: staro.me.staffId === staffId ? { ...staro.me, activeZoneId: zoneId } : staro.me,
    }));
    return { ok: true, changed: true };
  }

  /** One action on the reservations in memory (the server's rules, rezervacije/memorija.ts): the memory and, on an arrival, the occupancy change. */
  function rezIzvrsi(naredba: RezNaredba): KonobarRezIshod {
    const korak = primeniRezervaciju(rezMem, { ime, sada: Date.now() + pomak, sala, zauzetost }, naredba);
    if (korak.memorija !== rezMem) setRezMem(korak.memorija);
    if (korak.zauzetost !== zauzetost) setZauzetost(korak.zauzetost);
    return korak.ishod;
  }

  const radnje: KonobarRadnje = {
    prihvatiRezervaciju: async (id, ocekivani) => {
      await cekaj(ODGOVOR_MS);
      return rezIzvrsi({ vrsta: "prihvati", id, ocekivani });
    },
    odbijRezervaciju: async (id, ocekivani) => {
      await cekaj(ODGOVOR_MS);
      return rezIzvrsi({ vrsta: "odbij", id, ocekivani });
    },
    predloziIzmenu: async (id, proposedAt, poruka, ocekivani) => {
      await cekaj(ODGOVOR_MS);
      if (proposedAt <= Date.now() + pomak) return { ok: false, code: "reservation/in_past" };
      return rezIzvrsi({ vrsta: "predlozi", id, ocekivani, proposedAt, poruka });
    },
    gostPrihvataPredlog: async (id, ocekivani) => {
      await cekaj(ODGOVOR_MS);
      return rezIzvrsi({ vrsta: "gostPrihvata", id, ocekivani });
    },
    otkaziRezervaciju: async (id, ocekivani) => {
      await cekaj(ODGOVOR_MS);
      return rezIzvrsi({ vrsta: "otkazi", id, ocekivani });
    },
    poveziSto: async (id, positionId, ocekivani) => {
      await cekaj(ODGOVOR_MS);
      return rezIzvrsi({ vrsta: "poveziSto", id, ocekivani, positionId });
    },
    gostiStigli: async (id, positionId, ocekivani) => {
      await cekaj(ODGOVOR_MS);
      return rezIzvrsi({ vrsta: "stigli", id, ocekivani, positionId });
    },
    postaviZauzetost: async (positionId, stanje) => {
      await cekaj(ODGOVOR_MS);
      return zauzmi(positionId, stanje);
    },
    postaviMojuZonu: async (zoneId) => {
      await cekaj(ODGOVOR_MS);
      return zona(sala.me.staffId, zoneId);
    },
    postaviZonuOsoblja: async (staffId, zoneId) => {
      await cekaj(ODGOVOR_MS);
      if (!sala.me.canAssignZones) return { ok: false, code: "menu/forbidden" };
      return zona(staffId, zoneId);
    },
    preuzmi: async (id) => {
      await cekaj(ODGOVOR_MS);
      return primeni(id, "accept");
    },
    zavrsi: async (id) => {
      await cekaj(ODGOVOR_MS);
      return primeni(id, "done");
    },
    otkazi: async (id, ocekivani) => {
      await cekaj(ODGOVOR_MS);
      return primeni(id, "cancel", ocekivani);
    },
    odjava: () => {
      setIzabranId(null);
      setMestoId(null);
      setRezId(null);
      setPrijavljen(false);
    },
    zatvoriPodsetnik: async (id) => {
      await cekaj(ODGOVOR_MS);
      setPodsetnici((staro) => staro.filter((podsetnik) => podsetnik.id !== id));
    },
  };

  async function prijava(unet: string): Promise<PinIshod> {
    await cekaj(ODGOVOR_MS);
    const sada = Date.now() + pomak;
    const presuda = evaluateAttempt({ device: brojac, venue: null }, sada);
    if (presuda.kind === "locked") return { ok: false, stanje: { kind: "blokada", lockedUntil: presuda.lockedUntil } };
    if (unet !== KONOBAR_IZLOG_PIN) {
      const pogresan = registerFailure(brojac, sada, PIN_DEVICE_MAX_FAILURES);
      setBrojac(pogresan.counter);
      return pogresan.justLocked
        ? { ok: false, stanje: { kind: "blokada", lockedUntil: pogresan.counter.lockedUntil ?? sada } }
        : { ok: false, stanje: { kind: "pogresan", attemptsLeft: pogresan.attemptsLeft } };
    }
    setBrojac(registerSuccess(brojac, sada));
    setKorisnik(fixtureKonobar({ uloga: "osoblje" }).korisnik);
    setPrijavljen(true);
    setPoPrijavi(true);
    return { ok: true };
  }

  if (!prijavljen) {
    return (
      <PinEkran
        lokal={fx.lokal}
        pinDostupan={params.stanje !== "bez-peppera"}
        onPrijava={prijava}
        nalog={nalogom || params.stanje === "bez-peppera" ? { ime: KONOBAR_IZLOG_MENADZER } : null}
        onNalog={() => {
          setKorisnik({ kind: "account", displayName: KONOBAR_IZLOG_MENADZER, expiresAt: null });
          setPrijavljen(true);
          setPoPrijavi(true);
        }}
        pocetnoMs={IZLOG_SADA}
        izlogOd={IZLOG_SADA}
        pocetnoStanje={pin.stanje}
      />
    );
  }

  const izabran = izabranId ? detalji[izabranId] : undefined;
  const detalj: KonobarDetalj | null | undefined =
    izabranId === null
      ? undefined
      : izabran
        ? {
            ...izabran,
            others: zahtevi.filter((red) => red.positionId === izabran.request.positionId && red.id !== izabranId),
          }
        : null;
  const rezervacijaDetalj: KonobarRezervacijaDetalj | null | undefined =
    rezId === null
      ? undefined
      : rezMem.detalji[rezId]
        ? { ...rezMem.detalji[rezId], sameTable: rezervacijeIstogStola(rezMem.redovi, rezMem.detalji[rezId].reservation) }
        : null;

  return (
    <KonobarPanel
      lokal={fx.lokal}
      korisnik={korisnik}
      red={{
        zahtevi,
        skraceno: fx.skraceno,
        otkazani: fx.otkazani,
        // As the server: only for a request the waiter still holds (menuWaiter.activeRequests).
        podsetnici: podsetnici.filter((podsetnik) => zahtevi.some((zahtev) => zahtev.id === podsetnik.requestId && zahtev.status === "accepted")),
      }}
      izabranId={izabranId}
      detalj={detalj}
      onIzaberi={setIzabranId}
      radnje={radnje}
      veza={naMrezi ? "online" : "offline"}
      poslednjaVezaMs={params.offline ? IZLOG_SADA - 2 * 60_000 : null}
      pocetnoMs={IZLOG_SADA}
      izlogOd={IZLOG_SADA}
      pocetnaPotvrdaOtkaza={params.potvrdaOtkaza}
      pocetniPrikaz={params.ekran === "sala-raspored" || params.ekran === "sala-tabela" || params.ekran === "sto" ? "sala" : "red"}
      pocetniPrikazSale={params.ekran === "sala-tabela" ? "tabela" : "raspored"}
      sala={sala}
      zauzetost={zauzetost}
      izabranoMestoId={mestoId}
      onIzaberiMesto={setMestoId}
      detaljMesta={mestoId ? (pocetnaSala.kartice[mestoId] ?? { cards: [] }) : undefined}
      zvukIzlog={{ pocetno: !params.zvukIskljucen }}
      pocetnaZona={sala.me.staffId ? undefined : zonaPoNazivu(pocetnaSala.sala, params.zona)}
      rezervacije={rezervacije}
      izabranaRezervacijaId={rezId}
      onIzaberiRezervaciju={setRezId}
      detaljRezervacije={rezervacijaDetalj}
      odgovorGostu={(id, d) => (
        <OdgovorIzlog
          key={id}
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
          posta={params.posta}
          odgovor={params.odgovor}
          slanje={params.slanje}
          ishodPoziva={params.ishodPoziva}
          offline={!naMrezi}
        />
      )}
      pocetniFilterReda={params.ekran === "rezervacije" ? "rezervacije" : undefined}
      fokusNaRed={poPrijavi}
    />
  );
}
