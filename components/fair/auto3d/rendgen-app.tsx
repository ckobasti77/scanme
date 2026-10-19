"use client";

// Klijentski koren stranice /sajam/3d (A03 §4): jedan store, adresa i istorija (E9), globalni
// tasteri, aria-live najava i raspored (studio + panel). Server daje poster i početno stanje iz URL-a.
// A10: sat vođene ture, sat kioska i dugme ture u zaglavlju (van kioska).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FairToast, useFairToast } from "@/components/fair/fair-toast";
import { historyOp, PART_ENTRY_MARK, searchOf } from "@/lib/auto3d/history";
import { initialState } from "@/lib/auto3d/state";
import { parseUrlState, type UrlState } from "@/lib/auto3d/url-state";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { announcement } from "./copy";
import { useKioskRunner } from "./kiosk-runner";
import { PartsPanel } from "./parts-panel";
import { Auto3dStoreContext, createAuto3dStore, useAuto3d, useAuto3dStore, type Auto3dStore } from "./store";
import { Studio } from "./studio";
import { TourButton } from "./tour-button";
import { useTourRunner } from "./tour-runner";
import { restoreFocus, SEARCH_ID, tabPanelId } from "./ui-bits";
import type { ModelFiles } from "./viewer-island";
import styles from "./auto3d.module.css";

type HistoryMark = { a3?: string } | null;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable=true]") !== null;
}

/** Adresa prati stanje: push pri otvaranju dela, back pri zatvaranju, inače replace (E9). */
function bindHistory(store: Auto3dStore): () => void {
  let prev = store.getState();
  let expectingBack = false;
  let applyingPop = false;
  const href = (search: string) => `${window.location.pathname}${search}`;
  const replace = (search: string) => {
    const mark = (window.history.state as HistoryMark)?.a3;
    window.history.replaceState(mark ? { a3: mark } : null, "", href(search));
  };

  const sync = () => {
    const next = store.getState();
    const before = prev;
    prev = next;
    const search = searchOf(next);
    if (applyingPop) {
      if (search !== window.location.search) replace(search);
      return;
    }
    const op = historyOp(before, next, window.location.search);
    if (op === "push") {
      window.history.pushState({ a3: PART_ENTRY_MARK }, "", href(search));
      store.dispatch({ type: "pushed", pushed: true });
    } else if (op === "back") {
      expectingBack = true;
      window.history.back();
    } else if (op === "replace") replace(search);
  };

  const onPop = (e: PopStateEvent) => {
    if (expectingBack) {
      // Nazad posle zatvaranja dela: unos ispod je stanje pre otvaranja; adresa dobija sadašnje stanje.
      expectingBack = false;
      const search = searchOf(store.getState());
      if (search !== window.location.search) replace(search);
      return;
    }
    applyingPop = true;
    try {
      store.dispatch({ type: "url", url: parseUrlState(new URLSearchParams(window.location.search)) });
      const marked = (e.state as HistoryMark)?.a3 === PART_ENTRY_MARK;
      store.dispatch({ type: "pushed", pushed: marked && store.getState().part !== null });
    } finally {
      applyingPop = false;
    }
  };

  const unsubscribe = store.subscribe(sync);
  window.addEventListener("popstate", onPop);
  return () => {
    unsubscribe();
    window.removeEventListener("popstate", onPop);
  };
}

function openList(store: Auto3dStore) {
  store.dispatch({ type: "list", open: true });
  requestAnimationFrame(() => document.getElementById(SEARCH_ID)?.focus());
}

export function RendgenApp({
  initialUrl,
  intro,
  poster,
  posterExploded,
  models,
}: {
  initialUrl: UrlState;
  /** Naslov i uvod (server); van kioska dobija dugme ture. */
  intro: ReactNode;
  poster: ReactNode;
  posterExploded: ReactNode;
  models: ModelFiles;
}) {
  const [store] = useState(() => createAuto3dStore(initialState(initialUrl)));
  const toast = useFairToast();
  useTourRunner(store);

  useEffect(() => {
    const unbind = bindHistory(store);
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        openList(store);
        return;
      }
      if (e.key !== "Escape") return;
      const s = store.getState();
      if (s.part) {
        store.dispatch({ type: "close" });
        restoreFocus(s.part);
      } else if (s.tour.active && !s.kiosk) {
        store.dispatch({ type: "tour", active: false });
      } else if (s.listOpen && window.matchMedia("(min-width: 1024px)").matches) {
        store.dispatch({ type: "list", open: false });
        restoreFocus(null);
      } else if (s.group) store.dispatch({ type: "group", group: null });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unbind();
      window.removeEventListener("keydown", onKey);
    };
  }, [store]);

  return (
    <Auto3dStoreContext.Provider value={store}>
      <a
        className={styles.skip}
        href={`#${tabPanelId("delovi")}`}
        onClick={(e) => {
          e.preventDefault();
          openList(store);
        }}
      >
        {t.skipToParts}
      </a>
      {initialUrl.kiosk ? null : (
        <div className={styles.intro}>
          {intro}
          <TourButton />
        </div>
      )}
      <Stage>
        <Studio poster={poster} posterExploded={posterExploded} models={models} />
        <PartsPanel onCopied={() => toast.show(t.linkCopied)} />
      </Stage>
      <Announcer />
      <FairToast toast={toast.toast} onDone={toast.clear} />
    </Auto3dStoreContext.Provider>
  );
}

function Stage({ children }: { children: ReactNode }) {
  const store = useAuto3dStore();
  const ref = useRef<HTMLDivElement>(null);
  const open = useAuto3d((s) => s.part !== null || s.listOpen);
  const kiosk = useAuto3d((s) => (s.kiosk ? (s.kioskAuto ? "auto" : "live") : undefined));
  const touring = useAuto3d((s) => s.tour.active && !s.kiosk);
  useKioskRunner(store, ref);
  return (
    <div ref={ref} className={styles.stage} data-panel={open ? "open" : "closed"} data-kiosk={kiosk} data-tour={touring ? "" : undefined}>
      {children}
    </div>
  );
}

function Announcer() {
  const store = useAuto3dStore();
  const [text, setText] = useState("");

  useEffect(() => {
    let prev = store.getState();
    let timer = 0;
    // Ostrvo javlja „nowebgl“ u svom efektu, pre ove pretplate (efekti dece idu prvi), pa se to
    // stanje najavljuje odmah, kao promena iz postera (A12).
    const initial = prev.status === "nowebgl" ? announcement({ ...prev, status: "poster" }, prev) : null;
    if (initial) timer = window.setTimeout(() => setText(initial), 300);
    const unsubscribe = store.subscribe(() => {
      const next = store.getState();
      const message = announcement(prev, next);
      prev = next;
      if (!message) return;
      window.clearTimeout(timer);
      // Isti tekst dvaput zaredom (npr. isti deo posle zatvaranja) ne menja DOM i ne čita se: prvo prazno.
      setText("");
      timer = window.setTimeout(() => setText(message), 300);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [store]);

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}
