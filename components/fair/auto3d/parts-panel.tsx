"use client";

// Panel sa jezičcima (A03 §5.1–§5.2):
// - telefon i tablet: stoji ispod studija, sa jezičcima Grupe, Delovi i Deo;
// - desktop: pluta desno u studiju, sa jezičcima Delovi i Deo (grupe su u traci levo). Vidi se kad
//   je deo izabran ili je lista otvorena, a X zatvara i deo i listu.
// Bez JS-a (`<noscript>`) svi jezičci su otvoreni jedan ispod drugog, aktivni prvi, a kontrole koje
// rade samo sa JS-om (prikaz, rasklapanje, zatvaranje, kopiranje) se ne vide. Neaktivan jezičak se krije
// klasom, ne atributom `hidden`: Tailwind ga drži kao `!important` u sloju, pa ga `<noscript>` ne bi
// mogao da otvori.

import { useEffect, useRef, type KeyboardEvent } from "react";
import { MousePointerClick, X } from "lucide-react";
import { PARTS } from "@/lib/auto3d/catalog";
import { SYSTEM_PART_COUNT } from "@/lib/auto3d/groups";
import type { PanelTab } from "@/lib/auto3d/state";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { GroupsList } from "./groups-list";
import { PartCard } from "./part-card";
import { PartsList } from "./parts-list";
import { useAuto3d, useAuto3dStore } from "./store";
import { PANEL_ID, restoreFocus, SEARCH_ID, tabId, tabPanelId } from "./ui-bits";
import styles from "./auto3d.module.css";

const TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
  { id: "grupe", label: t.tabGroups },
  { id: "delovi", label: t.tabParts },
  { id: "deo", label: t.tabPart },
];

export function PartsPanel({ onCopied }: { onCopied: () => void }) {
  const store = useAuto3dStore();
  const tab = useAuto3d((s) => s.tab);
  const part = useAuto3d((s) => s.part);
  const group = useAuto3d((s) => s.group);
  const mode = useAuto3d((s) => s.mode);
  const listOpen = useAuto3d((s) => s.listOpen);
  const cardRef = useRef<HTMLDivElement>(null);
  const open = part !== null || listOpen;
  const count = group ? SYSTEM_PART_COUNT[group] : PARTS.length;

  // Nova kartica počinje od vrha.
  useEffect(() => {
    cardRef.current?.scrollTo({ top: 0 });
  }, [part]);

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")).filter((el) => el.offsetParent !== null);
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const n = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[n].focus();
    store.dispatch({ type: "tab", tab: tabs[n].dataset.tab as PanelTab });
  };

  const closePart = () => {
    const closed = part;
    store.dispatch({ type: "close" });
    restoreFocus(closed);
  };

  const closePanel = () => {
    store.dispatch({ type: "close" });
    store.dispatch({ type: "list", open: false });
    restoreFocus(null);
  };

  return (
    <section id={PANEL_ID} className={styles.panel} data-open={open ? "true" : "false"} data-tab={tab} aria-label={t.tabsLabel}>
      <span className={styles.handle} aria-hidden="true" />
      <div className={styles.panelHead}>
        <div role="tablist" aria-label={t.tabsLabel} className={styles.tabs} onKeyDown={onTabKey}>
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={tabId(x.id)}
              data-tab={x.id}
              className={styles.tab}
              aria-selected={tab === x.id}
              aria-controls={tabPanelId(x.id)}
              tabIndex={tab === x.id ? 0 : -1}
              onClick={() => store.dispatch({ type: "tab", tab: x.id })}
            >
              {x.label}
              {x.id === "delovi" ? <span className={styles.tabCount}>{count}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" className={styles.panelClose} onClick={closePanel}>
          <X aria-hidden="true" />
          <span className="sr-only">{t.panelClose}</span>
        </button>
      </div>

      <div role="tabpanel" id={tabPanelId("grupe")} aria-labelledby={tabId("grupe")} data-active={tab === "grupe" ? "" : undefined} className={styles.tabPanel}>
        <GroupsList variant="sheet" />
      </div>
      <div role="tabpanel" id={tabPanelId("delovi")} aria-labelledby={tabId("delovi")} data-active={tab === "delovi" ? "" : undefined} className={styles.tabPanel}>
        <PartsList />
      </div>
      <div ref={cardRef} role="tabpanel" id={tabPanelId("deo")} aria-labelledby={tabId("deo")} data-active={tab === "deo" ? "" : undefined} className={styles.tabPanel}>
        {part ? (
          <PartCard
            key={part}
            part={part}
            group={group}
            mode={mode}
            onSelect={(id) => store.dispatch({ type: "select", part: id, origin: "list" })}
            onClose={closePart}
            onCopied={onCopied}
          />
        ) : (
          <div className={styles.emptyPart}>
            <MousePointerClick aria-hidden="true" />
            <h2>{t.partEmptyTitle}</h2>
            <p>{t.partEmpty}</p>
            <button
              type="button"
              className={styles.lightButton}
              onClick={() => {
                store.dispatch({ type: "list", open: true });
                requestAnimationFrame(() => document.getElementById(SEARCH_ID)?.focus());
              }}
            >
              {t.partEmptyAction}
            </button>
          </div>
        )}
      </div>
      <noscript>
        <style>{`.${styles.tabPanel}{display:block!important}.${styles.tabPanel}[data-active]{order:-1}.${styles.handle}{order:-2}.${styles.panelHead},.${styles.cardClose},.${styles.copyButton},.${styles.topBar},.${styles.toolbar},.${styles.tourButton}{display:none!important}`}</style>
      </noscript>
    </section>
  );
}
