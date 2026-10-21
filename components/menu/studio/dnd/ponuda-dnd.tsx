"use client";

// ScanMe Menu V1 — dragging in `Ponuda` (K11; master §13.4, K09 §4.3). One
// DndContext per page: sections move among sections, articles inside a
// section and between sections. While an article is dragged the layout lives
// here (ids only, lib/menu/reorder.ts); on drop the move is described as the
// server stores it (placement, target section, the placement it now stands
// before) and handed to the work area, which shows it at once and saves it.
// While a section is dragged every section is shown collapsed, so the targets
// are short and even. A collapsed section takes an article on its header (to
// its end). Esc cancels a drag. Screen readers hear every step in Serbian; the
// keyboard way to move is `Premesti`, not the drag.

import {
  closestCenter,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import {
  planIzRasporeda,
  pomeriPrevlacenjem,
  postaviNaMesto,
  pozicijaPrikaza,
  rasporedIz,
  type PlanPremestanja,
  type Raspored,
} from "@/lib/menu/reorder";
import type { StudioRed, StudioSekcija } from "@/lib/menu/studio/model";
import { OverlayReda, OverlaySekcije } from "./drag-overlay-kartica";
import { DODIR_OGRANICENJE, MIS_OGRANICENJE, StudioMouseSensor, StudioTouchSensor } from "./senzori";
import { useSmanjenPokret } from "./use-smanjen-pokret";

const t = menuStudioSr;

/** Sortable id of a section (rows use their placement id). */
export const SEKCIJA_PREFIKS = "s:";
export const sekcijaDndId = (sekcijaId: string) => `${SEKCIJA_PREFIKS}${sekcijaId}`;

export type DndPodaci = { vrsta: "red"; prikazId: string; sekcijaId: string } | { vrsta: "sekcija"; sekcijaId: string };

export type DndAktivno = { vrsta: "red"; prikazId: string } | { vrsta: "sekcija"; sekcijaId: string } | null;

export type DndStanje = {
  aktivno: DndAktivno;
  /** A collapsed or empty section the dragged article would land in (its header is highlighted). */
  ciljSekcija: string | null;
};

function podaciOd(data: unknown): DndPodaci | null {
  const value = (data as { current?: unknown } | undefined)?.current as DndPodaci | undefined;
  return value && (value.vrsta === "red" || value.vrsta === "sekcija") ? value : null;
}

/** Rows first (the pointer is over a card), then the section under the pointer, then the closest target. */
export const studioKolizija: CollisionDetection = (args) => {
  const vrsta = podaciOd(args.active.data)?.vrsta;
  if (vrsta === "sekcija") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => podaciOd(container.data)?.vrsta === "sekcija"),
    });
  }
  const ispod = pointerWithin(args);
  const vrstaSudara = (id: UniqueIdentifier) => podaciOd(args.droppableContainers.find((container) => container.id === id)?.data)?.vrsta;
  const redovi = ispod.filter((sudar) => vrstaSudara(sudar.id) === "red");
  if (redovi.length > 0) return redovi;
  if (ispod.length > 0) return ispod;
  return closestCenter(args);
};

function sekcijeIzRasporeda(sekcije: readonly StudioSekcija[], raspored: Raspored): StudioSekcija[] {
  const redovi = new Map<string, StudioRed>();
  for (const sekcija of sekcije) for (const red of sekcija.redovi) redovi.set(red.prikazId, red);
  return sekcije.map((sekcija) => {
    const ids = raspored.find((candidate) => candidate.id === sekcija.id)?.redovi;
    if (!ids) return sekcija;
    const isto = ids.length === sekcija.redovi.length && ids.every((id, index) => sekcija.redovi[index].prikazId === id);
    return isto ? sekcija : { ...sekcija, redovi: ids.map((id) => redovi.get(id)!).filter(Boolean) };
  });
}

export function PonudaDnd({
  sekcije,
  jeSkupljena,
  onPremestiRed,
  onPremestiSekciju,
  children,
}: {
  /** All sections of the page as shown (pending moves applied, no search filter). */
  sekcije: readonly StudioSekcija[];
  jeSkupljena: (sekcijaId: string) => boolean;
  onPremestiRed: (plan: PlanPremestanja) => void;
  onPremestiSekciju: (sekcijaId: string, naIndeks: number) => void;
  children: (sekcijeTokom: readonly StudioSekcija[], stanje: DndStanje) => ReactNode;
}) {
  const id = useId();
  const smanjenPokret = useSmanjenPokret();
  const sensors = useSensors(
    useSensor(StudioMouseSensor, { activationConstraint: MIS_OGRANICENJE }),
    useSensor(StudioTouchSensor, { activationConstraint: DODIR_OGRANICENJE }),
  );
  const [aktivno, setAktivno] = useState<DndAktivno>(null);
  const [raspored, setRaspored] = useState<Raspored | null>(null);
  const [ciljSekcija, setCiljSekcija] = useState<string | null>(null);
  const pocetni = useRef<Raspored | null>(null);
  const tekuci = useRef<Raspored | null>(null);
  const kraj = useRef<string | null>(null);
  const sekcijeRef = useRef(sekcije);
  useLayoutEffect(() => {
    sekcijeRef.current = sekcije;
  });

  const sekcijeTokom = useMemo(
    () => (raspored && aktivno?.vrsta === "red" ? sekcijeIzRasporeda(sekcije, raspored) : sekcije),
    [sekcije, raspored, aktivno],
  );

  const ponisti = useCallback(() => {
    setAktivno(null);
    setRaspored(null);
    setCiljSekcija(null);
    pocetni.current = null;
    tekuci.current = null;
  }, []);

  const postaviRaspored = (sledeci: Raspored) => {
    if (sledeci === tekuci.current) return;
    tekuci.current = sledeci;
    setRaspored(sledeci);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const podaci = podaciOd(active.data);
    kraj.current = null;
    if (podaci?.vrsta === "red") {
      const pocetak = rasporedIz(sekcijeRef.current);
      pocetni.current = pocetak;
      tekuci.current = pocetak;
      setRaspored(pocetak);
      setAktivno({ vrsta: "red", prikazId: podaci.prikazId });
    } else if (podaci?.vrsta === "sekcija") {
      setAktivno({ vrsta: "sekcija", sekcijaId: podaci.sekcijaId });
    }
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const podaci = podaciOd(active.data);
    const sada = tekuci.current;
    if (podaci?.vrsta !== "red" || !sada || !over) return;
    const meta = podaciOd(over.data);
    const gde = pozicijaPrikaza(sada, podaci.prikazId);
    if (!meta || !gde) return;
    if (meta.vrsta === "sekcija") {
      if (jeSkupljena(meta.sekcijaId)) {
        setCiljSekcija(meta.sekcijaId === gde.sekcijaId ? null : meta.sekcijaId);
        return;
      }
      setCiljSekcija(null);
      postaviRaspored(pomeriPrevlacenjem(sada, podaci.prikazId, { vrsta: "sekcija", sekcijaId: meta.sekcijaId }));
      return;
    }
    setCiljSekcija(null);
    const kod = pozicijaPrikaza(sada, meta.prikazId);
    // Inside one section the sortable strategy shows the gap; the order is taken on drop.
    if (!kod || kod.sekcijaId === gde.sekcijaId) return;
    const pomeren = active.rect.current.translated;
    const posle = pomeren ? pomeren.top + pomeren.height / 2 > over.rect.top + over.rect.height / 2 : false;
    postaviRaspored(pomeriPrevlacenjem(sada, podaci.prikazId, { vrsta: "red", prikazId: meta.prikazId, posle }));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const podaci = podaciOd(active.data);
    if (podaci?.vrsta === "sekcija") {
      const ids = sekcijeRef.current.map((sekcija) => sekcija.id);
      const meta = over ? podaciOd(over.data) : null;
      if (meta?.vrsta === "sekcija" && meta.sekcijaId !== podaci.sekcijaId) {
        const naIndeks = ids.indexOf(meta.sekcijaId);
        if (naIndeks !== -1) {
          kraj.current = fmt(t.dnd.spustenaSekcija, { naziv: nazivSekcije(podaci.sekcijaId), mesto: naIndeks + 1, ukupno: ids.length });
          onPremestiSekciju(podaci.sekcijaId, naIndeks);
        }
      }
      ponisti();
      return;
    }
    const pocetak = pocetni.current;
    let konacni = tekuci.current;
    if (podaci?.vrsta === "red" && pocetak && konacni && over) {
      const meta = podaciOd(over.data);
      if (ciljSekcija) {
        const cilj = konacni.find((sekcija) => sekcija.id === ciljSekcija);
        if (cilj) konacni = postaviNaMesto(konacni, podaci.prikazId, cilj.id, cilj.redovi.length);
      } else if (meta?.vrsta === "red") {
        konacni = pomeriPrevlacenjem(konacni, podaci.prikazId, { vrsta: "red", prikazId: meta.prikazId, posle: false });
      }
      const plan = planIzRasporeda(pocetak, konacni, podaci.prikazId);
      const gde = pozicijaPrikaza(konacni, podaci.prikazId);
      if (gde) {
        kraj.current = fmt(t.dnd.spusteno, {
          naziv: nazivReda(podaci.prikazId),
          sekcija: nazivSekcije(gde.sekcijaId),
          mesto: gde.indeks + 1,
          ukupno: gde.ukupno,
        });
      }
      if (plan) onPremestiRed(plan);
    }
    ponisti();
  };

  function nazivReda(prikazId: string): string {
    for (const sekcija of sekcijeRef.current) {
      const red = sekcija.redovi.find((candidate) => candidate.prikazId === prikazId);
      if (red) return red.artikal.naziv;
    }
    return "";
  }
  function nazivSekcije(sekcijaId: string): string {
    return sekcijeRef.current.find((sekcija) => sekcija.id === sekcijaId)?.naziv ?? "";
  }
  function nazivAktivnog(active: { data: unknown }): string {
    const podaci = podaciOd(active.data);
    if (!podaci) return "";
    return podaci.vrsta === "red" ? nazivReda(podaci.prikazId) : nazivSekcije(podaci.sekcijaId);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => fmt(t.dnd.podignuto, { naziv: nazivAktivnog(active) }),
    onDragOver: ({ active, over }) => {
      const naziv = nazivAktivnog(active);
      const meta = over ? podaciOd(over.data) : null;
      if (!meta) return fmt(t.dnd.vanListe, { naziv });
      if (podaciOd(active.data)?.vrsta === "sekcija") return fmt(t.dnd.kodSekcije, { naziv, cilj: nazivSekcije(meta.sekcijaId) });
      if (meta.vrsta === "sekcija") return fmt(t.dnd.naKrajSekcije, { naziv, sekcija: nazivSekcije(meta.sekcijaId) });
      return fmt(t.dnd.kodArtikla, { naziv, cilj: nazivReda(meta.prikazId), sekcija: nazivSekcije(meta.sekcijaId) });
    },
    onDragEnd: ({ active }) => kraj.current ?? fmt(t.dnd.otkazano, { naziv: nazivAktivnog(active) }),
    onDragCancel: ({ active }) => fmt(t.dnd.otkazano, { naziv: nazivAktivnog(active) }),
  };

  const aktivniRed =
    aktivno?.vrsta === "red"
      ? sekcije.flatMap((sekcija) => sekcija.redovi).find((red) => red.prikazId === aktivno.prikazId) ?? null
      : null;
  const aktivnaSekcija = aktivno?.vrsta === "sekcija" ? sekcije.find((sekcija) => sekcija.id === aktivno.sekcijaId) ?? null : null;

  return (
    <DndContext
      id={id}
      // Always the same sensors (dnd-kit keys an effect on them); while dragging is
      // off every sortable is disabled and has no listeners, so nothing can start.
      sensors={sensors}
      collisionDetection={studioKolizija}
      measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t.dnd.uputstvo } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={ponisti}
    >
      <SortableContext items={sekcijeTokom.map((sekcija) => sekcijaDndId(sekcija.id))} strategy={verticalListSortingStrategy}>
        {children(sekcijeTokom, { aktivno, ciljSekcija })}
      </SortableContext>
      <DragOverlay dropAnimation={smanjenPokret ? null : undefined}>
        {aktivniRed ? <OverlayReda red={aktivniRed} smanjenPokret={smanjenPokret} /> : null}
        {aktivnaSekcija ? <OverlaySekcije sekcija={aktivnaSekcija} smanjenPokret={smanjenPokret} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
