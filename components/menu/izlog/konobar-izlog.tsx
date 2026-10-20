"use client";

// ScanMe Menu V1 (K22) — the izlog of the waiter panel: the REAL PIN screen
// and the REAL panel over the invented "Demo restoran" (components/menu/
// fixtures/konobar.ts) and an in-memory store that applies the server's
// rules: the status table of lib/menu/request-status.ts (Preuzmi, Završi,
// Otkaži, "already taken") and the wrong-PIN rules of lib/menu/pin-policy.ts
// (five misses lock the device for 15 minutes). No Convex, no network. The
// clock starts at 18:27 (IZLOG_SADA) and then runs, so timers tick.

import { useMemo, useState } from "react";
import {
  KONOBAR_IZLOG_MENADZER,
  KONOBAR_IZLOG_PIN,
  fixtureKonobar,
} from "@/components/menu/fixtures/konobar";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import type {
  KonobarDetalj,
  KonobarIshod,
  KonobarKorisnik,
  KonobarRadnje,
  KonobarZahtev,
  PinIshod,
  PinStanje,
} from "@/components/menu/konobar/model";
import { KonobarPanel } from "@/components/menu/konobar/panel";
import { PinEkran } from "@/components/menu/konobar/pin/pin-ekran";
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
  const [korisnik, setKorisnik] = useState<KonobarKorisnik>(fx.korisnik);
  const [zahtevi, setZahtevi] = useState<KonobarZahtev[]>(fx.zahtevi);
  const [detalji, setDetalji] = useState<Record<string, KonobarDetalj>>(fx.detalji);
  const [izabranId, setIzabranId] = useState<string | null>(
    params.ekran === "detalj" ? (params.zahtev && fx.detalji[params.zahtev] ? params.zahtev : "rq_03") : null,
  );
  const [brojac, setBrojac] = useState<PinCounter | null>(pin.brojac);
  // The izlog clock: 18:27 when the izlog opened, then real time.
  const [pomak] = useState(() => IZLOG_SADA - Date.now());
  const ime = korisnik.displayName;

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

  const radnje: KonobarRadnje = {
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
      setPrijavljen(false);
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
            others: zahtevi.filter((red) => red.positionLabel === izabran.request.positionLabel && red.id !== izabranId),
          }
        : null;

  return (
    <KonobarPanel
      lokal={fx.lokal}
      korisnik={korisnik}
      red={{ zahtevi, skraceno: fx.skraceno, otkazani: fx.otkazani }}
      izabranId={izabranId}
      detalj={detalj}
      onIzaberi={setIzabranId}
      radnje={radnje}
      veza={params.offline ? "offline" : "online"}
      poslednjaVezaMs={params.offline ? IZLOG_SADA - 2 * 60_000 : null}
      pocetnoMs={IZLOG_SADA}
      izlogOd={IZLOG_SADA}
      pocetnaPotvrdaOtkaza={params.potvrdaOtkaza}
    />
  );
}
