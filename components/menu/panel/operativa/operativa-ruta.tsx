"use client";

// ScanMe Menu V1 (K27) — the route side of Operativa: the one subscription of
// the screen (convex/menuPanel.ts `operations`), the detail of the open request
// (`requestDetail`, only while a drawer is open) and the reminder (`ping`). The
// query never reads the clock, so the device passes `fromMs` — the start of the
// current Belgrade hour minus 12 h, like the waiter panel — which changes once
// an hour; "late", "reminder allowed" and "today" are worked out on the device
// every second (lib/menu/operations-view.ts). The screen itself is
// presentational (operativa.tsx); the izlog mounts it over fixtures.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { BEZ_FILTERA, type OperacijeFilteri } from "@/lib/menu/operations-view";
import { konobarskiPanelUlazHref } from "@/lib/menu/panel-nav";
import { okvirOd } from "../../konobar/rezervacije/okvir-vremena";
import { useSat } from "../../konobar/use-sat";
import { GreskaStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { usePanelKontekst } from "../ruta";
import { Operativa, type OperativaPingIshod } from "./operativa";

const t = menuPanelSr.operativa;

export function OperativaRuta() {
  const { slug, menuServiceId } = usePanelKontekst();
  const { isLoading } = useConvexAuth();
  const [pocetnoMs] = useState(() => Date.now());
  const nowMs = useSat(pocetnoMs);
  const [filteri, setFilteri] = useState<OperacijeFilteri>(BEZ_FILTERA);
  const [izabranId, setIzabranId] = useState<string | null>(null);

  const podaci = useQuery(api.menuPanel.operations, isLoading ? "skip" : { menuServiceId, fromMs: okvirOd(nowMs) });
  const detalj = useQuery(
    api.menuPanel.requestDetail,
    izabranId !== null && !isLoading ? { menuServiceId, requestId: izabranId as Id<"menuRequests"> } : "skip",
  );
  const pingMutacija = useMutation(api.menuPanel.ping);

  const onPing = useCallback(
    async (id: string): Promise<OperativaPingIshod> => {
      try {
        const ishod = await pingMutacija({ menuServiceId, requestId: id as Id<"menuRequests"> });
        if (ishod.ok) return { ok: true, sentAt: ishod.sentAt };
        return ishod.lastAt === undefined
          ? { ok: false, code: ishod.code }
          : { ok: false, code: ishod.code, lastAt: ishod.lastAt };
      } catch (error) {
        // An access refusal is thrown as ConvexError(code); anything else is a lost connection.
        if (error instanceof ConvexError && typeof error.data === "string") return { ok: false, code: error.data };
        return { ok: false, code: "mreza" };
      }
    },
    [menuServiceId, pingMutacija],
  );

  if (podaci === undefined) return <UcitavanjeStanje oznaka={t.ucitavanje} />;
  if (podaci === null) return <GreskaStanje naslov={t.greskaNaslov} />;

  return (
    <Operativa
      podaci={podaci}
      nowMs={nowMs}
      filteri={filteri}
      onFilteri={setFilteri}
      izabranId={izabranId}
      onIzaberi={setIzabranId}
      detalj={detalj}
      onPing={onPing}
      konobarHref={konobarskiPanelUlazHref(slug)}
    />
  );
}
