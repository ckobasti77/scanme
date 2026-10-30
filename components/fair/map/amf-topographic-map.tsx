"use client";

import { Check, ChevronRight, CircleHelp, ExternalLink, List, Map as MapIcon, Search, Stamp, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDemoHeat } from "../demo/use-demo-heat";
import { FAIR_DEMO_PASSPORTS } from "@/lib/fair-demo";
import { getDict } from "@/lib/i18n";
import { fairMapDeepLinkSearch, fairMapReadDeepLink, fairPassportProgressFor, type FairMapZoneId } from "@/lib/fair-map";
import { buildAmfTopographicExhibits, fairMapTopographicLevel, searchAmfTopographicExhibits, type AmfTopographicExhibit } from "@/lib/fair-map/topography";
import { fmt } from "@/lib/i18n/format";
import type { FairEventMapViewProps } from "./fair-event-map";
import { amfMapSr as dict } from "./amf-map-copy";
import { AmfTopographicCanvas } from "./amf-topographic-canvas";
import { AmfMapSponsor } from "./amf-map-sponsor";
import { fairMapHeatView, useFairMapHeatData } from "./fair-map-heat";
import { usePassportProgress } from "./fair-map-passport";
import styles from "./amf-topographic-map.module.css";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function AmfTopographicMap({ eventSlug, view, rotation, display, initialLink, initialMode, passportProgress, demo = false }: FairEventMapViewProps & { demo?: boolean }) {
  const demoDict = getDict("fair-demo");
  const exhibits = useMemo(() => buildAmfTopographicExhibits(view).map(item => demo ? {
    ...item, paid: item.area !== "foyer" && !item.small && !["auto1", "grawe", "raiffeisen"].includes(item.key),
  } : item), [view, demo]);
  const heatKeys = useMemo(() => exhibits.filter(item => item.paid).map(item => item.key), [exhibits]);
  const demoLevels = useDemoHeat(heatKeys, demo);
  const [heatHelpOpen, setHeatHelpOpen] = useState(false);
  const link = useMemo(() => fairMapReadDeepLink(initialLink ?? {}, view), [initialLink, view]);
  const [zoneId, setZoneId] = useState<FairMapZoneId>(() => link.zoneId ?? "hala");
  const [selectedKey, setSelectedKey] = useState<string | null>(() => (exhibits.find((item) => link.locationId && item.locationId === link.locationId && item.participationId) ?? exhibits.find((item) => link.locationId && item.locationId === link.locationId))?.key ?? null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(initialMode === "directory");
  const [activeResult, setActiveResult] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const directoryButton = useRef<HTMLButtonElement>(null);
  const selected = exhibits.find((item) => item.key === selectedKey) ?? null;
  const items = useMemo(() => exhibits.filter((item) => item.zoneId === zoneId), [exhibits, zoneId]);
  const results = useMemo(() => searchAmfTopographicExhibits(exhibits, query), [exhibits, query]);
  const heat = useFairMapHeatData(eventSlug, !demo);
  const heatView = useMemo(() => fairMapHeatView(heat.value, "today"), [heat.value]);
  const levels = useMemo(() => demoLevels ?? new Map(exhibits.map(item => [item.key, heatView?.enough ? fairMapTopographicLevel(item, exhibits, heatView.levels, heatView.participationLevels, heatView.brandLevels) : 0])), [exhibits, heatView, demoLevels]);
  const passport = usePassportProgress(eventSlug, !passportProgress && exhibits.some((item) => item.passportIds.length > 0));
  const progress = passportProgress ?? passport.progress;
  const completed = useMemo(() => new Set(exhibits.filter((item) => item.passportIds.length > 0 && item.passportIds.every((id) => progress?.some((row) => row.passportId === id && row.completed))).map((item) => item.key)), [exhibits, progress]);
  const sponsor = rotation?.items[0] ?? null;
  const selectedPassports = [...new Map((demo ? FAIR_DEMO_PASSPORTS : view.zones.flatMap((zone) => zone.stands.flatMap((row) => row.passports))).filter((entry) => selected?.passportIds.includes(entry.passportId)).map((entry) => [entry.passportId, entry])).values()];
  const stamped = selectedPassports.reduce((sum, entry) => sum + (fairPassportProgressFor(progress, entry)?.stamped ?? 0), 0);
  const required = selectedPassports.reduce((sum, entry) => sum + (fairPassportProgressFor(progress, entry)?.required ?? entry.models.length), 0);

  const syncUrl = (zone: FairMapZoneId, item: AmfTopographicExhibit | null) => {
    const search = fairMapDeepLinkSearch(window.location.search, { zoneId: zone, locationId: item?.locationId ?? null });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  };
  const select = (item: AmfTopographicExhibit) => {
    setSelectedKey(item.key);
    setZoneId(item.zoneId);
    setDirectoryOpen(false);
    setSearchOpen(false);
    setQuery("");
    syncUrl(item.zoneId, item);
    // Selection opens a pop-up at the summit, never a model browser or camera zoom.
  };
  const closeSelection = () => {
    setSelectedKey(null);
    syncUrl(zoneId, null);
    if (selectedKey) rootRef.current?.querySelector<SVGElement>(`[data-brand="${CSS.escape(selectedKey)}"]`)?.focus({ preventScroll: true });
  };
  const chooseZone = (next: FairMapZoneId) => {
    setZoneId(next);
    setSelectedKey(null);
    setDirectoryOpen(false);
    syncUrl(next, null);
  };

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  useEffect(() => { if (directoryOpen) listRef.current?.focus(); }, [directoryOpen]);
  useEffect(() => { if (selectedKey && !directoryOpen && !searchOpen) popupRef.current?.focus({ preventScroll: true }); }, [selectedKey, directoryOpen, searchOpen]);
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => root.style.setProperty("--topo-offset", `${Math.ceil(root.getBoundingClientRect().top + window.scrollY)}px`);
    const observer = new ResizeObserver(measure);
    const header = root.closest(".fair-event")?.querySelector(".fair-shell");
    if (header) observer.observe(header);
    measure();
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  return <section ref={rootRef} className={styles.root} data-amf-topographic="" data-demo={demo || undefined} data-display={display || undefined} data-reveal="off" aria-label={dict.pageTitle} onPointerDownCapture={event => {
    if (heatHelpOpen && !(event.target as Element).closest('[data-demo-heat]')) setHeatHelpOpen(false);
  }} onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    if (heatHelpOpen) setHeatHelpOpen(false);
    else if (directoryOpen) { setDirectoryOpen(false); directoryButton.current?.focus(); }
    else if (searchOpen) { setSearchOpen(false); setQuery(""); }
    else if (selected) closeSelection();
  }}>
    {!display ? <div className={styles.controls}>
      <button type="button" className={styles.iconButton} aria-label={searchOpen ? dict.searchClear : dict.searchLabel} aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setQuery(""); setDirectoryOpen(false); setSelectedKey(null); }}>
        {searchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
      </button>
      {searchOpen ? <div className={styles.searchField}>
        <label className={styles.srOnly} htmlFor="amf-map-search">{dict.searchLabel}</label>
        <input ref={searchRef} id="amf-map-search" type="search" enterKeyHint="search" autoComplete="off" value={query} placeholder={dict.searchPlaceholder} aria-controls={query.trim() ? "amf-map-results" : undefined} onChange={(event) => { setQuery(event.target.value); setActiveResult(0); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveResult((value) => Math.min(value + 1, results.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveResult((value) => Math.max(value - 1, 0)); }
          if (event.key === "Enter" && results[activeResult]) { event.preventDefault(); select(results[activeResult]); }
        }} />
      </div> : <div className={styles.tabs} data-zone={zoneId} role="group" aria-label={dict.zoneSwitchLabel}>
        <button type="button" aria-pressed={zoneId === "hala"} onClick={() => chooseZone("hala")}>{dict.zones.hala}</button>
        <button type="button" aria-pressed={zoneId === "ispred"} onClick={() => chooseZone("ispred")}>{dict.entranceShort}</button>
      </div>}
      <button ref={directoryButton} type="button" className={styles.listButton} aria-label={directoryOpen ? dict.showMap : dict.showDirectory} aria-expanded={directoryOpen} aria-controls="amf-map-directory" onClick={() => { setDirectoryOpen(!directoryOpen); setSearchOpen(false); setQuery(""); setSelectedKey(null); }}>
        {directoryOpen ? <MapIcon aria-hidden="true" /> : <List aria-hidden="true" />}<span>{directoryOpen ? dict.mapShort : dict.directoryShort}</span>
      </button>
    </div> : null}

    <div className={styles.mapStage}>
      <AmfTopographicCanvas items={items} zoneId={zoneId} selectedKey={selectedKey} levels={levels} completed={completed} onSelect={select} onDismiss={closeSelection} interactive={!display && !directoryOpen && !(searchOpen && query.trim())} popup={!display && selected && !directoryOpen && !searchOpen ? <div ref={popupRef} id="amf-map-popup" tabIndex={-1} role="dialog" aria-labelledby="amf-map-popup-title" className={styles.popupContent}>
        <div className={styles.popupHead}><h2 id="amf-map-popup-title">{selected.name}</h2><button type="button" className={styles.iconButton} aria-label={dict.closeDetail} onClick={closeSelection}><X aria-hidden="true" /></button></div>
        <div className={styles.popupActions}>
          {selectedPassports.length > 0 ? <div className={`${styles.popupTile} ${styles.passportStatus}`}>
            <Stamp aria-hidden="true" /><span>{dict.stampsShort}</span>
            {progress ? <strong aria-label={fmt(dict.passportProgressAria, { brand: selected.name, stamped, required })}>{fmt(dict.passportProgress, { stamped, required })}</strong> : <small role="status">{passport.status === "error" ? dict.passportUnavailable : dict.passportLoading}</small>}
          </div> : null}
          {selected.websiteUrl ? <a className={`${styles.popupTile} ${styles.website}`} href={selected.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={fmt(dict.websiteLinkAria, { exhibitor: selected.name })}>{dict.websiteLink}<ExternalLink aria-hidden="true" /></a> : null}
        </div>
      </div> : null} />
      {searchOpen && query.trim() ? <section id="amf-map-results" className={styles.searchResults} aria-label={dict.searchResultsLabel}>
        {results.length ? results.slice(0, 12).map((item, index) => <button key={item.key} type="button" data-active={index === activeResult} onClick={() => select(item)}><span>{item.name}</span><small>{item.ownerName && item.ownerName !== item.name ? item.ownerName : item.zoneId === "hala" ? dict.zones.hala : dict.entranceShort}</small><ChevronRight aria-hidden="true" /></button>) : <p role="status">{fmt(dict.searchEmpty, { query })}</p>}
      </section> : null}

      {directoryOpen ? <div ref={listRef} tabIndex={-1} id="amf-map-directory" className={styles.directory} aria-label={dict.showDirectory}>
        <div className={styles.overlayHead}><h2>{dict.listTitle}</h2><button type="button" className={styles.iconButton} aria-label={dict.showMap} onClick={() => { setDirectoryOpen(false); directoryButton.current?.focus(); }}><X aria-hidden="true" /></button></div>
        <ul>{exhibits.map((item) => <li key={item.key}><button type="button" onClick={() => select(item)}><span>{item.name}</span><small>{item.zoneId === "hala" ? dict.zones.hala : dict.entranceShort}</small>{completed.has(item.key) ? <Check aria-label={dict.passportComplete} /> : <ChevronRight aria-hidden="true" />}</button></li>)}</ul>
        {view.withoutLocation.filter((item) => !exhibits.some((exhibit) => exhibit.participationId === item.participationId)).map((item) => <p key={item.participationId}>{item.exhibitorName}<small>{dict.standUnplaced}</small></p>)}
        {view.unplaced.map((item) => <p key={item.standId}>{item.exhibitorName}<small>{dict.standUnplaced}</small></p>)}
      </div> : null}

    </div>

    <div className={styles.legend}>
      <div className={styles.legendSymbols}>
        <span className={styles.interest}><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>{dict.interestLabel}</span>
        {demo ? <span className={styles.demoHeat} data-demo-heat="">
          <span>{demoDict.heatSimulation}</span>
          <button type="button" aria-label={demoDict.heatHelp} aria-expanded={heatHelpOpen} aria-describedby={heatHelpOpen ? "demo-heat-help" : undefined} onClick={() => setHeatHelpOpen(value => !value)}><CircleHelp aria-hidden="true" /></button>
          {heatHelpOpen ? <span role="tooltip" id="demo-heat-help" className={styles.heatTooltip}>{demoDict.heatExplanation}</span> : null}
        </span> : null}
        <span className={styles.collected}><Check aria-hidden="true" />{dict.progressCollected}</span>
      </div>
      {heat.failed ? <button type="button" className={styles.heatRetry} onClick={heat.retry}>{dict.heatRetry}</button> : null}
    </div>

    {sponsor ? <AmfMapSponsor item={sponsor} rotation={rotation} display={display} /> : null}
  </section>;
}
