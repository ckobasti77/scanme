"use client";

// ScanMe Menu V1 (K22, K23) — the shell of the waiter panel (master §10.1–§10.5;
// MENU-UX §8; plan K19 §5): ONE main screen and ONE contextual side.
//   phone (< 1024)   the work queue or the floor, switched by the bottom
//                    navigation `Radni red / Sala`; a request or a table detail
//                    takes the whole screen with its back button.
//   1024 and wider   the floor on the left, one wide contextual sidebar on the
//                    right: the work queue, or the detail of the chosen table
//                    (master §10.2: "isti panel"), or of the chosen request.
// K23 adds the floor (Raspored / Tabela), the table detail with the optional
// manual occupancy, the venue's late threshold (PragKasnjenja), the zone as
// a filter of the queue, the floor, the sound and the reminder, the device's
// sound switch, the reminder (one short sound per interval for a request
// still `Novi`, its row or table flashes; never continuous, never forwarded)
// and the recovery after a lost connection (nothing queued, the view kept,
// "Veza je vraćena."). Presentation only: the live route (ruta.tsx) and the
// izlog feed it through KonobarRadnje.

import { Grid2x2, ListChecks, OctagonAlert, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime, isLate, waitingFor } from "@/lib/menu/elapsed-time";
import { POCETNA_VEZA, sledecaVeza } from "@/lib/menu/konobar/veza";
import type { OccupancyState } from "@/lib/menu/occupancy";
import { dospeliPodsetnici } from "@/lib/menu/reminder";
import { DEFAULT_PANEL_TIMING } from "@/lib/menu/thresholds";
import { guestCancellationsSince, newArrivals, queueSummary, type QueueAction } from "@/lib/menu/waiter-queue";
import { cn } from "@/lib/utils";
import { Dugme } from "../zajednicko/dugme";
import { MenuPovrsina } from "../zajednicko/povrsina";
import { OfflineTraka, UcitavanjeStanje } from "../zajednicko/stanja";
import { DetaljZahteva, type DetaljRadnja } from "./detalj-zahteva/detalj-zahteva";
import type {
  KonobarDetalj,
  KonobarDetaljMesta,
  KonobarIshod,
  KonobarKorisnik,
  KonobarRadnje,
  KonobarRed,
  KonobarSala,
  KonobarSalaIshod,
  KonobarZahtev,
  KonobarZauzetost,
} from "./model";
import { PragKasnjenja } from "./prag";
import { RadniRed } from "./radni-red/radni-red";
import { mestaSale, zahteviUZoni, filterZone } from "./sala/pogled";
import { Sala, type SalaPrikaz } from "./sala/sala";
import { DetaljStola } from "./sto/detalj-stola";
import { useSat } from "./use-sat";
import { useSiroko } from "./use-siroko";
import { mestoTekst, vrstaNaslov } from "./vrsta";
import { Zaglavlje } from "./zaglavlje";
import { VanZone, ZonaIzbor } from "./zona";
import { useZvuk } from "./zvuk";

const t = menuKonobarSr;
const d = menuDomenSr;
/** Guest cancellations this recent are shown as a strip when the panel opens. */
const OTKAZI_SKORO_MS = 30 * 60 * 1000;
/** How long the confirmation toast stays visible (it stays in the live region for readers). */
const POTVRDA_MS = 4000;
/** How long a reminder keeps its row or table marked (the flash itself is shorter; reduced motion shows it still). */
const PODSETNIK_MS = 6000;
const PRAZNO: ReadonlySet<string> = new Set();

export type KonobarPrikaz = "red" | "sala";

export type KonobarPanelProps = {
  lokal: string;
  korisnik: KonobarKorisnik;
  /** undefined = loading. */
  red: KonobarRed | undefined;
  izabranId: string | null;
  /** The chosen request (undefined = loading, null = not available). */
  detalj: KonobarDetalj | null | undefined;
  onIzaberi(id: string | null): void;
  radnje: KonobarRadnje;
  veza: "online" | "offline";
  /** When the connection was last seen (the offline strip says "prikaz od …"). */
  poslednjaVezaMs?: number | null;
  odjavljuje?: boolean;
  pocetnoMs: number;
  /** Izlog: a fixed clock start, the starting view and an open cancel confirmation. */
  izlogOd?: number;
  pocetniPrikaz?: KonobarPrikaz;
  pocetnaPotvrdaOtkaza?: boolean;
  // K23 — the floor
  /** Zones, positions, staff zones, timing, the occupancy switch (undefined = loading). */
  sala?: KonobarSala;
  /** Only with the module (undefined = loading or not read). */
  zauzetost?: KonobarZauzetost;
  /** The chosen table (its detail fills the contextual pane). */
  izabranoMestoId?: string | null;
  onIzaberiMesto?(id: string | null): void;
  /** The chosen table's QR cards (undefined = loading). */
  detaljMesta?: KonobarDetaljMesta | null;
  pocetniPrikazSale?: SalaPrikaz;
  /** Izlog: the device sound starts here and is never stored. */
  zvukIzlog?: { pocetno: boolean };
  /** Izlog / an account: the starting zone filter (a PIN waiter's comes from the server). */
  pocetnaZona?: string | null;
};

type Greska = { id: string | null; tekst: string; ponovo: boolean };

function porukaGreske(ishod: Extract<KonobarIshod, { ok: false }>): string {
  if (ishod.code === "request/taken" && ishod.takenBy) return fmt(t.detalj.vec, { ime: ishod.takenBy });
  const tekst = (d.errors as Record<string, string>)[ishod.code];
  return tekst ?? t.greska.nepoznata;
}

export function KonobarPanel({
  lokal,
  korisnik,
  red,
  izabranId,
  detalj,
  onIzaberi,
  radnje,
  veza,
  poslednjaVezaMs = null,
  odjavljuje = false,
  pocetnoMs,
  izlogOd,
  pocetniPrikaz = "red",
  pocetnaPotvrdaOtkaza = false,
  sala,
  zauzetost,
  izabranoMestoId = null,
  onIzaberiMesto,
  detaljMesta,
  pocetniPrikazSale,
  zvukIzlog,
  pocetnaZona,
}: KonobarPanelProps) {
  const sadaMs = useSat(pocetnoMs, { izlogOd });
  const siroko = useSiroko();
  const zvuk = useZvuk(zvukIzlog);
  const [prikaz, setPrikaz] = useState<KonobarPrikaz>(pocetniPrikaz);
  const [prikazSale, setPrikazSale] = useState<SalaPrikaz>(pocetniPrikazSale ?? "raspored");
  const [radi, setRadi] = useState<{ id: string; radnja: DetaljRadnja } | null>(null);
  const [radiZauzetost, setRadiZauzetost] = useState(false);
  const [greska, setGreska] = useState<Greska | null>(null);
  const [greskaStola, setGreskaStola] = useState<string | null>(null);
  const [najava, setNajava] = useState<{ tekst: string; vidljiva: boolean }>({ tekst: "", vidljiva: false });
  const [zatvorena, setZatvorena] = useState<ReadonlySet<string>>(() => new Set());
  const [otvorenOd] = useState(() => (izlogOd ?? pocetnoMs) - OTKAZI_SKORO_MS);
  // The own zone while it is being saved (a PIN waiter), or an account's zone (kept on the device).
  const [lokalnaZona, setLokalnaZona] = useState<{ vrednost: string | null } | null>(
    pocetnaZona !== undefined ? { vrednost: pocetnaZona } : null,
  );
  const [podsetnik, setPodsetnik] = useState<{ zahtevi: ReadonlySet<string>; mesta: ReadonlySet<string>; do: number } | null>(null);
  const [offlineOd, setOfflineOd] = useState<number | null>(null);
  const prethodni = useRef<ReadonlySet<string> | null>(null);
  const poslednjiOtvoren = useRef<string | null>(null);
  const poslednjeMesto = useRef<string | null>(null);
  const podsetnici = useRef<Map<string, number>>(new Map());
  const vezaRef = useRef(POCETNA_VEZA);
  const ponovi = useRef<(() => void) | null>(null);
  const offline = veza === "offline";
  const mestoId = izabranoMestoId;

  const timing = sala?.timing ?? DEFAULT_PANEL_TIMING;
  const serverZona = sala?.me.staffId ? sala.me.activeZoneId : null;
  const filterZoneId = filterZone(sala, lokalnaZona ? lokalnaZona.vrednost : serverZona);

  // What the waiter sees: the active requests of the chosen zone plus "Bez zone" (plan K19-18).
  const vidljivi = useMemo(() => (red ? zahteviUZoni(red.zahtevi, sala, filterZoneId) : []), [red, sala, filterZoneId]);
  const vidljiviIds = useMemo(() => new Set(vidljivi.map((zahtev) => zahtev.id)), [vidljivi]);

  // A polite announcement and one short sound for every visible request that arrives while the panel is open.
  useEffect(() => {
    if (!red) return;
    const novi = newArrivals(prethodni.current, red.zahtevi);
    prethodni.current = new Set(red.zahtevi.map((zahtev) => zahtev.id));
    const vidljiviNovi = novi.filter((zahtev) => vidljiviIds.has(zahtev.id));
    if (vidljiviNovi.length > 0) {
      const poslednji = vidljiviNovi[vidljiviNovi.length - 1];
      setNajava({ tekst: fmt(t.red.najava, { vrsta: vrstaNaslov(poslednji), mesto: mestoTekst(poslednji) }), vidljiva: true });
      zvuk.zvoni();
    }
    // Only a new snapshot of the queue is news; the zone filter changing is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [red]);

  // The reminder (master §8.5): once per interval for a visible request still `Novi`; one sound per tick.
  useEffect(() => {
    if (!red) return;
    const tik = dospeliPodsetnici(vidljivi, sadaMs, timing.reminderMin, podsetnici.current);
    podsetnici.current = tik.memory;
    if (tik.due.length === 0) return;
    const dospeli = vidljivi.filter((zahtev) => tik.due.includes(zahtev.id));
    zvuk.zvoni();
    setPodsetnik({
      zahtevi: new Set(dospeli.map((zahtev) => zahtev.id)),
      mesta: new Set(dospeli.map((zahtev) => zahtev.positionId)),
      do: sadaMs + PODSETNIK_MS,
    });
    const prvi = dospeli[0];
    if (prvi) {
      setNajava({
        tekst: fmt(t.zvuk.podsetnik, { vrsta: vrstaNaslov(prvi), mesto: mestoTekst(prvi), ceka: waitingFor(prvi.createdAt, sadaMs) }),
        vidljiva: true,
      });
    }
    // The clock drives the reminder; the rest is read as it is at that tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sadaMs]);

  // The connection: when it went away (the strip's "prikaz od …"), and one note when it comes back.
  useEffect(() => {
    const pre = vezaRef.current;
    const sledeca = sledecaVeza(pre, veza === "online", sadaMs);
    vezaRef.current = sledeca;
    if (pre.stanje !== "offline" && sledeca.stanje === "offline") setOfflineOd(sledeca.poslednjeOsvezenje);
    if (pre.stanje === "offline" && sledeca.stanje === "ponovo") setNajava({ tekst: t.veza.vracena, vidljiva: true });
  }, [veza, sadaMs]);

  useEffect(() => {
    if (!najava.vidljiva) return;
    const tajmer = setTimeout(() => setNajava((staro) => ({ ...staro, vidljiva: false })), POTVRDA_MS);
    return () => clearTimeout(tajmer);
  }, [najava]);

  // Back from a request detail: the focus returns to the card (or the table row) that was opened.
  useEffect(() => {
    if (izabranId !== null || poslednjiOtvoren.current === null) return;
    const id = poslednjiOtvoren.current;
    poslednjiOtvoren.current = null;
    const dugme = [...document.querySelectorAll<HTMLButtonElement>(`[data-zahtev="${CSS.escape(id)}"] h3 button, [data-zahtev="${CSS.escape(id)}"] button`)].find(
      (kandidat) => kandidat.offsetParent !== null,
    );
    const cilj = dugme ?? document.querySelector<HTMLElement>(mestoId ? "#sto-naslov" : "#radni-red-naslov");
    cilj?.focus();
  }, [izabranId, mestoId]);

  // Back from a table detail: the focus returns to that table on the floor.
  useEffect(() => {
    if (mestoId !== null || poslednjeMesto.current === null) return;
    const id = poslednjeMesto.current;
    poslednjeMesto.current = null;
    const sto = [...document.querySelectorAll<HTMLButtonElement>(`button[data-mesto="${CSS.escape(id)}"]`)].find(
      (kandidat) => kandidat.offsetParent !== null,
    );
    (sto ?? document.querySelector<HTMLElement>("#sala-naslov"))?.focus();
  }, [mestoId]);

  function otvori(id: string | null) {
    if (id !== null) poslednjiOtvoren.current = id;
    setGreska(null);
    onIzaberi(id);
  }

  function izaberiMesto(id: string | null) {
    if (id !== null) poslednjeMesto.current = null;
    else if (mestoId !== null) poslednjeMesto.current = mestoId;
    setGreska(null);
    setGreskaStola(null);
    if (izabranId !== null) onIzaberi(null);
    onIzaberiMesto?.(id);
  }

  /** "Prihvaćeno: Poziv konobara · Sto 3": the request the action was about, from the queue or the detail. */
  function potvrda(id: string, status: "accepted" | "done" | "cancelled"): string {
    const zahtev = red?.zahtevi.find((kandidat) => kandidat.id === id) ?? (detalj?.request.id === id ? detalj.request : null);
    return zahtev ? fmt(t.red.potvrda[status], { vrsta: vrstaNaslov(zahtev), mesto: mestoTekst(zahtev) }) : "";
  }

  async function izvrsi(zahtev: Pick<KonobarZahtev, "id">, radnja: DetaljRadnja, posao: () => Promise<KonobarIshod>) {
    if (radi || offline) return;
    setRadi({ id: zahtev.id, radnja });
    setGreska(null);
    ponovi.current = null;
    let ishod: KonobarIshod;
    try {
      ishod = await posao();
    } catch {
      ishod = { ok: false, code: "network" };
    }
    setRadi(null);
    if (!ishod.ok) {
      const mreza = ishod.code === "network";
      // Nothing is queued: the waiter decides to try again once the connection is back.
      ponovi.current = mreza ? () => void izvrsi(zahtev, radnja, posao) : null;
      setGreska({ id: zahtev.id, tekst: mreza ? t.greska.mreza : porukaGreske(ishod), ponovo: mreza });
      return;
    }
    if (ishod.status === "done" || ishod.status === "accepted" || ishod.status === "cancelled") {
      const tekst = potvrda(zahtev.id, ishod.status);
      const kratko = ishod.status === "done" ? t.red.zavrseno : ishod.status === "accepted" ? t.red.preuzeto : t.red.otkazano;
      setNajava({ tekst: tekst ? `${kratko} ${tekst}` : kratko, vidljiva: true });
      if (ishod.status !== "accepted" && izabranId === zahtev.id) otvori(null);
    }
  }

  function naRadnju(zahtev: KonobarZahtev, radnja: QueueAction) {
    if (radnja === "review") return otvori(zahtev.id);
    if (radnja === "accept") return void izvrsi(zahtev, "preuzmi", () => radnje.preuzmi(zahtev.id));
    return void izvrsi(zahtev, "zavrsi", () => radnje.zavrsi(zahtev.id));
  }

  async function postaviZauzetost(id: string, stanje: OccupancyState | null) {
    if (radiZauzetost || offline) return;
    setRadiZauzetost(true);
    setGreskaStola(null);
    let ishod: KonobarSalaIshod;
    try {
      ishod = await radnje.postaviZauzetost(id, stanje);
    } catch {
      ishod = { ok: false, code: "network" };
    }
    setRadiZauzetost(false);
    if (!ishod.ok) {
      setGreskaStola(ishod.code === "network" ? t.greska.mreza : ((d.errors as Record<string, string>)[ishod.code] ?? t.greska.nepoznata));
      return;
    }
    setNajava({ tekst: stanje ? fmt(t.sto.postavljeno, { stanje: t.zauzetost[stanje] }) : t.sto.uklonjeno, vidljiva: true });
  }

  async function promeniZonu(zoneId: string | null) {
    const ime = zoneId ? (sala?.zones.find((zona) => zona.id === zoneId)?.name ?? t.zona.sve) : t.zona.sve;
    setLokalnaZona({ vrednost: zoneId });
    setNajava({ tekst: fmt(t.zona.promenjena, { zona: ime }), vidljiva: true });
    // An account keeps its zone on this device; a PIN waiter's own zone is saved (the manager sees it).
    if (!sala?.me.staffId) return;
    let ishod: KonobarSalaIshod;
    try {
      ishod = await radnje.postaviMojuZonu(zoneId);
    } catch {
      ishod = { ok: false, code: "network" };
    }
    setLokalnaZona(null);
    if (!ishod.ok) setGreska({ id: null, tekst: t.greska.nepoznata, ponovo: false });
  }

  // What waits outside the chosen zone is counted, never hidden in silence (master §9.3).
  const vanZone = red && filterZoneId !== null ? red.zahtevi.filter((zahtev) => !vidljiviIds.has(zahtev.id)) : [];
  const vanZoneTraka =
    vanZone.length > 0 ? (
      <VanZone
        broj={vanZone.length}
        kasni={vanZone.filter((zahtev) => isLate(zahtev.createdAt, sadaMs, timing.lateThresholdMin)).length}
        onSve={() => void promeniZonu(null)}
      />
    ) : null;
  const zonaNaziv = filterZoneId ? (sala?.zones.find((zona) => zona.id === filterZoneId)?.name ?? null) : null;
  const sazetak = queueSummary(vidljivi);
  const aktivni = red ? sazetak.active : null;
  const obavestenja = red
    ? guestCancellationsSince(red.otkazani, otvorenOd).filter((otkazan) => !zatvorena.has(otkazan.id))
    : [];
  const prikazOd = poslednjaVezaMs ?? offlineOd;
  const offlineTraka = offline ? <OfflineTraka vreme={prikazOd !== null ? clockTime(prikazOd) : undefined} /> : null;
  const greskaTraka = (prikazi: boolean) =>
    greska && prikazi ? (
      <div
        role="alert"
        className="flex flex-wrap items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-base text-[var(--mp-tekst)] [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
      >
        <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-opasnost)]" />
        <span className="min-w-0 flex-1">{greska.tekst}</span>
        {greska.ponovo ? (
          <Dugme
            vrsta="sekundarno"
            ikonica={RotateCw}
            disabled={offline}
            onClick={() => ponovi.current?.()}
            className="min-h-12"
          >
            {t.veza.pokusajPonovo}
          </Dugme>
        ) : null}
      </div>
    ) : null;

  // The floor: every table (the detail may show one outside the zone filter) and the active requests.
  const svaMesta = useMemo(
    () => (sala && red ? mestaSale({ sala, zahtevi: red.zahtevi, zauzetost }) : sala ? mestaSale({ sala, zahtevi: [], zauzetost }) : []),
    [sala, red, zauzetost],
  );
  const izabranoMesto = mestoId !== null ? (svaMesta.find((mesto) => mesto.id === mestoId) ?? null) : null;
  const zahteviMesta = mestoId !== null && red ? red.zahtevi.filter((zahtev) => zahtev.positionId === mestoId) : [];
  const istaknutoMesto = mestoId ?? (izabranId !== null && detalj ? detalj.request.positionId : null);
  const aktivniPodsetnik = podsetnik && sadaMs < podsetnik.do ? podsetnik : null;
  const modulZauzetosti = Boolean(sala?.occupancyEnabled && zauzetost && !zauzetost.off);
  const kontekst = izabranId !== null ? "zahtev" : mestoId !== null ? "sto" : "red";
  const panoVidljiv = prikaz === "red" || kontekst !== "red";

  return (
    <MenuPovrsina povrsina="konobar" className="min-h-[100dvh]">
      <PragKasnjenja minuta={timing.lateThresholdMin}>
        <Zaglavlje
          lokal={lokal}
          korisnik={korisnik}
          aktivni={aktivni}
          sadaMs={sadaMs}
          onOdjava={() => void radnje.odjava()}
          odjavljuje={odjavljuje}
          offline={offline}
          zvuk={{ ukljucen: zvuk.ukljucen, onPrebaci: zvuk.prebaci }}
          zona={
            sala && sala.zones.length > 0 ? (
              <ZonaIzbor
                zones={sala.zones}
                filterZoneId={filterZoneId}
                onIzbor={(zoneId) => void promeniZonu(zoneId)}
                iskljuceno={offline && sala.me.staffId !== null}
                raspodela={sala.me.canAssignZones ? { staff: sala.staff, onPostavi: radnje.postaviZonuOsoblja } : null}
              />
            ) : null
          }
        />
        {/* One polite region for arrivals, reminders and confirmations; visible for a few seconds as a toast. */}
        <p
          aria-live="polite"
          aria-atomic="true"
          data-vidljiva={najava.vidljiva || undefined}
          className={
            najava.vidljiva && najava.tekst
              ? "pointer-events-none fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[30rem] rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-mastilo)] px-4 py-3 text-center text-base font-semibold text-[var(--mp-na-mastilu)] shadow-[var(--mp-senka-md)] lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[28rem]"
              : "sr-only"
          }
        >
          {najava.tekst}
        </p>

        <main className="mx-auto grid max-w-[110rem] gap-6 px-4 pb-28 pt-5 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-4 lg:px-4 lg:pb-8 xl:grid-cols-[minmax(0,1fr)_34rem] xl:gap-6 xl:px-6">
          <div className={cn("min-w-0", panoVidljiv ? "hidden lg:block" : "block")}>
            <Sala
              sala={sala}
              zahtevi={vidljivi}
              zauzetost={zauzetost}
              filterZoneId={filterZoneId}
              sadaMs={sadaMs}
              izabranoId={istaknutoMesto}
              onIzaberi={(id) => izaberiMesto(id)}
              prikaz={prikazSale}
              onPrikaz={setPrikazSale}
              podsetnik={aktivniPodsetnik?.mesta ?? PRAZNO}
              zonaNaziv={zonaNaziv}
              napomena={vanZoneTraka}
            />
          </div>

          <div
            className={cn(
              "min-w-0 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:rounded-[var(--mp-radius-okvir)] lg:border lg:bg-[var(--mp-okvir)] lg:p-5 lg:[--border:var(--mp-ivica)]",
              panoVidljiv ? "block" : "hidden lg:block",
            )}
            data-bocni-pano
            data-kontekst={kontekst}
          >
            {kontekst === "zahtev" && izabranId !== null ? (
              <div className="grid gap-4">
                {greska?.ponovo && greska.id === izabranId ? greskaTraka(true) : null}
                <DetaljZahteva
                  key={izabranId}
                  detalj={detalj}
                  sadaMs={sadaMs}
                  radi={radi && radi.id === izabranId ? radi.radnja : null}
                  greska={greska && greska.id === izabranId && !greska.ponovo ? greska.tekst : null}
                  radnjeIskljucene={offline}
                  razlogIskljucenja={offline ? t.detalj.offline : null}
                  onNazad={() => otvori(null)}
                  onPreuzmi={() => void izvrsi({ id: izabranId }, "preuzmi", () => radnje.preuzmi(izabranId))}
                  onZavrsi={() => void izvrsi({ id: izabranId }, "zavrsi", () => radnje.zavrsi(izabranId))}
                  onOtkazi={(ocekivani) => void izvrsi({ id: izabranId }, "otkazi", () => radnje.otkazi(izabranId, ocekivani))}
                  onOtvoriDrugi={(id) => otvori(id)}
                  pocetnaPotvrda={pocetnaPotvrdaOtkaza}
                  nazadNa={
                    izabranoMesto
                      ? { oznaka: izabranoMesto.label, citac: fmt(t.sto.nazadNaStoCitac, { sto: izabranoMesto.label }) }
                      : undefined
                  }
                />
              </div>
            ) : kontekst === "sto" ? (
              sala === undefined ? (
                <UcitavanjeStanje oblik="forma" redova={3} />
              ) : (
                <div className="grid gap-4">
                  {offlineTraka}
                  {greska?.ponovo ? greskaTraka(true) : null}
                  <DetaljStola
                    key={mestoId ?? ""}
                    mesto={izabranoMesto}
                    zahtevi={zahteviMesta}
                    detaljMesta={detaljMesta}
                    sadaMs={sadaMs}
                    zauzetostUkljucena={modulZauzetosti}
                    radiId={radi?.id ?? null}
                    radiZauzetost={radiZauzetost}
                    greska={greskaStola ?? (greska && !greska.ponovo ? greska.tekst : null)}
                    radnjeIskljucene={offline}
                    razlogIskljucenja={offline ? t.detalj.offline : null}
                    nazad={siroko ? "red" : "sala"}
                    onNazad={() => izaberiMesto(null)}
                    onRadnja={naRadnju}
                    onOtvoriZahtev={(id) => otvori(id)}
                    onZauzetost={(stanje) => mestoId !== null && void postaviZauzetost(mestoId, stanje)}
                  />
                </div>
              )
            ) : (
              <RadniRed
                red={red ? { ...red, zahtevi: vidljivi } : undefined}
                sadaMs={sadaMs}
                radiId={radi?.id ?? null}
                onOtvori={(id) => otvori(id)}
                onRadnja={naRadnju}
                radnjeIskljucene={offline}
                obavestenja={obavestenja}
                onZatvoriObavestenje={(id) => setZatvorena((staro) => new Set([...staro, id]))}
                podsetnik={aktivniPodsetnik?.zahtevi ?? PRAZNO}
                traka={
                  offlineTraka || greska || vanZoneTraka ? (
                    <div className="grid gap-2">
                      {offlineTraka}
                      {greskaTraka(greska !== null && greska.id !== izabranId)}
                      {vanZoneTraka}
                    </div>
                  ) : undefined
                }
              />
            )}
          </div>
        </main>

        <nav
          aria-label={t.nav.oznaka}
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-[var(--mp-povrsina)] pb-[env(safe-area-inset-bottom)] [--border:var(--mp-ivica)] lg:hidden"
        >
          <div className="mx-auto grid max-w-[40rem] grid-cols-2 gap-2 px-4 py-2">
            {(
              [
                { kljuc: "red", ikonica: ListChecks, oznaka: t.nav.red },
                { kljuc: "sala", ikonica: Grid2x2, oznaka: t.nav.sala },
              ] as const
            ).map(({ kljuc, ikonica: Ikonica, oznaka }) => {
              const izabran = prikaz === kljuc;
              const novih = kljuc === "red" && red ? sazetak.newCount : 0;
              return (
                <button
                  key={kljuc}
                  type="button"
                  aria-pressed={izabran}
                  onClick={() => {
                    setPrikaz(kljuc);
                    if (izabranId !== null) otvori(null);
                    if (mestoId !== null) onIzaberiMesto?.(null);
                  }}
                  className={cn(
                    "grid min-h-14 place-items-center gap-0.5 rounded-[var(--mp-radius-dugme)] py-1.5 text-sm font-bold [--button-radius:var(--mp-radius-dugme)]",
                    izabran
                      ? "bg-[var(--mp-akcent-meko)] text-[var(--mp-tekst)] shadow-[inset_0_-3px_0_var(--mp-mastilo)]"
                      : "text-[var(--mp-tekst-sporedni)] hover:bg-[var(--mp-povrsina-utisana)]",
                  )}
                >
                  <span className="relative">
                    <Ikonica aria-hidden="true" strokeWidth={2} className="size-6" />
                    {novih > 0 ? (
                      <span
                        aria-hidden="true"
                        className="absolute -right-3.5 -top-2 grid min-w-6 place-items-center rounded-full bg-[var(--mp-info)] px-1.5 text-xs font-bold leading-6 text-[var(--mp-na-mastilu)] tabular-nums"
                      >
                        {novih}
                      </span>
                    ) : null}
                  </span>
                  {oznaka}
                  {novih > 0 ? <span className="sr-only">, {fmt(t.red.noviBroj[srPluralCategory(novih)], { n: novih })}</span> : null}
                </button>
              );
            })}
          </div>
        </nav>
      </PragKasnjenja>
    </MenuPovrsina>
  );
}
