"use client";

// ScanMe Menu V1 — Izgled: the venue's brand palette (K17; master §15.2
// "palete i uloge boja namenjene brendu lokala"). The easiest way first: the
// logo (read in the browser, the image never leaves the device) gives the
// main colour. Then three roles — the main colour (required), the background
// and the text (optional) — picked or typed. The automatic contrast check
// runs on every change, right under the fields: it names the pairs that
// would read badly, marks the field that causes it and offers the way out
// (clear the field and let the menu choose); an unreadable combination
// cannot be chosen.

import { CircleCheck, ImageUp, OctagonAlert, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { brendBoje, brendUloge, paletaIzBrenda, type BrendUloge } from "@/lib/menu/identity/brand-palette";
import { jeBrendPaleta, MENU_BREND_PALETA, MENU_BREND_PALETA_TAMNA, type JavnaPaletaTon } from "@/lib/menu/identity/palettes";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { IzborSegment, POLJE_KLASA } from "../artikal/polja";
import { UzorakPalete } from "./palete";

const t = menuStudioSr.izgled.boje.brend;

type Uloga = "glavna" | "pozadina" | "tekst";
const ULOGE: readonly Uloga[] = ["glavna", "pozadina", "tekst"];
const HEX6 = /^#?([0-9a-fA-F]{6})$/;
const HEX3 = /^#?([0-9a-fA-F]{3})$/;

/** "#8c2633", "8C2633" or the short "#abc" → "#8C2633"; anything else → null. */
export function normalizujBoju(tekst: string): string | null {
  const vrednost = tekst.trim();
  const duga = HEX6.exec(vrednost);
  if (duga) return `#${duga[1].toUpperCase()}`;
  const kratka = HEX3.exec(vrednost);
  if (kratka) return `#${[...kratka[1]].map((c) => c + c).join("").toUpperCase()}`;
  return null;
}

/** The refused pairs by role (headings, text, focus, accent), each with its lowest ratio. */
export function poUlozi(greske: readonly { par: string; odnos: number; prag: number }[]) {
  const redosled = ["title", "body", "focus", "accent-text"];
  const mapa = new Map<string, { uloga: string; odnos: number; prag: number }>();
  for (const greska of greske) {
    const uloga = greska.par.split("/")[0];
    const pre = mapa.get(uloga);
    if (!pre || greska.odnos < pre.odnos) mapa.set(uloga, { uloga, odnos: greska.odnos, prag: greska.prag });
  }
  return [...mapa.values()].sort((a, b) => redosled.indexOf(a.uloga) - redosled.indexOf(b.uloga));
}

function odnos(broj: number): string {
  return broj.toLocaleString("sr-Latn-RS", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function BrendPaleta({
  paletteId,
  brandColors,
  onemoguceno,
  onSacuvaj,
}: {
  paletteId: string;
  brandColors: readonly string[] | null;
  onemoguceno: boolean;
  /** Saves the roles and makes the brand palette the menu's palette (draft). */
  onSacuvaj: (paletteId: string, brandColors: string[]) => void;
}) {
  const id = useId();
  const sacuvane = brendUloge(brandColors);
  const koristi = jeBrendPaleta(paletteId) && sacuvane !== null;
  const [otvoreno, setOtvoreno] = useState(false);
  const pocetak = (): Record<Uloga, string> => ({
    glavna: sacuvane?.akcenat ?? "",
    pozadina: sacuvane?.pozadina ?? "",
    tekst: sacuvane?.tekst ?? "",
  });
  const [unos, setUnos] = useState<Record<Uloga, string>>(pocetak);
  const [ton, setTon] = useState<JavnaPaletaTon>(paletteId === MENU_BREND_PALETA_TAMNA ? "tamna" : "svetla");
  const [logo, setLogo] = useState<"miruje" | "cita" | "greska" | "predlog">("miruje");
  const fajl = useRef<HTMLInputElement>(null);
  const okidac = useRef<HTMLButtonElement>(null);
  const zatvori = () => {
    setOtvoreno(false);
    okidac.current?.focus();
  };

  const vrednost = (uloga: Uloga) => normalizujBoju(unos[uloga]);
  const neispravna = ULOGE.filter((uloga) => unos[uloga].trim() !== "" && vrednost(uloga) === null);
  const uloge: BrendUloge | null =
    vrednost("glavna") && neispravna.length === 0
      ? { akcenat: vrednost("glavna") as string, pozadina: vrednost("pozadina"), tekst: vrednost("tekst") }
      : null;
  const ishod = uloge ? paletaIzBrenda(uloge, ton) : null;
  // The field that causes a refusal: the text the venue set, else the background it set.
  const tekstPada = Boolean(ishod && !ishod.ok && uloge?.tekst && ishod.greske.some((g) => /^(title|body)\//.test(g.par)));
  const pozadinaPada = Boolean(ishod && !ishod.ok && !tekstPada && uloge?.pozadina);
  const novId = ton === "tamna" ? MENU_BREND_PALETA_TAMNA : MENU_BREND_PALETA;
  const isto =
    koristi && uloge !== null && novId === paletteId && JSON.stringify(brendBoje(uloge)) === JSON.stringify(brandColors ?? []);
  const presudaId = `${id}-presuda`;

  const otvori = () => {
    setUnos(pocetak());
    setLogo("miruje");
    setOtvoreno(true);
  };

  const izLogotipa = async (file: File | undefined) => {
    if (!file) return;
    setLogo("cita");
    try {
      // Loaded on demand: the colour quantizer is only needed here.
      const { extractLogoProfile } = await import("@/lib/accent-palette");
      const profil = await extractLogoProfile(file);
      const boja = normalizujBoju(profil.accent ?? profil.mass[0]?.hex ?? "");
      if (!boja) throw new Error("bez boje");
      setUnos((pre) => ({ ...pre, glavna: boja }));
      setLogo("predlog");
    } catch {
      setLogo("greska");
    } finally {
      if (fajl.current) fajl.current.value = "";
    }
  };

  const okidacRed = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Dugme
        ref={okidac}
        vrsta="sekundarno"
        velicina="kompaktna"
        onClick={() => (otvoreno ? zatvori() : otvori())}
        disabled={onemoguceno}
        aria-expanded={otvoreno}
        aria-controls={`${id}-telo`}
      >
        {sacuvane ? t.izmeni : t.dodaj}
      </Dugme>
      {koristi ? (
        <p className="flex items-center gap-1.5 text-sm text-[var(--mp-tekst-sporedni)]">
          <CircleCheck aria-hidden="true" strokeWidth={2} className="size-4 text-[var(--mp-uspeh)]" />
          {t.primenjeno}
        </p>
      ) : null}
    </div>
  );
  if (!otvoreno) return okidacRed;

  return (
    <div className="grid gap-3">
      {okidacRed}
      <div
        id={`${id}-telo`}
        role="group"
        aria-labelledby={`${id}-naslov`}
        data-brend-paleta=""
        className="grid gap-4 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina-utisana)] p-3 [--border:var(--mp-ivica)] sm:p-4"
      >
        <div className="grid gap-1">
          <h3 id={`${id}-naslov`} className="text-sm font-semibold">
            {t.naslov}
          </h3>
          <p className="text-[0.8125rem] leading-snug text-[var(--mp-tekst-sporedni)]">{t.opis}</p>
        </div>

        <div className="grid gap-1">
          <div>
            <input
              ref={fajl}
              id={`${id}-logo`}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void izLogotipa(event.target.files?.[0])}
            />
            <Dugme
              vrsta="sekundarno"
              velicina="kompaktna"
              ikonica={ImageUp}
              ucitava={logo === "cita"}
              onClick={() => fajl.current?.click()}
              aria-describedby={`${id}-logo-opis`}
            >
              {logo === "cita" ? t.logotipCita : t.logotip}
            </Dugme>
          </div>
          <p id={`${id}-logo-opis`} className="text-[0.8125rem] text-[var(--mp-tekst-sporedni)]">
            {t.logotipOpis}
          </p>
          <p role="status" className="text-[0.8125rem] font-medium empty:hidden">
            {logo === "greska" ? <span className="text-[var(--mp-opasnost)]">{t.logotipGreska}</span> : logo === "predlog" ? t.logotipPredlog : null}
          </p>
        </div>

        <div className="grid gap-3">
          {ULOGE.map((uloga) => {
            const greska = neispravna.includes(uloga);
            const pada = (uloga === "tekst" && tekstPada) || (uloga === "pozadina" && pozadinaPada);
            const poljeId = `${id}-${uloga}`;
            const izvedena =
              uloga === "glavna" ? null : ishod ? (uloga === "pozadina" ? ishod.boje.page : ishod.boje.title) : null;
            const prikaz = vrednost(uloga) ?? izvedena ?? "#777777";
            const opisi = [`${poljeId}-opis`, greska ? `${poljeId}-greska` : null, pada ? presudaId : null].filter(Boolean).join(" ");
            return (
              <div key={uloga} className="grid gap-1.5">
                <label htmlFor={poljeId} className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold">
                  {t.uloge[uloga]}
                  {uloga === "glavna" ? null : <span className="text-[0.8125rem] font-normal text-[var(--mp-tekst-sporedni)]">({t.opciono})</span>}
                </label>
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="color"
                    aria-label={fmt(t.birac, { uloga: t.uloge[uloga] })}
                    value={prikaz.toLowerCase()}
                    onChange={(event) => setUnos((pre) => ({ ...pre, [uloga]: event.target.value.toUpperCase() }))}
                    className="size-11 shrink-0 cursor-pointer rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] p-1 [--border:var(--mp-ivica-kontrole)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]"
                  />
                  <input
                    id={poljeId}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={7}
                    placeholder={uloga === "glavna" ? "#8C2633" : izvedena ?? ""}
                    value={unos[uloga]}
                    aria-invalid={greska || pada || undefined}
                    aria-describedby={opisi}
                    onChange={(event) => setUnos((pre) => ({ ...pre, [uloga]: event.target.value }))}
                    className={cn(POLJE_KLASA, "min-h-11 max-w-[9rem] font-mono uppercase tabular-nums")}
                  />
                  {uloga !== "glavna" && unos[uloga] !== "" ? (
                    <button
                      type="button"
                      onClick={() => setUnos((pre) => ({ ...pre, [uloga]: "" }))}
                      aria-label={fmt(t.ocisti, { uloga: t.uloge[uloga] })}
                      title={fmt(t.ocisti, { uloga: t.uloge[uloga] })}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--mp-tekst-sporedni)] [--button-radius:999px] hover:bg-[var(--mp-povrsina)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]"
                    >
                      <X aria-hidden="true" strokeWidth={1.75} className="size-5" />
                    </button>
                  ) : null}
                </div>
                <p id={`${poljeId}-opis`} className="text-[0.8125rem] leading-snug text-[var(--mp-tekst-sporedni)]">
                  {t.ulogeOpis[uloga]}
                </p>
                {greska ? (
                  <p id={`${poljeId}-greska`} role="alert" className="text-[0.8125rem] font-medium text-[var(--mp-opasnost)]">
                    {t.neispravno}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {vrednost("pozadina") === null ? (
          <div className="grid max-w-[22rem] gap-1">
            <IzborSegment<JavnaPaletaTon>
              oznaka={t.podloga}
              vrednosti={[
                { vrednost: "svetla", tekst: t.svetla },
                { vrednost: "tamna", tekst: t.tamna },
              ]}
              izabrano={ton}
              onIzbor={setTon}
            />
            <p className="text-[0.8125rem] text-[var(--mp-tekst-sporedni)]">{t.podlogaOpis}</p>
          </div>
        ) : null}

        {ishod ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-start">
            <UzorakPalete boje={ishod.boje} />
            <div id={presudaId} role="status" data-kontrast={ishod.ok ? "ok" : "odbijeno"} className="grid gap-1.5 text-sm leading-snug">
              {ishod.ok ? (
                <p className="flex items-start gap-1.5">
                  <CircleCheck aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-uspeh)]" />
                  {t.citljivo}
                </p>
              ) : (
                <>
                  <p className="flex items-start gap-1.5 font-medium">
                    <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-opasnost)]" />
                    {t.necitljivo}
                  </p>
                  <ul className="grid list-disc gap-0.5 pl-10 text-[0.8125rem]">
                    {poUlozi(ishod.greske).map((greska) => (
                      <li key={greska.uloga}>
                        {fmt(t.par, {
                          par: (t.parovi as Record<string, string>)[greska.uloga] ?? greska.uloga,
                          odnos: odnos(greska.odnos),
                        })}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[0.8125rem]">{fmt(t.potrebno, { prag: odnos(Math.max(...ishod.greske.map((g) => g.prag))) })}</p>
                  <p className="text-[0.8125rem] text-[var(--mp-tekst-sporedni)]">{tekstPada || !pozadinaPada ? t.savetTekst : t.savetPozadina}</p>
                  {tekstPada || pozadinaPada ? (
                    <div>
                      <Dugme
                        vrsta="sekundarno"
                        velicina="kompaktna"
                        onClick={() => setUnos((pre) => ({ ...pre, [tekstPada ? "tekst" : "pozadina"]: "" }))}
                      >
                        {tekstPada ? t.izvediTekst : t.izvediPozadinu}
                      </Dugme>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Dugme
            vrsta="primarno"
            velicina="kompaktna"
            disabled={!uloge || !ishod?.ok || isto}
            aria-describedby={ishod ? presudaId : undefined}
            onClick={() => {
              if (!uloge || !ishod?.ok) return;
              onSacuvaj(novId, brendBoje(uloge));
              zatvori();
            }}
          >
            {t.primeni}
          </Dugme>
          <Dugme vrsta="tiho" velicina="kompaktna" onClick={zatvori}>
            {t.otkazi}
          </Dugme>
        </div>
      </div>
    </div>
  );
}
