"use client";

// ScanMe Menu V1 — the page column (K10; master §3.2, §13.4). `Kompletan meni`
// first, then the other standard pages; adding a page happens only here.
// Rename, duplicate, move, archive and delete live in each page's menu. A page
// an active QR card points at cannot be deleted or archived: the menu still
// offers the action and explains why it is blocked, instead of hiding it.
// Room service is never one of these pages: it has its own group, `Posebne
// usluge`, shown only when it is switched on.

import {
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  BedDouble,
  Copy,
  FileText,
  MoreHorizontal,
  PencilLine,
  Plus,
  QrCode,
  Archive,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { StudioIshod, StudioStranica } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { StudioDijalog } from "../dijalog";
import { MeniRadnji, type StavkaMenija } from "../meni-radnji";
import { NazivPolje } from "../naziv-polje";
import { porukaGreske } from "../red-artikla/red-artikla";

const t = menuStudioSr;

export type StraniceRadnje = {
  dodaj: (naziv: string) => Promise<StudioIshod<{ id: string }>>;
  preimenuj: (id: string, naziv: string, ocekivano: string) => Promise<StudioIshod>;
  dupliraj: (id: string) => Promise<StudioIshod<{ id: string }>>;
  premesti: (id: string, naIndeks: number) => Promise<StudioIshod>;
  arhiviraj: (id: string) => Promise<StudioIshod>;
  vrati: (id: string) => Promise<StudioIshod>;
  obrisi: (id: string) => Promise<StudioIshod>;
};

type Potvrda = { vrsta: "obrisi" | "arhiviraj"; stranica: StudioStranica } | null;

// K33: where the focus goes when the rename / add field closes (the field replaced these buttons).
const stranicaDugmeId =(id: string) => `studio-stranica-${id}`;
const DODAJ_STRANICU_ID = "studio-stranica-dodaj";

const stavkaKlase =
  "flex min-h-[var(--mp-meta)] w-full min-w-0 items-center gap-2 rounded-[var(--mp-radius-kontrola)] px-3 text-left text-[0.9375rem] font-medium [--button-radius:var(--mp-radius-kontrola)] transition-colors duration-[var(--mp-trajanje-1)] motion-reduce:transition-none";

export function StraniceKolona({
  stranice,
  izabrana,
  roomService,
  roomServiceIzabran,
  mozeUredjivanje,
  radnje,
  onIzaberi,
  onRoomService,
}: {
  stranice: readonly StudioStranica[];
  /** Id of the page open in the work area (null while Room service is open). */
  izabrana: string | null;
  roomService: boolean;
  roomServiceIzabran: boolean;
  mozeUredjivanje: boolean;
  radnje: StraniceRadnje;
  onIzaberi: (id: string) => void;
  onRoomService: () => void;
}) {
  const [dodaje, setDodaje] = useState(false);
  const [preimenuje, setPreimenuje] = useState<string | null>(null);
  const [potvrda, setPotvrda] = useState<Potvrda>(null);
  const [radi, setRadi] = useState(false);
  const [poruka, setPoruka] = useState<{ ton: "greska" | "info"; tekst: string } | null>(null);

  const aktivne = stranice.filter((stranica) => !stranica.arhivirana);
  const arhivirane = stranice.filter((stranica) => stranica.arhivirana);

  const izvrsi = async (rad: () => Promise<StudioIshod<unknown>>) => {
    setRadi(true);
    const ishod = await rad();
    setRadi(false);
    if (!ishod.ok) {
      setPoruka({
        ton: "greska",
        tekst:
          ishod.vrsta === "greska"
            ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano)
            : fmt(t.opste.nazivKonflikt, { naziv: String(ishod.sacuvano ?? "") }),
      });
    } else {
      setPoruka(null);
    }
    return ishod;
  };

  const stavkeMenija = (stranica: StudioStranica): StavkaMenija[] => {
    const indeks = stranice.findIndex((s) => s.id === stranica.id);
    const stavke: StavkaMenija[] = [];
    if (stranica.arhivirana) {
      stavke.push({ kljuc: "vrati", tekst: t.stranice.vrati, ikonica: ArchiveRestore, onIzbor: () => void izvrsi(() => radnje.vrati(stranica.id)) });
    } else {
      stavke.push(
        { kljuc: "preimenuj", tekst: t.stranice.preimenuj, ikonica: PencilLine, onIzbor: () => setPreimenuje(stranica.id) },
        {
          kljuc: "dupliraj",
          tekst: t.stranice.dupliraj,
          ikonica: Copy,
          onIzbor: () =>
            void izvrsi(async () => {
              const ishod = await radnje.dupliraj(stranica.id);
              if (ishod.ok) onIzaberi(ishod.vrednost.id);
              return ishod;
            }),
        },
      );
      if (indeks > 0) {
        stavke.push({ kljuc: "gore", tekst: t.stranice.gore, ikonica: ArrowUp, onIzbor: () => void izvrsi(() => radnje.premesti(stranica.id, indeks - 1)) });
      }
      if (indeks < stranice.length - 1) {
        stavke.push({ kljuc: "dole", tekst: t.stranice.dole, ikonica: ArrowDown, onIzbor: () => void izvrsi(() => radnje.premesti(stranica.id, indeks + 1)) });
      }
      stavke.push({ kljuc: "arhiviraj", tekst: t.stranice.arhiviraj, ikonica: Archive, onIzbor: () => setPotvrda({ vrsta: "arhiviraj", stranica }) });
    }
    stavke.push({ kljuc: "obrisi", tekst: t.stranice.obrisi, ikonica: Trash2, opasno: true, onIzbor: () => setPotvrda({ vrsta: "obrisi", stranica }) });
    return stavke;
  };

  const blokada = (stranica: StudioStranica): string | null => {
    if (stranica.imaQr) return t.stranice.imaQrRazlog;
    if (!stranica.arhivirana && aktivne.length <= 1) return t.stranice.poslednjaRazlog;
    return null;
  };

  const red = (stranica: StudioStranica) => {
    const aktivna = !roomServiceIzabran && stranica.id === izabrana;
    if (preimenuje === stranica.id) {
      return (
        <li key={stranica.id} className="py-1">
          <NazivPolje
            pocetno={stranica.naziv}
            oznaka={t.stranice.nazivOznaka}
            potvrda={t.stranice.sacuvaj}
            otkazi={t.stranice.otkazi}
            maks={MENU_TEXT.pageName}
            greskaPrazno={t.opste.nazivObavezan}
            greskaDugo={fmt(t.opste.nazivDug, { n: MENU_TEXT.pageName })}
            vratiFokusNa={stranicaDugmeId(stranica.id)}
            onSacuvaj={(naziv) => {
              setPreimenuje(null);
              void izvrsi(() => radnje.preimenuj(stranica.id, naziv, stranica.naziv));
            }}
            onOtkazi={() => setPreimenuje(null)}
          />
        </li>
      );
    }
    return (
      <li key={stranica.id} className="flex items-center gap-1" data-stranica={stranica.key}>
        <button
          type="button"
          id={stranicaDugmeId(stranica.id)}
          aria-current={aktivna ? "page" : undefined}
          onClick={() => onIzaberi(stranica.id)}
          className={cn(
            stavkaKlase,
            aktivna
              ? "bg-[var(--mp-akcent-meko)] font-semibold text-[var(--mp-tekst)]"
              : "text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]",
          )}
        >
          <FileText aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{stranica.naziv}</span>
          {stranica.imaQr ? (
            <>
              <QrCode aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-[var(--mp-tekst-sporedni)]" />
              <span className="sr-only">{`, ${t.stranice.imaQr}`}</span>
            </>
          ) : null}
        </button>
        {mozeUredjivanje ? (
          <MeniRadnji
            okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={fmt(t.stranice.radnje, { naziv: stranica.naziv })} />}
            stavke={stavkeMenija(stranica)}
          />
        ) : null}
      </li>
    );
  };

  const potvrdaBlokada = potvrda ? blokada(potvrda.stranica) : null;

  return (
    <nav aria-labelledby="studio-stranice-naslov" className="grid content-start gap-3" data-stranice-kolona="">
      <h2 id="studio-stranice-naslov" className="px-1 text-base font-semibold tracking-[-0.01em]">
        {t.stranice.naslov}
      </h2>
      <ul className="grid gap-1">{aktivne.map(red)}</ul>

      {mozeUredjivanje ? (
        dodaje ? (
          <NazivPolje
            pocetno=""
            oznaka={t.stranice.nazivNove}
            primer={t.stranice.primer}
            potvrda={t.stranice.potvrdiDodavanje}
            otkazi={t.stranice.otkazi}
            maks={MENU_TEXT.pageName}
            greskaPrazno={t.opste.nazivObavezan}
            greskaDugo={fmt(t.opste.nazivDug, { n: MENU_TEXT.pageName })}
            radi={radi}
            vratiFokusNa={DODAJ_STRANICU_ID}
            onSacuvaj={async (naziv) => {
              const ishod = await izvrsi(() => radnje.dodaj(naziv));
              if (ishod.ok) {
                setDodaje(false);
                onIzaberi((ishod.vrednost as { id: string }).id);
                setPoruka({ ton: "info", tekst: fmt(t.stranice.dodato, { naziv }) });
              }
            }}
            onOtkazi={() => setDodaje(false)}
          />
        ) : (
          <Dugme
            id={DODAJ_STRANICU_ID}
            vrsta="tiho"
            velicina="kompaktna"
            ikonica={Plus}
            onClick={() => setDodaje(true)}
            className="justify-start rounded-[var(--mp-radius-kontrola)] px-3 [--button-radius:var(--mp-radius-kontrola)]"
          >
            {t.stranice.dodaj}
          </Dugme>
        )
      ) : null}

      {poruka ? (
        <p
          role={poruka.ton === "greska" ? "alert" : "status"}
          className={cn(
            "px-1 text-sm leading-snug",
            poruka.ton === "greska" ? "font-medium text-[var(--mp-opasnost)]" : "text-[var(--mp-tekst-sporedni)]",
          )}
        >
          {poruka.tekst}
        </p>
      ) : null}

      {roomService ? (
        <section aria-labelledby="studio-posebne-usluge" className="grid gap-1 border-t pt-3 [--border:var(--mp-ivica)]">
          <h3 id="studio-posebne-usluge" className="px-1 text-sm font-semibold text-[var(--mp-tekst-sporedni)]">
            {t.stranice.posebneUsluge}
          </h3>
          <button
            type="button"
            aria-current={roomServiceIzabran ? "page" : undefined}
            onClick={onRoomService}
            data-room-service=""
            className={cn(
              stavkaKlase,
              roomServiceIzabran
                ? "bg-[var(--mp-akcent-meko)] font-semibold"
                : "hover:bg-[var(--mp-povrsina-utisana)]",
            )}
          >
            <BedDouble aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
            <span className="min-w-0 flex-1">{t.stranice.roomService}</span>
          </button>
        </section>
      ) : null}

      {arhivirane.length > 0 ? (
        <details className="group border-t pt-3 [--border:var(--mp-ivica)]">
          <summary className="flex min-h-[var(--mp-meta)] cursor-pointer items-center rounded-[var(--mp-radius-kontrola)] px-1 text-sm font-semibold text-[var(--mp-tekst-sporedni)] hover:bg-[var(--mp-povrsina-utisana)]">
            {fmt(t.stranice.arhivirane, { n: arhivirane.length })}
          </summary>
          <ul className="mt-1 grid gap-1">{arhivirane.map(red)}</ul>
        </details>
      ) : null}

      <StudioDijalog
        otvoreno={potvrda !== null}
        onOtvoreno={(otvoreno) => (otvoreno ? undefined : setPotvrda(null))}
        naslov={
          potvrda
            ? fmt(potvrda.vrsta === "obrisi" ? t.stranice.potvrdaBrisanjaNaslov : t.stranice.potvrdaArhiviranjaNaslov, {
                naziv: potvrda.stranica.naziv,
              })
            : ""
        }
        podnozje={
          <>
            <Dugme vrsta="tiho" onClick={() => setPotvrda(null)}>
              {t.stranice.otkazi}
            </Dugme>
            {potvrda && !potvrdaBlokada ? (
              <Dugme
                vrsta={potvrda.vrsta === "obrisi" ? "opasno" : "primarno"}
                ucitava={radi}
                onClick={async () => {
                  const { vrsta, stranica } = potvrda;
                  const ishod = await izvrsi(() =>
                    vrsta === "obrisi" ? radnje.obrisi(stranica.id) : radnje.arhiviraj(stranica.id),
                  );
                  setPotvrda(null);
                  if (ishod.ok && stranica.id === izabrana) {
                    const sledeca = aktivne.find((s) => s.id !== stranica.id);
                    if (sledeca) onIzaberi(sledeca.id);
                  }
                }}
              >
                {potvrda.vrsta === "obrisi" ? t.stranice.obrisiPotvrda : t.stranice.arhivirajPotvrda}
              </Dugme>
            ) : null}
          </>
        }
      >
        {potvrda ? (
          potvrdaBlokada ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 text-[0.9375rem] leading-relaxed [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]"
            >
              <QrCode aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-[var(--mp-upozorenje)]" />
              {potvrdaBlokada}
            </p>
          ) : (
            <div className="grid gap-2 text-[0.9375rem] leading-relaxed">
              <p>{potvrda.vrsta === "obrisi" ? t.stranice.potvrdaBrisanjaOpis : t.stranice.potvrdaArhiviranjaOpis}</p>
              {potvrda.stranica.podrazumevana ? <p className="text-[var(--mp-tekst-sporedni)]">{t.stranice.predajaGlavne}</p> : null}
            </div>
          )
        ) : null}
      </StudioDijalog>
    </nav>
  );
}
