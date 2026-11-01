"use client";

// ScanMe Menu V1 (K28) — the card "Link konobarskog panela" of Tim i pristupi
// (plan docs/meni/planovi/K24.md §4.6): the QR code and the address staff open on
// a phone or tablet, "Kopiraj link", and "Promeni link", which asks first because
// the old link stops working and every device of the staff is signed out. Before
// the link exists the card says so and offers "Napravi link". Presentational: the
// actions come from `radnje`.

import { CircleCheck, Copy, Link2, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { Napomena, PorukaGreske, PorukaUspeha, Potvrda } from "../../lokal/zajednicko";
import { QrSlika } from "../../lokal/qr-slika";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { CuvanjeStatus, porukaKoda, useCuvanje } from "../cuvanje";
import type { TimLink, TimRadnje } from "./model";

const t = menuPanelSr.tim.linkPanela;
const tim = menuPanelSr.tim;

/** How long "Link je kopiran." stays on the screen. */
const TRAJANJE_PORUKE_MS = 6000;

type Kopiranje = "mirno" | "kopirano" | "neuspelo";

/** A "Kopiraj" button with its polite status line; the text is copied to the clipboard. */
export function KopirajLink({
  tekst,
  oznaka,
  kopirano,
  neuspelo,
}: {
  tekst: string;
  oznaka: string;
  kopirano: string;
  neuspelo: string;
}) {
  const [stanje, setStanje] = useState<Kopiranje>("mirno");

  useEffect(() => {
    if (stanje === "mirno") return;
    const rukovanje = window.setTimeout(() => setStanje("mirno"), TRAJANJE_PORUKE_MS);
    return () => window.clearTimeout(rukovanje);
  }, [stanje]);

  const kopiraj = async () => {
    try {
      await navigator.clipboard.writeText(tekst);
      setStanje("kopirano");
    } catch {
      setStanje("neuspelo");
    }
  };

  return (
    <div className="grid min-w-0 justify-items-start gap-1">
      <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Copy} onClick={kopiraj}>
        {oznaka}
      </Dugme>
      <div role="status" aria-live="polite" className="min-h-6 text-sm">
        {stanje === "kopirano" ? (
          <span className="inline-flex items-start gap-1.5 font-medium text-[var(--mp-tekst)]">
            <CircleCheck aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-uspeh)]" />
            <span className="min-w-0">{kopirano}</span>
          </span>
        ) : null}
        {stanje === "neuspelo" ? (
          <span className="inline-flex items-start gap-1.5 font-medium text-[var(--mp-tekst)]">
            <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-upozorenje)]" />
            <span className="min-w-0">{neuspelo}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function LinkPanela({
  link,
  moze,
  radnje,
  pocetnoPromeni = false,
}: {
  /** undefined while loading, null before the link exists. */
  link: TimLink | undefined;
  /** The role may set up the waiter panel (`staff.pin`). */
  moze: boolean;
  radnje: Pick<TimRadnje, "napraviLink" | "promeniLink">;
  /** Open with the "Promeni link" confirmation already asked (the izlog's `modal=link-panela`). */
  pocetnoPromeni?: boolean;
}) {
  const { faza, kod, pokreni } = useCuvanje();
  const [pita, setPita] = useState(pocetnoPromeni);
  const [odjavljeno, setOdjavljeno] = useState<number | null>(null);
  // "Promeni link" is replaced by the question while it is open: after "Odustani" focus goes back once the button is there again.
  const promeniRef = useRef<HTMLButtonElement>(null);
  const vratiFokus = useRef(false);

  useEffect(() => {
    if (pita || !vratiFokus.current) return;
    vratiFokus.current = false;
    promeniRef.current?.focus();
  }, [pita]);

  const napravi = () => void pokreni(() => radnje.napraviLink());

  const promeni = async () => {
    const ishod = await pokreni(async () => {
      const odgovor = await radnje.promeniLink();
      if (odgovor.ok) setOdjavljeno(odgovor.endedSessions);
      return odgovor.ok ? { ok: true } : odgovor;
    });
    if (ishod?.ok) setPita(false);
  };

  return (
    <Kartica data-link-panela="">
      <OkvirSekcije naslov={t.naslov} opis={t.opis} nivo={2}>
        {link === undefined ? (
          <UcitavanjeStanje oblik="forma" redova={2} oznaka={tim.ucitavanje} />
        ) : (
          <div className="grid gap-4">
            {!moze ? <Napomena>{tim.osoblje.resetSamoVlasnik}</Napomena> : null}

            {link === null ? (
              <div className="grid justify-items-start gap-3">
                <p className="text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.nemaLinka}</p>
                <Dugme
                  vrsta="primarno"
                  ikonica={Link2}
                  disabled={!moze}
                  ucitava={faza === "cuva"}
                  onClick={napravi}
                >
                  {t.napravi}
                </Dugme>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid justify-items-start gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-1">
                  <div className="aspect-square w-full max-w-48 overflow-hidden rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)] bg-white p-1">
                    <QrSlika url={link.url} naslov={t.qrOznaka} className="block size-full" />
                  </div>
                  <div className="grid w-full min-w-0 content-start gap-3">
                    <p
                      data-link-adresa=""
                      title={link.url}
                      className="min-w-0 max-w-full select-all break-all rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-2 text-[0.9375rem] leading-relaxed text-[var(--mp-tekst)]"
                    >
                      {link.url}
                    </p>
                    <KopirajLink tekst={link.url} oznaka={t.kopiraj} kopirano={t.kopirano} neuspelo={t.kopiranjeNeuspelo} />
                  </div>
                </div>

                {pita ? (
                  <Potvrda
                    tekst={`${t.promeniNaslov} ${t.promeniOpis}`}
                    potvrdi={t.promeniPotvrdi}
                    odustani={t.odustani}
                    radi={faza === "cuva"}
                    onPotvrdi={() => void promeni()}
                    onOdustani={() => {
                      vratiFokus.current = true;
                      setPita(false);
                    }}
                  />
                ) : (
                  <div>
                    <Dugme
                      ref={promeniRef}
                      vrsta="sekundarno"
                      velicina="kompaktna"
                      ikonica={RefreshCw}
                      disabled={!moze}
                      onClick={() => setPita(true)}
                    >
                      {t.promeni}
                    </Dugme>
                  </div>
                )}
              </div>
            )}

            <PorukaUspeha tekst={odjavljeno === null ? null : fmt(t.odjavljeno, { broj: odjavljeno })} />
            <CuvanjeStatus faza={faza} cuva={tim.clanovi.cuva} sacuvano={tim.clanovi.sacuvano} />
            {faza === "greska" && kod !== null ? <PorukaGreske>{porukaKoda(kod, t.greska)}</PorukaGreske> : null}
          </div>
        )}
      </OkvirSekcije>
    </Kartica>
  );
}
