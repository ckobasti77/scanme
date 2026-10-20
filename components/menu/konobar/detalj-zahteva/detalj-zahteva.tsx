"use client";

// ScanMe Menu V1 (K22) — one request in focus (master §8.4, §10.2; mockup 11):
// the kind and the table, when it came and how long it waits, where it came
// from (the card the guest scanned), the payment wish of a bill, the lines of
// an order as they were sent (names, variants, add-ons, notes, the informative
// total — never a payment, never a kitchen), the actions of the one status
// flow Novi → Prihvaćen → Završen (Otkaži after a confirmation), and the rest
// of the same table. No table history (master §10.5).

import { ChevronLeft, ChevronRight, CircleSlash, Hand, CircleCheck, OctagonAlert, SearchX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { isOpenStatus, type MenuRequestStatus } from "@/lib/menu/request-status";
import { cn } from "@/lib/utils";
import { formatRsd } from "../../menu-view";
import { Dugme } from "../../zajednicko/dugme";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { KonobarDetalj, KonobarZahtev } from "../model";
import { VremeCelije, VremePar } from "../vreme";
import { StatusZahteva, VrstaIkonica, mestoTekst, vrstaNaslov } from "../vrsta";

const t = menuKonobarSr.detalj;
const d = menuDomenSr;

export type DetaljRadnja = "preuzmi" | "zavrsi" | "otkazi";

export type DetaljZahtevaProps = {
  /** undefined = loading; null = not available (another venue, gone). */
  detalj: KonobarDetalj | null | undefined;
  sadaMs: number;
  radi: DetaljRadnja | null;
  /** What the last action answered, in words (role=alert). */
  greska: string | null;
  radnjeIskljucene: boolean;
  /** Why the actions wait (offline); shown next to them. */
  razlogIskljucenja?: string | null;
  onNazad(): void;
  onPreuzmi(): void;
  onZavrsi(): void;
  onOtkazi(ocekivaniStatus: MenuRequestStatus): void;
  onOtvoriDrugi(id: string): void;
  /** Izlog: the cancel confirmation is open. */
  pocetnaPotvrda?: boolean;
};

function iznos(rsd: number) {
  return fmt(t.iznos, { iznos: formatRsd(rsd) });
}

function DrugiNaMestu({ zahtev, sadaMs, onOtvori }: { zahtev: KonobarZahtev; sadaMs: number; onOtvori(): void }) {
  const naslov = vrstaNaslov(zahtev);
  return (
    <button
      type="button"
      onClick={onOtvori}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina-utisana)] p-3 text-left [--border:var(--mp-ivica)] hover:bg-[color-mix(in_oklab,var(--mp-povrsina-utisana)_80%,var(--mp-mastilo)_6%)]"
    >
      <VrstaIkonica vrsta={zahtev.kind} />
      <span className="grid min-w-0 gap-1">
        <span className="text-base font-bold leading-snug text-[var(--mp-tekst)]">{naslov}</span>
        <VremePar od={zahtev.createdAt} sadaMs={sadaMs} className="text-[0.9375rem]" />
        <span>
          <StatusZahteva zahtev={zahtev} velicina="mala" />
        </span>
      </span>
      <ChevronRight aria-hidden="true" strokeWidth={2} className="size-5 text-[var(--mp-tekst-sporedni)]" />
    </button>
  );
}

export function DetaljZahteva({
  detalj,
  sadaMs,
  radi,
  greska,
  radnjeIskljucene,
  razlogIskljucenja,
  onNazad,
  onPreuzmi,
  onZavrsi,
  onOtkazi,
  onOtvoriDrugi,
  pocetnaPotvrda = false,
}: DetaljZahtevaProps) {
  const [potvrda, setPotvrda] = useState(pocetnaPotvrda);
  const naslovRef = useRef<HTMLHeadingElement>(null);
  const pitanjeRef = useRef<HTMLParagraphElement>(null);
  const potvrdaRef = useRef<HTMLDivElement>(null);
  const id = detalj?.request.id ?? null;

  // A newly opened request starts at its title (the place of reading), without a ring.
  useEffect(() => {
    if (id) naslovRef.current?.focus({ preventScroll: false });
  }, [id]);

  // The whole confirmation comes into view (question AND both answers), then the question gets focus.
  useEffect(() => {
    if (!potvrda) return;
    potvrdaRef.current?.scrollIntoView({ block: "nearest" });
    pitanjeRef.current?.focus({ preventScroll: true });
  }, [potvrda]);

  const nazad = (
    <button
      type="button"
      onClick={onNazad}
      aria-label={t.nazadCitac}
      className="-ml-2 inline-flex min-h-12 items-center gap-1 rounded-[var(--mp-radius-dugme)] px-2 text-[1.0625rem] font-bold text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]"
    >
      <ChevronLeft aria-hidden="true" strokeWidth={2.25} className="size-6" />
      {t.nazad}
    </button>
  );

  if (detalj === undefined) {
    return (
      <section className="grid content-start gap-4" aria-busy="true">
        {nazad}
        <h1 className="sr-only">{t.ucitava}</h1>
        <UcitavanjeStanje oblik="forma" redova={4} oznaka={t.ucitava} />
      </section>
    );
  }
  if (detalj === null) {
    return (
      <section className="grid content-start gap-4">
        {nazad}
        <h1 className="sr-only">{t.nestao.naslov}</h1>
        <PraznoStanje ikonica={SearchX} nivo={2} naslov={t.nestao.naslov} opis={t.nestao.opis} />
      </section>
    );
  }

  const zahtev = detalj.request;
  const aktivan = isOpenStatus(zahtev.status);
  const naslov = vrstaNaslov(zahtev);
  const mojePreuzeto = zahtev.status === "accepted" && zahtev.acceptedBy?.isMe === true;
  const ostaloNaslov = t.ostalo[zahtev.positionKind];

  return (
    <section aria-labelledby="detalj-naslov" className="grid content-start gap-5" data-detalj={zahtev.id}>
      {nazad}

      <article className="grid gap-5 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-5 shadow-[var(--mp-senka-xs)]">
        <header className="flex items-start gap-4">
          <VrstaIkonica vrsta={zahtev.kind} velika />
          <div className="grid min-w-0 gap-1.5">
            <h1
              id="detalj-naslov"
              ref={naslovRef}
              tabIndex={-1}
              className="scroll-mt-24 text-2xl font-bold leading-tight tracking-[-0.01em] text-[var(--mp-tekst)] outline-none"
            >
              {naslov}
            </h1>
            <p className="text-[1.125rem] text-[var(--mp-tekst-sporedni)]">{mestoTekst(zahtev)}</p>
            <div>
              <StatusZahteva zahtev={zahtev} />
            </div>
          </div>
        </header>

        <VremeCelije
          od={zahtev.createdAt}
          sadaMs={sadaMs}
          oznakaVremena={t.stiglo}
          oznakaCekanja={t.ceka}
          aktivan={aktivan}
        />

        <dl className="grid gap-4 text-base">
          {zahtev.sourceLabel && zahtev.sourceLabel !== zahtev.positionLabel ? (
            <div className="grid gap-0.5">
              <dt className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.izvor}</dt>
              <dd className="text-[1.125rem] font-semibold text-[var(--mp-tekst)]">{fmt(t.kartica, { naziv: zahtev.sourceLabel })}</dd>
            </div>
          ) : null}
          {zahtev.kind === "bill" && zahtev.paymentPreference ? (
            <div className="grid gap-0.5">
              <dt className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.placanje}</dt>
              <dd className="text-[1.125rem] font-semibold text-[var(--mp-tekst)]">{d.paymentPreferences[zahtev.paymentPreference]}</dd>
            </div>
          ) : null}
          {zahtev.status === "accepted" && zahtev.acceptedBy && zahtev.acceptedAt !== null ? (
            <div className="grid gap-0.5">
              <dt className="inline-flex items-center gap-1.5 text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
                <Hand aria-hidden="true" strokeWidth={2} className="size-4" />
                {d.requestStatuses.accepted}
              </dt>
              <dd className="text-[1.125rem] font-semibold text-[var(--mp-tekst)]">
                {fmt(t.prihvacen, {
                  ime: zahtev.acceptedBy.isMe ? menuKonobarSr.red.preuzetoVi : zahtev.acceptedBy.name,
                  vreme: clockTime(zahtev.acceptedAt),
                })}
              </dd>
            </div>
          ) : null}
        </dl>

        {zahtev.kind === "order" ? (
          <section aria-labelledby="detalj-stavke" className="grid gap-3 border-t pt-4 [--border:var(--mp-ivica)]">
            <h2 id="detalj-stavke" className="text-lg font-bold text-[var(--mp-tekst)]">
              {zahtev.channel === "room_service" ? t.roomService : t.porudzbina}
            </h2>
            <ul className="grid gap-3">
              {detalj.items.map((stavka, indeks) => (
                <li key={indeks} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
                  <p className="text-[1.0625rem] font-semibold leading-snug text-[var(--mp-tekst)]">
                    <span className="tabular-nums">{stavka.quantity} ×</span> {stavka.name}
                    {stavka.variantName ? <span className="font-normal text-[var(--mp-tekst-sporedni)]"> · {stavka.variantName}</span> : null}
                  </p>
                  <p className="whitespace-nowrap text-right text-[1.0625rem] font-semibold tabular-nums text-[var(--mp-tekst)]">
                    {iznos(stavka.lineTotalRsd)}
                  </p>
                  {stavka.addons.length > 0 ? (
                    <ul className="col-span-2 grid gap-0.5 pl-6 text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
                      {stavka.addons.map((dodatak, i) => (
                        <li key={i} className="flex justify-between gap-4">
                          <span>+ {dodatak.optionName}</span>
                          {dodatak.priceDeltaRsd > 0 ? (
                            <span className="whitespace-nowrap tabular-nums">+{formatRsd(dodatak.priceDeltaRsd)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {stavka.note ? (
                    <p className="col-span-2 pl-6 text-[0.9375rem] font-semibold text-[var(--mp-tekst)]">
                      {fmt(t.napomena, { tekst: stavka.note })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <dl className="grid gap-1 border-t pt-3 text-base [--border:var(--mp-ivica)]">
              {zahtev.deliveryFeeRsd !== null && zahtev.subtotalRsd !== null ? (
                <>
                  <div className="flex justify-between gap-4 text-[var(--mp-tekst-sporedni)]">
                    <dt>{t.medjuzbir}</dt>
                    <dd className="tabular-nums">{iznos(zahtev.subtotalRsd)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 text-[var(--mp-tekst-sporedni)]">
                    <dt>{t.dostava}</dt>
                    <dd className="tabular-nums">{iznos(zahtev.deliveryFeeRsd)}</dd>
                  </div>
                </>
              ) : null}
              {zahtev.totalRsd !== null ? (
                <div className="flex justify-between gap-4 text-[1.125rem] font-bold text-[var(--mp-tekst)]">
                  <dt>{t.ukupno}</dt>
                  <dd className="whitespace-nowrap tabular-nums">{iznos(zahtev.totalRsd)}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {greska ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-base text-[var(--mp-tekst)] [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
          >
            <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-opasnost)]" />
            <p>{greska}</p>
          </div>
        ) : null}

        {aktivan ? (
          <div
            data-radnje-detalja
            className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 -mx-5 -mb-5 grid gap-3 rounded-b-[var(--mp-radius-kartica)] border-t bg-[var(--mp-povrsina)] px-5 pb-5 pt-4 shadow-[0_-8px_24px_rgb(0_0_0/0.06)] [--border:var(--mp-ivica)] lg:bottom-[-1.25rem]"
          >
            {razlogIskljucenja ? (
              <p id="detalj-razlog" className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
                {razlogIskljucenja}
              </p>
            ) : null}
            {/* Both actions of a new request sit side by side, so the sticky bar stays low. */}
            <div className={cn("grid gap-3", zahtev.status === "new" ? "grid-cols-2" : "grid-cols-1")}>
              {zahtev.status === "new" ? (
                <Dugme
                  vrsta="akcent"
                  ucitava={radi === "preuzmi"}
                  disabled={radnjeIskljucene || (radi !== null && radi !== "preuzmi")}
                  aria-describedby={razlogIskljucenja ? "detalj-razlog" : undefined}
                  onClick={onPreuzmi}
                  className="min-h-14 w-full whitespace-normal px-3 text-[1.0625rem] leading-tight"
                >
                  {t.preuzmi}
                </Dugme>
              ) : null}
              <Dugme
                vrsta={zahtev.status === "new" ? "sekundarno" : mojePreuzeto ? "primarno" : "sekundarno"}
                ucitava={radi === "zavrsi"}
                disabled={radnjeIskljucene || (radi !== null && radi !== "zavrsi")}
                aria-describedby={razlogIskljucenja ? "detalj-razlog" : undefined}
                onClick={onZavrsi}
                className="min-h-14 w-full whitespace-normal px-3 text-[1.0625rem] leading-tight"
              >
                {t.zavrsi}
              </Dugme>
            </div>

            {potvrda ? (
              <div
                ref={potvrdaRef}
                className="grid scroll-mb-28 scroll-mt-24 gap-3 rounded-[var(--mp-radius-kontrola)] border p-4 [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
              >
                <p ref={pitanjeRef} tabIndex={-1} className="text-[1.0625rem] font-bold text-[var(--mp-tekst)] outline-none">
                  {t.otkaziPitanje}
                </p>
                <p className="text-[0.9375rem] text-[var(--mp-tekst)]">{t.otkaziOpis}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Dugme vrsta="sekundarno" onClick={() => setPotvrda(false)} className="min-h-12">
                    {t.otkaziNe}
                  </Dugme>
                  <Dugme
                    vrsta="opasno"
                    ikonica={CircleSlash}
                    ucitava={radi === "otkazi"}
                    disabled={radnjeIskljucene}
                    onClick={() => onOtkazi(zahtev.status)}
                    className="min-h-12"
                  >
                    {t.otkaziDa}
                  </Dugme>
                </div>
              </div>
            ) : (
              <Dugme
                vrsta="tiho"
                ikonica={CircleSlash}
                disabled={radnjeIskljucene || radi !== null}
                onClick={() => setPotvrda(true)}
                className="min-h-12 w-full text-[var(--mp-opasnost)]"
              >
                {t.otkazi}
              </Dugme>
            )}
          </div>
        ) : (
          <p className="inline-flex items-center gap-2 text-base font-semibold text-[var(--mp-tekst)]">
            {zahtev.status === "done" ? (
              <CircleCheck aria-hidden="true" strokeWidth={2} className="size-5 text-[var(--mp-uspeh)]" />
            ) : (
              <CircleSlash aria-hidden="true" strokeWidth={2} className="size-5 text-[var(--mp-tekst-sporedni)]" />
            )}
            {zahtev.status === "done" && zahtev.doneAt !== null
              ? fmt(t.zavrsen, { vreme: clockTime(zahtev.doneAt) })
              : zahtev.cancelledAt !== null
                ? fmt(zahtev.cancelledBy === "guest" ? t.otkazanGost : t.otkazanOsoblje, { vreme: clockTime(zahtev.cancelledAt) })
                : t.zavrsenoNaslov}
          </p>
        )}
      </article>

      <section aria-labelledby="detalj-ostalo" className="grid gap-3">
        <h2 id="detalj-ostalo" className="text-lg font-bold text-[var(--mp-tekst)]">
          {ostaloNaslov}
        </h2>
        {detalj.others.length === 0 ? (
          <p className={cn("text-base text-[var(--mp-tekst-sporedni)]")}>{t.nemaOstalog}</p>
        ) : (
          <ul className="grid gap-2">
            {detalj.others.map((drugi) => (
              <li key={drugi.id}>
                <DrugiNaMestu zahtev={drugi} sadaMs={sadaMs} onOtvori={() => onOtvoriDrugi(drugi.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
