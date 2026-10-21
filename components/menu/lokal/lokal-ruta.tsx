"use client";

// ScanMe Menu V1 (K20) — the route side of "Lokal i QR" (master §9, §13.6).
// Mounted by /[slug]/client-panel/meni/lokal inside the panel shell (which
// already checked sign-in and role). Two subscriptions (convex/menuFloor.ts
// `overview`, convex/menuQr.ts `listCards`), the mutations as LokalRadnje, and
// the open view in the address (`?pogled=`, replace: no history entry). The
// screen itself is presentational (lokal-ekran.tsx); the izlog mounts the
// same screen over an in-memory store.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalIshod, LokalPodaci, LokalPogled, LokalRadnje } from "@/lib/menu/lokal/model";
import { GreskaStanje, UcitavanjeStanje } from "../zajednicko/stanja";
import { LokalEkran } from "./lokal-ekran";

const t = menuLokalSr.ruta;

async function ishod(rad: () => Promise<unknown>): Promise<LokalIshod> {
  try {
    await rad();
    return { ok: true };
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return { ok: false, code: error.data };
    return { ok: false, code: "mreza" };
  }
}

const praznaPretplata = () => () => {};

function useOrigin(): string {
  return useSyncExternalStore(
    praznaPretplata,
    () => window.location.origin,
    () => "",
  );
}

export function LokalRuta({
  slug,
  pocetniPogled,
  podaciLokala,
}: {
  slug: string;
  pocetniPogled: LokalPogled;
  /** K27: the card "Podaci o lokalu za Menu", shown right below the header. */
  podaciLokala?: ReactNode;
}) {
  const { isLoading } = useConvexAuth();
  const args = isLoading ? "skip" : { slug };
  const pregled = useQuery(api.menuFloor.overview, args);
  const kartice = useQuery(api.menuQr.listCards, args);
  const [pogled, setPogledStanje] = useState<LokalPogled>(pocetniPogled);
  const qrOrigin = useOrigin();

  const createPosition = useMutation(api.menuFloor.createPosition);
  const createPositions = useMutation(api.menuFloor.createPositions);
  const updatePosition = useMutation(api.menuFloor.updatePosition);
  const archivePosition = useMutation(api.menuFloor.archivePosition);
  const setLayout = useMutation(api.menuFloor.setLayout);
  const setLayouts = useMutation(api.menuFloor.setLayouts);
  const createZone = useMutation(api.menuFloor.createZone);
  const renameZone = useMutation(api.menuFloor.renameZone);
  const moveZone = useMutation(api.menuFloor.moveZone);
  const archiveZone = useMutation(api.menuFloor.archiveZone);
  const mintCards = useMutation(api.menuQr.mintCards);
  const linkCard = useMutation(api.menuQr.linkCard);
  const setCardActive = useMutation(api.menuQr.setCardActive);

  const radnje = useMemo<LokalRadnje>(() => {
    const zona = (id: string | null) => (id === null ? null : (id as Id<"menuZones">));
    const mesto = (id: string) => id as Id<"menuPositions">;
    return {
      createPosition: (input) =>
        ishod(() =>
          createPosition({ slug, kind: input.kind, label: input.label, seats: input.seats, zoneId: zona(input.zoneId) }),
        ),
      createPositions: (input) =>
        ishod(() =>
          createPositions({
            slug,
            kind: input.kind,
            prefix: input.prefix,
            from: input.from,
            count: input.count,
            seats: input.seats,
            zoneId: zona(input.zoneId),
          }),
        ),
      updatePosition: (positionId, change) =>
        ishod(() =>
          updatePosition({
            positionId: mesto(positionId),
            ...(change.label !== undefined ? { label: change.label } : {}),
            ...(change.kind !== undefined ? { kind: change.kind } : {}),
            ...(change.seats !== undefined ? { seats: change.seats } : {}),
            ...(change.zoneId !== undefined ? { zoneId: zona(change.zoneId) } : {}),
          }),
        ),
      archivePosition: (positionId) => ishod(() => archivePosition({ positionId: mesto(positionId) })),
      setLayout: (positionId, layout) => ishod(() => setLayout({ positionId: mesto(positionId), layout })),
      setLayouts: (items) =>
        ishod(() =>
          setLayouts({ slug, items: items.map((item) => ({ positionId: mesto(item.positionId), layout: item.layout })) }),
        ),
      createZone: (name) => ishod(() => createZone({ slug, name })),
      renameZone: (zoneId, name) => ishod(() => renameZone({ zoneId: zoneId as Id<"menuZones">, name })),
      moveZone: (zoneId, direction) => ishod(() => moveZone({ zoneId: zoneId as Id<"menuZones">, direction })),
      archiveZone: (zoneId) => ishod(() => archiveZone({ zoneId: zoneId as Id<"menuZones"> })),
      mintForPositions: (positionIds, pageKey) =>
        ishod(() => mintCards({ slug, positionIds: positionIds.map(mesto), pageKey })),
      mintForPage: (pageKey, count) => ishod(() => mintCards({ slug, pageKey, count })),
      linkCard: (cardId, link) =>
        ishod(() =>
          linkCard({
            cardId: cardId as Id<"cards">,
            pageKey: link.pageKey,
            positionId: link.positionId === null ? null : mesto(link.positionId),
          }),
        ),
      setCardActive: (cardId, active) => ishod(() => setCardActive({ cardId: cardId as Id<"cards">, active })),
    };
  }, [
    slug,
    createPosition,
    createPositions,
    updatePosition,
    archivePosition,
    setLayout,
    setLayouts,
    createZone,
    renameZone,
    moveZone,
    archiveZone,
    mintCards,
    linkCard,
    setCardActive,
  ]);

  const onPogled = useCallback((sledeci: LokalPogled) => {
    setPogledStanje(sledeci);
    const url = new URL(window.location.href);
    if (sledeci === "lista") url.searchParams.delete("pogled");
    else url.searchParams.set("pogled", sledeci);
    window.history.replaceState(null, "", url);
  }, []);

  if (pregled === undefined || kartice === undefined) return <UcitavanjeStanje oznaka={t.ucitavanje} />;
  if (pregled === null || kartice === null) {
    return <GreskaStanje naslov={t.greskaNaslov} opis={t.greskaOpis} />;
  }

  const podaci: LokalPodaci = {
    zones: pregled.zones,
    positions: pregled.positions,
    cards: kartice.cards,
    pages: kartice.pages,
    cardsTruncated: kartice.truncated,
  };

  return (
    <LokalEkran
      podaci={podaci}
      radnje={radnje}
      pogled={pogled}
      onPogled={onPogled}
      qrOrigin={qrOrigin}
      meniHref={`/${slug}/meni`}
      podaciLokala={podaciLokala}
    />
  );
}
