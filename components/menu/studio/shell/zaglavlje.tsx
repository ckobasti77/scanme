"use client";

// ScanMe Menu V1 — the editor's header (K10; master §13.4: `Ponuda` and
// `Izgled`, and `Pregled`, the save state and `Objavi` always at hand). From
// 1024 px the panel shows only an icon rail while the Editor is open, so the
// header carries the venue name and the mode line (MENU-UX §8). The save
// state is the publish seam (SavObjave, MENU-UX §1.1); on a phone a single
// line says the same in less space.
// K18: next to the seam — "Nacrt iz verzije N" after a restore (guests see
// it only after Objavi), `Verzije` (previous publications, restore) and who
// else is in the editor. The same draft status feeds Početna (K27).

import { CircleCheck, Eye, History, LoaderCircle, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { useSyncExternalStore } from "react";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { fmt } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import type { AutosaveZbir } from "@/lib/menu/studio/autosave-queue";
import { kadaTekst } from "@/lib/menu/studio/kada";
import type { StudioStatusNacrta } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { SavObjave } from "../../zajednicko/sav-objave";
import { OfflineTraka } from "../../zajednicko/stanja";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { PrisustvoZaglavlje } from "../prisustvo/prisustvo";
import { Segmenti } from "./segmenti";
import type { StudioSirina } from "./use-sirina";

const t = menuStudioSr;
const z = menuZajednickoSr;

export type StudioTab = "ponuda" | "izgled";

// The time of day for "danas u 14:32", refreshed once a minute (never read
// during render: the clock is an external store).
let minut = 0;
function pretplatiMinut(promena: () => void): () => void {
  minut = Date.now();
  const handle = setInterval(() => {
    minut = Date.now();
    promena();
  }, 60_000);
  return () => clearInterval(handle);
}
function useSadaMinut(): number {
  return useSyncExternalStore(pretplatiMinut, () => minut, () => 0);
}

export function StudioZaglavlje({
  lokal,
  rezim,
  sirina,
  tab,
  onTab,
  panelId,
  cuvanje,
  status,
  povezano,
  mozeObjavu,
  prikaziPregled,
  onPonovo,
  onPregled,
  onObjavi,
  onVerzije = null,
  prisutni = [],
  sada: sadaSpolja,
  onIdiNaKonflikt = null,
}: {
  lokal: string;
  rezim: string;
  sirina: StudioSirina;
  tab: StudioTab;
  onTab: (tab: StudioTab) => void;
  panelId: string;
  cuvanje: AutosaveZbir;
  status: StudioStatusNacrta | undefined;
  povezano: boolean;
  mozeObjavu: boolean;
  /** The `Pregled` button (not on a phone, where Pregled is a pane). */
  prikaziPregled: boolean;
  /** "Pokušaj ponovo" for failed saves; absent while only conflicts wait (they need a choice in the field). */
  onPonovo?: () => void;
  onPregled: () => void;
  onObjavi: () => void;
  /** K18: opens the previous publications; null = never published (nothing to show). */
  onVerzije?: (() => void) | null;
  /** K18: other people in this editor now, once each, by name. */
  prisutni?: readonly { id: string; ime: string }[];
  /** K18: the editor's clock (the izlog's fixed instant), so header and dialogs agree. */
  sada?: number;
  /** K18: only conflicts wait (no failed save): "Idi na izbor" leads to the first one. */
  onIdiNaKonflikt?: (() => void) | null;
}) {
  const satZaglavlja = useSadaMinut();
  const sada = sadaSpolja ?? satZaglavlja;
  const imaIzmena = status ? status.stanje !== "clean" : false;
  const objavljeno =
    status?.objavljenaVerzija && status.objavljenoU
      ? {
          broj: status.objavljenaVerzija,
          kada: sada ? kadaTekst(status.objavljenoU, sada, t.zaglavlje) : "",
        }
      : null;

  const o = t.objavljivanje;
  const vracenoIz = status?.vracenoIz ?? null;
  const nacrtIz =
    vracenoIz !== null && imaIzmena ? (
      <span title={o.nacrtIzOpis} data-nacrt-iz={vracenoIz} className="inline-flex">
        <StatusOznaka ton="info" ikonica={RotateCcw} velicina="mala">
          {fmt(o.nacrtIz, { broj: vracenoIz })}
        </StatusOznaka>
        <span className="sr-only">{o.nacrtIzOpis}</span>
      </span>
    ) : null;
  const verzije = onVerzije ? (
    <Dugme
      vrsta="tiho"
      velicina="kompaktna"
      ikonica={History}
      onClick={onVerzije}
      title={o.verzije.dugmeOznaka}
      className={sirina === "telefon" ? "-my-2" : undefined}
      data-verzije-dugme=""
    >
      {o.verzije.dugme}
    </Dugme>
  ) : null;
  const tabovi = (
    <Segmenti<StudioTab>
      oznaka={t.zaglavlje.rezimi}
      idPrefiks="studio-tab"
      kontrolise={panelId}
      izabrano={tab}
      onIzbor={onTab}
      vrednosti={[
        { vrednost: "ponuda", tekst: t.zaglavlje.ponuda },
        { vrednost: "izgled", tekst: t.zaglavlje.izgled },
      ]}
    />
  );
  const objavi = (
    <Dugme
      vrsta="primarno"
      ikonica={Upload}
      onClick={onObjavi}
      disabled={!mozeObjavu}
      title={mozeObjavu ? undefined : t.zaglavlje.bezObjave}
      data-objavi=""
    >
      {t.zaglavlje.objavi}
    </Dugme>
  );

  if (sirina === "telefon") {
    const Ikonica = cuvanje.stanje === "cuva-se" ? LoaderCircle : cuvanje.stanje === "greska" ? TriangleAlert : CircleCheck;
    return (
      <div className="grid gap-2" data-studio-zaglavlje="telefon">
        <div className="flex items-center justify-between gap-2">
          {tabovi}
          {objavi}
        </div>
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-[var(--mp-tekst-sporedni)]">
          <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5">
            <Ikonica
              aria-hidden="true"
              strokeWidth={2}
              className={cn(
                "size-4",
                cuvanje.stanje === "cuva-se" && "animate-spin motion-reduce:animate-none",
                cuvanje.stanje === "greska" ? "text-[var(--mp-opasnost)]" : cuvanje.stanje === "sacuvano" && "text-[var(--mp-uspeh)]",
              )}
            />
            <span className={cn(cuvanje.stanje === "greska" && "font-semibold text-[var(--mp-tekst)]")}>
              {cuvanje.stanje === "cuva-se"
                ? z.cuvanje.cuvaSe
                : cuvanje.stanje === "greska"
                  ? onIdiNaKonflikt
                    ? o.konflikt.cekaIzbor
                    : z.cuvanje.nijeSacuvano
                  : z.cuvanje.sacuvano}
            </span>
          </span>
          <span aria-hidden="true">·</span>
          <span>{imaIzmena ? z.objava.imaIzmena : z.objava.bezIzmena}</span>
          {cuvanje.stanje === "greska" && onPonovo ? (
            <Dugme vrsta="tiho" velicina="kompaktna" onClick={onPonovo} className="-my-2">
              {z.stanja.pokusajPonovo}
            </Dugme>
          ) : cuvanje.stanje === "greska" && onIdiNaKonflikt ? (
            <Dugme vrsta="tiho" velicina="kompaktna" onClick={onIdiNaKonflikt} className="-my-2" data-idi-na-konflikt="">
              {o.konflikt.idiNaIzbor}
            </Dugme>
          ) : null}
        </p>
        {nacrtIz || verzije || prisutni.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {nacrtIz}
            {verzije}
            <PrisustvoZaglavlje osobe={prisutni} />
          </div>
        ) : null}
        {!povezano ? <OfflineTraka /> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-studio-zaglavlje={sirina}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {sirina === "usko" ? (
          tabovi
        ) : (
          <div className="grid min-w-0 gap-0.5">
            <p className="truncate text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em]">{lokal}</p>
            <p data-rezim="" className="truncate text-sm text-[var(--mp-tekst-sporedni)]">
              {rezim}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {prikaziPregled ? (
            <Dugme vrsta="sekundarno" ikonica={Eye} onClick={onPregled} data-pregled-dugme="">
              {t.zaglavlje.pregled}
            </Dugme>
          ) : null}
          {objavi}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {sirina === "usko" ? null : tabovi}
        <SavObjave
          objavljeno={objavljeno}
          neobjavljeneIzmene={imaIzmena ? "ima" : 0}
          cuvanje={cuvanje.stanje}
          onPonovo={onPonovo}
          akcija={
            cuvanje.stanje === "greska" && !onPonovo && onIdiNaKonflikt ? (
              <Dugme vrsta="tiho" velicina="kompaktna" onClick={onIdiNaKonflikt} className="-my-1.5" data-idi-na-konflikt="">
                {o.konflikt.idiNaIzbor}
              </Dugme>
            ) : undefined
          }
        />
        {nacrtIz}
        {verzije}
        <PrisustvoZaglavlje osobe={prisutni} className="ml-auto" />
      </div>
      {!povezano ? <OfflineTraka /> : null}
    </div>
  );
}
