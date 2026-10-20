"use client";

// ScanMe Menu V1 (K20) — "Lokal i QR" in the izlog: the real screen
// (components/menu/lokal/lokal-ekran.tsx) over invented venues
// (components/menu/fixtures/lokal-qr.ts) and an in-memory store that applies
// the same rules as convex/menuFloor.ts and convex/menuQr.ts
// (lib/menu/lokal/memorija.ts). Nothing is sent anywhere; a reload starts over.

import { useCallback, useMemo, useRef, useState } from "react";
import { fixtureLokalPodaci } from "@/components/menu/fixtures/lokal-qr";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import type { LokalPreviewParams } from "@/lib/menu/izlog-params";
import {
  memorijaOd,
  primeniRadnju,
  type LokalMemorija,
  type LokalRadnjaMemorije,
} from "@/lib/menu/lokal/memorija";
import type { LokalPogled, LokalRadnje } from "@/lib/menu/lokal/model";
import { LokalEkran } from "../lokal/lokal-ekran";

/** The fictional origin the izlog's QR codes encode. */
export const LOKAL_IZLOG_QR_ORIGIN = "https://scanme.rs";

export function LokalIzlog({ params }: { params: LokalPreviewParams }) {
  const [memorija, setMemorija] = useState<LokalMemorija>(() =>
    memorijaOd(fixtureLokalPodaci(params.stanje ?? "restoran"), {
      podrazumevanaOznaka: menuDomenSr.qrCardDefaultLabel,
    }),
  );
  const tekuca = useRef(memorija);
  // Every action runs on the LATEST state (two quick actions never lose one).
  const izvrsi = useCallback((radnja: LokalRadnjaMemorije) => {
    const { stanje, ishod } = primeniRadnju(tekuca.current, radnja);
    tekuca.current = stanje;
    setMemorija(stanje);
    return Promise.resolve(ishod);
  }, []);
  const radnje = useMemo<LokalRadnje>(
    () => ({
      createPosition: (input) => izvrsi({ vrsta: "createPosition", input }),
      createPositions: (input) => izvrsi({ vrsta: "createPositions", input }),
      updatePosition: (positionId, change) => izvrsi({ vrsta: "updatePosition", positionId, change }),
      archivePosition: (positionId) => izvrsi({ vrsta: "archivePosition", positionId }),
      setLayout: (positionId, layout) => izvrsi({ vrsta: "setLayout", positionId, layout }),
      setLayouts: (items) => izvrsi({ vrsta: "setLayouts", items }),
      createZone: (name) => izvrsi({ vrsta: "createZone", name }),
      renameZone: (zoneId, name) => izvrsi({ vrsta: "renameZone", zoneId, name }),
      moveZone: (zoneId, direction) => izvrsi({ vrsta: "moveZone", zoneId, direction }),
      archiveZone: (zoneId) => izvrsi({ vrsta: "archiveZone", zoneId }),
      mintForPositions: (positionIds, pageKey) => izvrsi({ vrsta: "mintForPositions", positionIds, pageKey }),
      mintForPage: (pageKey, count) => izvrsi({ vrsta: "mintForPage", pageKey, count }),
      linkCard: (cardId, link) => izvrsi({ vrsta: "linkCard", cardId, link }),
      setCardActive: (cardId, active) => izvrsi({ vrsta: "setCardActive", cardId, active }),
    }),
    [izvrsi],
  );
  const [pogled, setPogled] = useState<LokalPogled>(params.pogled);
  const onPogled = useCallback((sledeci: LokalPogled) => {
    setPogled(sledeci);
    const url = new URL(window.location.href);
    url.searchParams.set("pogled", sledeci);
    window.history.replaceState(null, "", url);
  }, []);

  // `?fokus=pozicija` opens the drawer of "Sto 12" (or the first position) once, at start.
  const [pocetnaPozicija] = useState<string | null>(() => {
    if (!params.fokusPozicija) return null;
    const pozicije = memorija.podaci.positions;
    return (pozicije.find((pozicija) => pozicija.label === "Sto 12") ?? pozicije[0])?.id ?? null;
  });

  return (
    <div data-lokal-izlog="">
      <LokalEkran
        podaci={memorija.podaci}
        radnje={radnje}
        pogled={pogled}
        onPogled={onPogled}
        qrOrigin={LOKAL_IZLOG_QR_ORIGIN}
        meniHref="/dev/menu-public-preview"
        pocetnaPozicija={pocetnaPozicija}
        pocetnaStampa={params.stampa}
      />
    </div>
  );
}
