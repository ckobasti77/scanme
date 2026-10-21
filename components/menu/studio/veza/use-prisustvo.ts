"use client";

// ScanMe Menu V1 — presence in the app (K18, K09 §4.7; convex/menuPresence.ts).
// While the editor is open this person's session sends a heartbeat every 20 s
// and whenever the open entity changes (an article detail, a page, Room
// service), and leaves on `pagehide`. Everyone reads ONE subscription per
// service, with the clock quantized to 15 s (queries never read the clock).
// Only people who may edit send a heartbeat (it needs menu.edit); anyone who
// may read the editor sees the list. A signal, never a lock: nothing waits on it.

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { StudioEntitetPrisustva, StudioPrisutan } from "@/lib/menu/studio/model";
import { drugiUEditoru, nowBucket, PRISUSTVO_KORAK_MS, PRISUSTVO_OTKUCAJ_MS } from "@/lib/menu/studio/presence-view";

const SESIJA_KLJUC = "scanme-meni-sesija";

/** One id per browser tab (sessionStorage), the pattern menuPresence accepts. */
function sesija(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const postojeca = window.sessionStorage.getItem(SESIJA_KLJUC);
    if (postojeca && /^[A-Za-z0-9_-]{8,64}$/.test(postojeca)) return postojeca;
    const nova = window.crypto.randomUUID();
    window.sessionStorage.setItem(SESIJA_KLJUC, nova);
    return nova;
  } catch {
    // Storage blocked: a fresh id for this page view still works.
    return typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : null;
  }
}

// The clock, one step per 15 s (an external store, never read during render).
let korak = 0;
function pretplatiKorak(promena: () => void): () => void {
  korak = Date.now();
  const handle = setInterval(() => {
    korak = Date.now();
    promena();
  }, PRISUSTVO_KORAK_MS);
  return () => clearInterval(handle);
}

export function usePrisustvo(
  menuServiceId: Id<"menuServices"> | undefined,
  entitet: StudioEntitetPrisustva | null,
  saljeOtkucaj: boolean,
): readonly StudioPrisutan[] | undefined {
  const heartbeat = useMutation(api.menuPresence.heartbeat);
  const leave = useMutation(api.menuPresence.leave);
  const [sessionId] = useState(sesija);
  const sada = useSyncExternalStore(pretplatiKorak, () => korak, () => 0);
  const lista = useQuery(
    api.menuPresence.listForService,
    menuServiceId && sada > 0 ? { menuServiceId, nowBucket: nowBucket(sada) } : "skip",
  );
  const vrsta = entitet?.vrsta ?? null;
  const key = entitet?.key ?? null;

  useEffect(() => {
    if (!menuServiceId || !saljeOtkucaj || !sessionId) return;
    const posalji = () => {
      void heartbeat({ menuServiceId, sessionId, ...(vrsta && key ? { entityType: vrsta, entityKey: key } : {}) }).catch(() => undefined);
    };
    posalji();
    const handle = setInterval(posalji, PRISUSTVO_OTKUCAJ_MS);
    return () => clearInterval(handle);
  }, [heartbeat, menuServiceId, saljeOtkucaj, sessionId, vrsta, key]);

  useEffect(() => {
    if (!menuServiceId || !saljeOtkucaj || !sessionId) return;
    const izadji = () => {
      void leave({ menuServiceId, sessionId }).catch(() => undefined);
    };
    window.addEventListener("pagehide", izadji);
    return () => {
      window.removeEventListener("pagehide", izadji);
      izadji();
    };
  }, [leave, menuServiceId, saljeOtkucaj, sessionId]);

  return useMemo(
    () =>
      lista
        ? drugiUEditoru(
            lista.entries.map((unos) => ({ ...unos, userId: unos.userId as string })),
            sada,
          )
        : undefined,
    [lista, sada],
  );
}
