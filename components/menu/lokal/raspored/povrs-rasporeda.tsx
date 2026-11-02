"use client";

// ScanMe Menu V1 (K20) — one surface of the floor layout: a zone, "Bez zone",
// or the only surface of a venue without zones (master §9.2). A grid of 24
// square cells whose height follows the content; every position is a button
// placed by percentages, so the surface fits any width (a phone too).
//
// Keyboard (the way that always works): Tab reaches the grid (one tab stop,
// roving); arrows move the focus between positions; Enter or Space selects;
// with a selected position arrows move it, Shift + arrows resize it, O flips
// the shape, U opens it, Esc lets it go (raspored-logika.ts `primeniTaster`).
// Pointer: dragging in whole cells (mouse after 4 px, finger after a short
// press so the page still scrolls). The list under the grid ("Mesta u ovoj
// zoni") is the same positions as 44 px buttons, for a small phone grid.
//
// The surface only draws and reports; Raspored owns the selection, the
// optimistic layouts and the saving.

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { Check, ChevronRight, Circle, OctagonAlert, Pencil, RectangleHorizontal, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dugme, IkonicaDugme } from "@/components/menu/zajednicko/dugme";
import { Kartica } from "@/components/menu/zajednicko/kartica";
import { fmt } from "@/lib/i18n/format";
import { menuLokalRasporedSr } from "@/lib/i18n/sr/menu-lokal-raspored";
import { compareLabels, dropAt, FLOOR_COLUMNS, toggleShape, type FloorLayout } from "@/lib/menu/floor-layout";
import { cn } from "@/lib/utils";
import { KLASE_IZABRANO, MestoNaRasporedu } from "./mesto-na-rasporedu";
import {
  brojMesta,
  pomerajUCelije,
  polozajTekst,
  prebaciIzbor,
  prikvaciPomeraj,
  primeniTaster,
  putanjaMreze,
  redosledCitanja,
  velicinaTekst,
  type PovrsRasporeda,
  type StaPromene,
} from "./raspored-logika";

const t = menuLokalRasporedSr;

// Module constants: the drag library keys its sensors on these objects.
const MIS_OGRANICENJE = { distance: 4 } as const;
const DODIR_OGRANICENJE = { delay: 200, tolerance: 8 } as const;

export type PovrsRasporedaProps = {
  povrs: PovrsRasporeda;
  /** Effective layouts of the positions of this surface. */
  layouts: ReadonlyMap<string, FloorLayout>;
  redova: number;
  /** The selected position of the whole screen (may be on another surface). */
  izabrano: string | null;
  cuvaSe: boolean;
  /** Text of the polite live region and its key (a repeated text is announced again). */
  najava: { tekst: string; n: number } | null;
  greska: string | null;
  /** Id of the help paragraph the grid is described by. */
  pomocId: string;
  /** `tiho`: the drag library announces the pick-up, so the selection is not announced again. */
  onIzaberi(id: string | null, opcije?: { tiho?: boolean }): void;
  onPromena(id: string, layout: FloorLayout, sta: StaPromene): void;
  onGranica(id: string, sta: "pomeranje" | "velicina"): void;
  /** A pointer drop on a taken spot or outside the layout. */
  onZauzeto(id: string): void;
  onAutomatski(): void;
  onOtvori(id: string): void;
  onZatvoriGresku(): void;
};

function MrezaPozadina({ redova }: { redova: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${FLOOR_COLUMNS} ${redova}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <path
        d={putanjaMreze(redova)}
        fill="none"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="[stroke:color-mix(in_oklab,var(--mp-tekst)_14%,transparent)]"
      />
    </svg>
  );
}

export function PovrsRasporeda({
  povrs,
  layouts,
  redova,
  izabrano,
  cuvaSe,
  najava,
  greska,
  pomocId,
  onIzaberi,
  onPromena,
  onGranica,
  onZauzeto,
  onAutomatski,
  onOtvori,
  onZatvoriGresku,
}: PovrsRasporedaProps) {
  const naslovId = useId();
  const dndId = useId();
  const mrezaRef = useRef<HTMLDivElement>(null);
  const dugmad = useRef(new Map<string, HTMLButtonElement>());
  const okidacRef = useRef<HTMLButtonElement>(null);
  const odustaniRef = useRef<HTMLButtonElement>(null);
  const stanjeRef = useRef({ layouts, redova });
  const [fokusId, setFokusId] = useState<string | null>(null);
  const [potvrda, setPotvrda] = useState(false);
  const [zauzetoPovlacenje, setZauzetoPovlacenje] = useState(false);
  const senzori = useSensors(
    useSensor(MouseSensor, { activationConstraint: MIS_OGRANICENJE }),
    useSensor(TouchSensor, { activationConstraint: DODIR_OGRANICENJE }),
  );

  useLayoutEffect(() => {
    stanjeRef.current = { layouts, redova };
  });
  useEffect(() => {
    if (potvrda) odustaniRef.current?.focus();
  }, [potvrda]);

  const brojPozicija = povrs.pozicije.length;
  const izabranoUOvoj = izabrano !== null && layouts.has(izabrano) ? izabrano : null;
  const izabranaPozicija = izabranoUOvoj ? povrs.pozicije.find((pozicija) => pozicija.id === izabranoUOvoj) : undefined;
  const izabranRaspored = izabranoUOvoj ? layouts.get(izabranoUOvoj) : undefined;
  // Roving tab stop: the selected position, else the last focused one, else the first in reading order.
  const tabId =
    izabranoUOvoj ?? (fokusId !== null && layouts.has(fokusId) ? fokusId : (redosledCitanja(layouts)[0] ?? null));
  const poOznaci = useMemo(
    () => [...povrs.pozicije].sort((a, b) => compareLabels(a.label, b.label)),
    [povrs.pozicije],
  );
  const nazivPovrsi = povrs.bezNaslova ? null : (povrs.zona?.name ?? t.bezZone);

  const registruj = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) dugmad.current.set(id, element);
    else dugmad.current.delete(id);
  }, []);
  const naFokus = useCallback((id: string) => setFokusId(id), []);

  const naKlik = (id: string, dugme: HTMLButtonElement) => {
    // Safari and Firefox on a Mac do not focus a clicked button; the keys need the focus.
    dugme.focus();
    setFokusId(id);
    onIzaberi(prebaciIzbor(izabrano, id));
  };

  const naTaster = (id: string, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const ishod = primeniTaster({ fokusId: id, izabranoId: izabrano, layouts }, event.key, event.shiftKey);
    if (ishod.vrsta === "nista") return;
    event.preventDefault();
    switch (ishod.vrsta) {
      case "fokus":
        dugmad.current.get(ishod.id)?.focus();
        break;
      case "izaberi":
        onIzaberi(ishod.id);
        break;
      case "izmena":
        onPromena(ishod.id, ishod.layout, ishod.sta);
        break;
      case "granica":
        onGranica(ishod.id, ishod.sta);
        break;
      case "otvori":
        onOtvori(ishod.id);
        break;
    }
  };

  const izaberiIzListe = (id: string) => {
    onIzaberi(id);
    setFokusId(id);
    dugmad.current.get(id)?.focus();
  };

  // --- Dragging ----------------------------------------------------------------

  /** Where a drag of `id` by this many pixels would land; sledece is null when the spot is taken. */
  const izracunaj = (id: string, dxPx: number, dyPx: number) => {
    const { layouts: sada, redova: redovaSada } = stanjeRef.current;
    const layout = sada.get(id);
    const mreza = mrezaRef.current;
    if (!layout || !mreza) return null;
    const { dx, dy } = pomerajUCelije({ dxPx, dyPx, celijaPx: mreza.clientWidth / FLOOR_COLUMNS, layout, redova: redovaSada });
    const druga = [...sada].filter(([drugiId]) => drugiId !== id).map(([, mesto]) => mesto);
    return { dx, dy, sledece: dx === 0 && dy === 0 ? layout : dropAt(layout, dx, dy, druga) };
  };

  /** The dragged position follows the pointer in whole cells and never leaves the grid. */
  const prikvaci: Modifier = ({ transform, active }) => {
    const { layouts: sada, redova: redovaSada } = stanjeRef.current;
    const layout = active ? sada.get(String(active.id)) : undefined;
    const mreza = mrezaRef.current;
    if (!layout || !mreza) return transform;
    return { ...transform, ...prikvaciPomeraj(transform, mreza.clientWidth / FLOOR_COLUMNS, layout, redovaSada) };
  };

  const naPocetkuPovlacenja = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setFokusId(id);
    onIzaberi(id, { tiho: true });
  };
  const naPovlacenju = ({ active, delta }: DragMoveEvent) => {
    const rezultat = izracunaj(String(active.id), delta.x, delta.y);
    setZauzetoPovlacenje(rezultat !== null && rezultat.sledece === null);
  };
  const naKrajuPovlacenja = ({ active, delta }: DragEndEvent) => {
    setZauzetoPovlacenje(false);
    const id = String(active.id);
    const rezultat = izracunaj(id, delta.x, delta.y);
    if (!rezultat || (rezultat.dx === 0 && rezultat.dy === 0)) return;
    if (rezultat.sledece) onPromena(id, rezultat.sledece, "pomeranje");
    else onZauzeto(id);
  };

  const nazivMesta = (id: string) => povrs.pozicije.find((pozicija) => pozicija.id === id)?.label ?? "";
  // The drag library speaks Serbian only; the result of a drop is announced by the live region below.
  const najave: Announcements = {
    onDragStart: ({ active }) => fmt(t.prevlacenje.podignuto, { naziv: nazivMesta(String(active.id)) }),
    onDragOver: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: () => t.prevlacenje.otkazano,
  };

  // --- Automatic arrangement -----------------------------------------------------

  const zatvoriPotvrdu = () => {
    setPotvrda(false);
    okidacRef.current?.focus();
  };
  const potvrdiAutomatski = () => {
    zatvoriPotvrdu();
    onAutomatski();
  };

  return (
    <Kartica
      as="section"
      data-povrs-rasporeda={povrs.kljuc}
      aria-labelledby={nazivPovrsi ? naslovId : undefined}
      aria-label={nazivPovrsi ? undefined : t.oblast}
      className="grid min-w-0 gap-4 [&>*]:min-w-0"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {nazivPovrsi ? (
            <h3 id={naslovId} className="text-lg font-semibold leading-snug tracking-[-0.01em] text-[var(--mp-tekst)]">
              {nazivPovrsi}
            </h3>
          ) : null}
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{brojMesta(brojPozicija)}</p>
        </div>
        {brojPozicija > 0 ? (
          <Dugme
            ref={okidacRef}
            ikonica={WandSparkles}
            velicina="kompaktna"
            aria-expanded={potvrda}
            onClick={() => setPotvrda(true)}
          >
            {t.automatski.dugme}
          </Dugme>
        ) : null}
      </header>

      {potvrda ? (
        <div
          role="group"
          aria-label={t.automatski.dugme}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              zatvoriPotvrdu();
            }
          }}
          className="flex flex-wrap items-center gap-3 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)] px-3 py-2.5"
        >
          <p className="min-w-0 flex-1 text-sm leading-snug text-[var(--mp-tekst)]">
            {povrs.bezNaslova ? t.automatski.pitanjeSve : t.automatski.pitanjeZona}
          </p>
          <div className="flex flex-wrap gap-2">
            <Dugme ref={odustaniRef} velicina="kompaktna" onClick={zatvoriPotvrdu}>
              {t.automatski.odustani}
            </Dugme>
            <Dugme vrsta="primarno" velicina="kompaktna" ikonica={WandSparkles} onClick={potvrdiAutomatski}>
              {t.automatski.potvrdi}
            </Dugme>
          </div>
        </div>
      ) : null}

      {brojPozicija === 0 ? (
        <p className="rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-4 py-6 text-center text-sm text-[var(--mp-tekst-sporedni)]">
          {t.praznaZona}
        </p>
      ) : (
        <>
          <div className="@container rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)] bg-[var(--mp-okvir)] p-1.5 sm:p-2">
            <DndContext
              id={dndId}
              sensors={senzori}
              modifiers={[prikvaci]}
              autoScroll={false}
              accessibility={{ announcements: najave, screenReaderInstructions: { draggable: t.prevlacenje.uputstvo } }}
              onDragStart={naPocetkuPovlacenja}
              onDragMove={naPovlacenju}
              onDragEnd={naKrajuPovlacenja}
              onDragCancel={() => setZauzetoPovlacenje(false)}
            >
              <div
                ref={mrezaRef}
                role="group"
                aria-label={nazivPovrsi ? fmt(t.grupa, { zona: nazivPovrsi }) : t.oblast}
                aria-describedby={pomocId}
                data-redova={redova}
                className="relative w-full"
                style={{ aspectRatio: `${FLOOR_COLUMNS} / ${redova}` }}
              >
                <MrezaPozadina redova={redova} />
                {povrs.pozicije.map((pozicija) => {
                  const layout = layouts.get(pozicija.id);
                  if (!layout) return null;
                  return (
                    <MestoNaRasporedu
                      key={pozicija.id}
                      pozicija={pozicija}
                      layout={layout}
                      redova={redova}
                      izabrano={pozicija.id === izabranoUOvoj}
                      tabIndex={pozicija.id === tabId ? 0 : -1}
                      zauzetoPovlacenje={zauzetoPovlacenje}
                      registruj={registruj}
                      onKlik={naKlik}
                      onFokus={naFokus}
                      onTaster={naTaster}
                    />
                  );
                })}
              </div>
            </DndContext>
          </div>

          {/* Below the grid on purpose: selecting or grabbing a table must not move the grid under the pointer. */}
          {izabranaPozicija && izabranRaspored ? (
            <div
              role="group"
              aria-label={t.izabrano.naslov}
              data-izabrano-traka=""
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-akcent-ivica)] bg-[var(--mp-akcent-meko)] px-3 py-2"
            >
              <p className="min-w-0 flex-1 text-sm leading-snug text-[var(--mp-tekst)]">
                <span className="font-semibold">{izabranaPozicija.label}</span>
                <span className="text-[var(--mp-tekst-sporedni)]">
                  {" · "}
                  {polozajTekst(izabranRaspored)}
                  {" · "}
                  {velicinaTekst(izabranRaspored)}
                  {" · "}
                  {t.oblik[izabranRaspored.shape]}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Dugme velicina="kompaktna" ikonica={Pencil} onClick={() => onOtvori(izabranaPozicija.id)}>
                  {t.izabrano.uredi}
                </Dugme>
                <Dugme
                  velicina="kompaktna"
                  ikonica={izabranRaspored.shape === "round" ? RectangleHorizontal : Circle}
                  onClick={() => onPromena(izabranaPozicija.id, toggleShape(izabranRaspored), "oblik")}
                >
                  {izabranRaspored.shape === "round" ? t.izabrano.uPravougaonik : t.izabrano.uKrug}
                </Dugme>
                <Dugme
                  vrsta="tiho"
                  velicina="kompaktna"
                  ikonica={X}
                  onClick={() => {
                    onIzaberi(null);
                    dugmad.current.get(izabranaPozicija.id)?.focus();
                  }}
                >
                  {t.izabrano.ponisti}
                </Dugme>
              </div>
            </div>
          ) : null}

          <p
            role="status"
            aria-live="polite"
            aria-atomic="false"
            data-najava=""
            className="min-h-5 text-sm leading-snug text-[var(--mp-tekst-sporedni)]"
          >
            {najava ? <span key={najava.n}>{najava.tekst}</span> : null}
            {cuvaSe ? <span>{najava ? " " : ""}{t.najava.cuvaSe}</span> : null}
          </p>

          {greska ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] py-2 pl-3 pr-1"
            >
              <OctagonAlert
                aria-hidden="true"
                strokeWidth={2}
                className="mt-2.5 size-4 shrink-0 text-[var(--mp-opasnost)]"
              />
              <p className="min-w-0 flex-1 py-2 text-sm leading-snug text-[var(--mp-tekst)]">{greska}</p>
              <IkonicaDugme ikonica={X} oznaka={t.zatvori} onClick={onZatvoriGresku} />
            </div>
          ) : null}

          <details className="group rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)]" data-lista-mesta="">
            <summary className="flex min-h-[var(--mp-meta)] cursor-pointer list-none items-center gap-2 rounded-[var(--mp-radius-kontrola)] px-3 text-sm font-semibold text-[var(--mp-tekst)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mp-fokus)] [&::-webkit-details-marker]:hidden">
              <ChevronRight
                aria-hidden="true"
                strokeWidth={1.75}
                className="size-4 shrink-0 transition-transform duration-[var(--mp-trajanje-1)] group-open:rotate-90 motion-reduce:transition-none"
              />
              {fmt(povrs.bezNaslova ? t.lista.sva : t.lista.zona, { n: brojPozicija })}
            </summary>
            <div className="grid gap-3 px-3 pb-3">
              <p className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{t.lista.opis}</p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {poOznaci.map((pozicija) => {
                  const jeIzabrano = pozicija.id === izabranoUOvoj;
                  const mesto = layouts.get(pozicija.id);
                  return (
                    <li key={pozicija.id} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={jeIzabrano}
                        data-lista-mesto={pozicija.id}
                        onClick={() => izaberiIzListe(pozicija.id)}
                        className={cn(
                          "flex min-h-[var(--mp-meta)] w-full items-center justify-between gap-3 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-left text-sm text-[var(--mp-tekst)] [--button-radius:var(--mp-radius-kontrola)]",
                          jeIzabrano
                            ? KLASE_IZABRANO
                            : "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] hover:bg-[var(--mp-povrsina-utisana)]",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {jeIzabrano ? <Check aria-hidden="true" strokeWidth={3} className="size-4 shrink-0" /> : null}
                          <span className="truncate font-semibold">{pozicija.label}</span>
                        </span>
                        {mesto ? (
                          <span className="shrink-0 text-xs text-[var(--mp-tekst-sporedni)]">{polozajTekst(mesto)}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        </>
      )}
    </Kartica>
  );
}
