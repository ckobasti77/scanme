"use client";

// ScanMe Menu V1 (K27) — Operativa of the client panel in the izlog: the real
// screen over invented data (fixtures/operativa-panel.ts). The filters, the
// open detail and the clock are local; "Podseti konobara" answers after 400 ms
// as if it went out and records the reminder in memory, so the card shows
// "Podsetnik poslat · 18:27" and the next one waits five minutes. Nothing is
// sent anywhere; a reload starts over.

import { useMemo, useState } from "react";
import { fixtureVenue, IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { fixtureRequests } from "@/components/menu/fixtures/operativa";
import { fixtureOperacije } from "@/components/menu/fixtures/operativa-panel";
import { BEZ_FILTERA, type OperacijeFilteri, type OperacijePodaci } from "@/lib/menu/operations-view";
import { useSat } from "../konobar/use-sat";
import { Operativa, type OperativaDetalj, type OperativaPingIshod } from "../panel/operativa/operativa";

/** The lines of a request as the server's `requestDetail` would give them; null for a request that is not there. */
function detaljIzFiksture(id: string): OperativaDetalj | null {
  const request = fixtureRequests(fixtureVenue("restaurant")).find((kandidat) => kandidat.id === id);
  if (!request) return null;
  return {
    sourceLabel: null,
    subtotalRsd:
      request.totalRsd !== null && request.deliveryFeeRsd !== null ? request.totalRsd - request.deliveryFeeRsd : null,
    deliveryFeeRsd: request.deliveryFeeRsd,
    items: request.items.map((stavka) => ({
      name: stavka.name,
      variantName: stavka.variantName,
      addons: stavka.addons.map((dodatak) => dodatak.optionName),
      quantity: stavka.quantity,
      lineTotalRsd: stavka.lineTotalRsd,
      note: stavka.note,
    })),
  };
}

export function OperativaIzlog({
  sadrzaj,
  pingPoslat,
  zahtev,
  filteriOtvoreni,
  konobarHref,
}: {
  sadrzaj: "paznja" | "mirno";
  /** The late order already carries a reminder sent two minutes ago. */
  pingPoslat: boolean;
  /** A request of the fixtures whose detail starts open (`zahtev=rq_05`). */
  zahtev: string | null;
  /** The drawer with the filters (telephone) starts open. */
  filteriOtvoreni: boolean;
  konobarHref: string;
}) {
  const sadaMs = useSat(IZLOG_SADA, { izlogOd: IZLOG_SADA });
  const osnovni = useMemo(() => fixtureOperacije({ sadrzaj, pingPoslat }), [sadrzaj, pingPoslat]);
  const [filteri, setFilteri] = useState<OperacijeFilteri>(BEZ_FILTERA);
  const [izabranId, setIzabranId] = useState<string | null>(() =>
    zahtev !== null && osnovni.requests.some((red) => red.id === zahtev) ? zahtev : null,
  );
  // Reminders "sent" in this session, on top of the fixtures.
  const [poslati, setPoslati] = useState<Record<string, { at: number; seen: boolean }>>({});

  const podaci = useMemo<OperacijePodaci>(
    () => ({
      ...osnovni,
      requests: osnovni.requests.map((red) => (poslati[red.id] ? { ...red, lastPing: poslati[red.id] } : red)),
    }),
    [osnovni, poslati],
  );

  const detalj = useMemo(() => (izabranId === null ? undefined : detaljIzFiksture(izabranId)), [izabranId]);

  const onPing = async (id: string): Promise<OperativaPingIshod> => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    setPoslati((tekuci) => ({ ...tekuci, [id]: { at: sadaMs, seen: false } }));
    return { ok: true, sentAt: sadaMs };
  };

  return (
    <div data-operativa-izlog="">
      <Operativa
        podaci={podaci}
        nowMs={sadaMs}
        filteri={filteri}
        onFilteri={setFilteri}
        izabranId={izabranId}
        onIzaberi={setIzabranId}
        detalj={detalj}
        onPing={onPing}
        konobarHref={konobarHref}
        pocetnoFilteriOtvoreni={filteriOtvoreni}
      />
    </div>
  );
}
