"use client";

// ScanMe Menu V1 (K22) — the shell of the waiter panel (master §10.1–§10.2;
// MENU-UX §8; plan K19 §5): ONE main screen and ONE contextual side.
//   phone (< 1024)   the work queue or the floor, switched by the bottom
//                    navigation `Radni red / Sala`; a request detail takes the
//                    whole screen with `‹ Radni red`.
//   1024 and wider   the floor on the left, one wide contextual sidebar on the
//                    right: the work queue, or the detail of the chosen request.
// The floor itself is K23 (an honest state until then). Presentation only:
// the live route (ruta.tsx) and the izlog feed it through KonobarRadnje.

import { Grid2x2, ListChecks, OctagonAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { guestCancellationsSince, newArrivals, queueSummary, type QueueAction } from "@/lib/menu/waiter-queue";
import { cn } from "@/lib/utils";
import { MenuPovrsina } from "../zajednicko/povrsina";
import { OfflineTraka } from "../zajednicko/stanja";
import { DetaljZahteva, type DetaljRadnja } from "./detalj-zahteva/detalj-zahteva";
import type { KonobarDetalj, KonobarIshod, KonobarKorisnik, KonobarRadnje, KonobarRed, KonobarZahtev } from "./model";
import { RadniRed } from "./radni-red/radni-red";
import { SalaUskoro } from "./sala-uskoro";
import { useSat } from "./use-sat";
import { mestoTekst, vrstaNaslov } from "./vrsta";
import { Zaglavlje } from "./zaglavlje";

const t = menuKonobarSr;
const d = menuDomenSr;
/** Guest cancellations this recent are shown as a strip when the panel opens. */
const OTKAZI_SKORO_MS = 30 * 60 * 1000;
/** How long the confirmation toast stays visible (it stays in the live region for readers). */
const POTVRDA_MS = 4000;

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
};

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
}: KonobarPanelProps) {
  const sadaMs = useSat(pocetnoMs, { izlogOd });
  const [prikaz, setPrikaz] = useState<KonobarPrikaz>(pocetniPrikaz);
  const [radi, setRadi] = useState<{ id: string; radnja: DetaljRadnja } | null>(null);
  const [greska, setGreska] = useState<{ id: string | null; tekst: string } | null>(null);
  const [najava, setNajava] = useState<{ tekst: string; vidljiva: boolean }>({ tekst: "", vidljiva: false });
  const [zatvorena, setZatvorena] = useState<ReadonlySet<string>>(() => new Set());
  const [otvorenOd] = useState(() => (izlogOd ?? pocetnoMs) - OTKAZI_SKORO_MS);
  const prethodni = useRef<ReadonlySet<string> | null>(null);
  const poslednjiOtvoren = useRef<string | null>(null);
  const offline = veza === "offline";

  // A polite announcement for every request that arrives while the panel is open.
  useEffect(() => {
    if (!red) return;
    const novi = newArrivals(prethodni.current, red.zahtevi);
    prethodni.current = new Set(red.zahtevi.map((zahtev) => zahtev.id));
    if (novi.length > 0) {
      const poslednji = novi[novi.length - 1];
      setNajava({ tekst: fmt(t.red.najava, { vrsta: vrstaNaslov(poslednji), mesto: mestoTekst(poslednji) }), vidljiva: true });
    }
  }, [red]);

  useEffect(() => {
    if (!najava.vidljiva) return;
    const tajmer = setTimeout(() => setNajava((staro) => ({ ...staro, vidljiva: false })), POTVRDA_MS);
    return () => clearTimeout(tajmer);
  }, [najava]);

  // Back from a detail: the focus returns to the card that was opened.
  useEffect(() => {
    if (izabranId !== null || poslednjiOtvoren.current === null) return;
    const id = poslednjiOtvoren.current;
    poslednjiOtvoren.current = null;
    const dugme = document.querySelector<HTMLButtonElement>(`[data-zahtev="${CSS.escape(id)}"] h3 button`);
    const cilj = dugme ?? document.querySelector<HTMLElement>("#radni-red-naslov");
    cilj?.focus();
  }, [izabranId]);

  function otvori(id: string | null) {
    if (id !== null) poslednjiOtvoren.current = id;
    setGreska(null);
    onIzaberi(id);
    if (id !== null) setPrikaz("red");
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
    let ishod: KonobarIshod;
    try {
      ishod = await posao();
    } catch {
      ishod = { ok: false, code: "network" };
    }
    setRadi(null);
    if (!ishod.ok) {
      setGreska({ id: zahtev.id, tekst: ishod.code === "network" ? t.greska.mreza : porukaGreske(ishod) });
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

  const sazetak = red ? queueSummary(red.zahtevi) : null;
  const aktivni = sazetak ? sazetak.active : null;
  const obavestenja = red
    ? guestCancellationsSince(red.otkazani, otvorenOd).filter((otkazan) => !zatvorena.has(otkazan.id))
    : [];
  const offlineTraka = offline ? (
    <OfflineTraka vreme={poslednjaVezaMs !== null ? clockTime(poslednjaVezaMs) : undefined} />
  ) : null;
  const greskaReda =
    greska && greska.id !== izabranId ? (
      <p role="alert" className="flex items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-base text-[var(--mp-tekst)] [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]">
        <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-opasnost)]" />
        <span>{greska.tekst}</span>
      </p>
    ) : null;

  return (
    <MenuPovrsina povrsina="konobar" className="min-h-[100dvh]">
      <Zaglavlje
        lokal={lokal}
        korisnik={korisnik}
        aktivni={aktivni}
        sadaMs={sadaMs}
        onOdjava={() => void radnje.odjava()}
        odjavljuje={odjavljuje}
        offline={offline}
      />
      {/* One polite region for arrivals and confirmations; visible for a few seconds as a toast. */}
      <p
        aria-live="polite"
        aria-atomic="true"
        data-vidljiva={najava.vidljiva || undefined}
        className={
          najava.vidljiva && najava.tekst
            ? "fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[30rem] rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-mastilo)] px-4 py-3 text-center text-base font-semibold text-[var(--mp-na-mastilu)] shadow-[var(--mp-senka-md)] lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[28rem]"
            : "sr-only"
        }
      >
        {najava.tekst}
      </p>

      <main className="mx-auto grid max-w-[110rem] gap-6 px-4 pb-28 pt-5 lg:grid-cols-[minmax(0,1fr)_28rem] lg:px-6 lg:pb-8 xl:grid-cols-[minmax(0,1fr)_34rem]">
        <div className={cn("min-w-0", prikaz === "sala" ? "block" : "hidden lg:block")}>
          <SalaUskoro onRadniRed={() => setPrikaz("red")} />
        </div>

        <div
          className={cn(
            "min-w-0 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:rounded-[var(--mp-radius-okvir)] lg:border lg:bg-[var(--mp-okvir)] lg:p-5 lg:[--border:var(--mp-ivica)]",
            prikaz === "red" ? "block" : "hidden lg:block",
          )}
          data-bocni-pano
        >
          {izabranId !== null ? (
            <div className="grid gap-4">
              <DetaljZahteva
                key={izabranId}
                detalj={detalj}
                sadaMs={sadaMs}
                radi={radi && radi.id === izabranId ? radi.radnja : null}
                greska={greska && greska.id === izabranId ? greska.tekst : null}
                radnjeIskljucene={offline}
                razlogIskljucenja={offline ? t.detalj.offline : null}
                onNazad={() => otvori(null)}
                onPreuzmi={() => void izvrsi({ id: izabranId }, "preuzmi", () => radnje.preuzmi(izabranId))}
                onZavrsi={() => void izvrsi({ id: izabranId }, "zavrsi", () => radnje.zavrsi(izabranId))}
                onOtkazi={(ocekivani) => void izvrsi({ id: izabranId }, "otkazi", () => radnje.otkazi(izabranId, ocekivani))}
                onOtvoriDrugi={(id) => otvori(id)}
                pocetnaPotvrda={pocetnaPotvrdaOtkaza}
              />
            </div>
          ) : (
            <RadniRed
              red={red}
              sadaMs={sadaMs}
              radiId={radi?.id ?? null}
              onOtvori={(id) => otvori(id)}
              onRadnja={naRadnju}
              radnjeIskljucene={offline}
              obavestenja={obavestenja}
              onZatvoriObavestenje={(id) => setZatvorena((staro) => new Set([...staro, id]))}
              traka={
                offlineTraka || greskaReda ? (
                  <div className="grid gap-2">
                    {offlineTraka}
                    {greskaReda}
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
            const novih = kljuc === "red" && sazetak ? sazetak.newCount : 0;
            return (
              <button
                key={kljuc}
                type="button"
                aria-pressed={izabran}
                onClick={() => {
                  setPrikaz(kljuc);
                  if (kljuc === "red" && izabranId !== null) otvori(null);
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
    </MenuPovrsina>
  );
}
