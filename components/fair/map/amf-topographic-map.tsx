"use client";

import { Check, ChevronRight, List, Map as MapIcon, Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fairMapDeepLinkSearch, fairMapReadDeepLink, type FairMapZoneId } from "@/lib/fair-map";
import { buildAmfTopographicExhibits, fairMapTopographicLevel, searchAmfTopographicExhibits, type AmfTopographicExhibit } from "@/lib/fair-map/topography";
import { fmt } from "@/lib/i18n/format";
import type { FairEventMapViewProps } from "./fair-event-map";
import { amfMapSr as dict } from "./amf-map-copy";
import { AmfTopographicCanvas } from "./amf-topographic-canvas";
import { fairMapHeatView, useFairMapHeatData } from "./fair-map-heat";
import { usePassportProgress } from "./fair-map-passport";
import { useFairMapRotation } from "./fair-map-rotation";
import styles from "./amf-topographic-map.module.css";

export function AmfTopographicMap({ eventSlug, view, rotation, display, initialLink, initialMode, passportProgress }: FairEventMapViewProps) {
  const exhibits = useMemo(() => buildAmfTopographicExhibits(view), [view]);
  const link = useMemo(() => fairMapReadDeepLink(initialLink ?? {}, view), [initialLink, view]);
  const [zoneId, setZoneId] = useState<FairMapZoneId>(() => link.zoneId ?? "hala");
  const [selectedKey, setSelectedKey] = useState<string | null>(() => (exhibits.find((item) => link.locationId && item.locationId === link.locationId && item.participationId) ?? exhibits.find((item) => link.locationId && item.locationId === link.locationId))?.key ?? null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(initialMode === "directory");
  const [modelsOpen, setModelsOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const vehicleButton = useRef<HTMLButtonElement>(null);
  const modelsRef = useRef<HTMLElement>(null);
  const directoryButton = useRef<HTMLButtonElement>(null);
  const selected = exhibits.find((item) => item.key === selectedKey) ?? null;
  const items = useMemo(() => exhibits.filter((item) => item.zoneId === zoneId), [exhibits, zoneId]);
  const results = useMemo(() => searchAmfTopographicExhibits(exhibits, query), [exhibits, query]);
  const heat = useFairMapHeatData(eventSlug, true);
  const heatView = useMemo(() => fairMapHeatView(heat.value, "today"), [heat.value]);
  const levels = useMemo(() => new Map(exhibits.map((item) => [item.key, heatView?.enough ? fairMapTopographicLevel(item, exhibits, heatView.levels, heatView.participationLevels) : 0])), [exhibits, heatView]);
  const passport = usePassportProgress(eventSlug, !passportProgress && exhibits.some((item) => item.passportIds.length > 0));
  const progress = passportProgress ?? passport.progress;
  const completed = useMemo(() => new Set(exhibits.filter((item) => item.passportIds.length > 0 && item.passportIds.every((id) => progress?.some((row) => row.passportId === id && row.completed))).map((item) => item.key)), [exhibits, progress]);
  const rotationState = useFairMapRotation(rotation);
  const sponsor = rotationState?.item ?? rotation?.items[0] ?? null;

  const syncUrl = (zone: FairMapZoneId, item: AmfTopographicExhibit | null) => {
    const search = fairMapDeepLinkSearch(window.location.search, { zoneId: zone, locationId: item?.locationId ?? null });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  };
  const select = (item: AmfTopographicExhibit) => {
    setSelectedKey(item.key);
    setZoneId(item.zoneId);
    setDirectoryOpen(false);
    setSearchOpen(false);
    setModelsOpen(false);
    setQuery("");
    syncUrl(item.zoneId, item);
    // Selection changes ink and the compact row only: no camera focus request.
  };
  const closeSelection = () => {
    setSelectedKey(null);
    setModelsOpen(false);
    syncUrl(zoneId, null);
  };
  const chooseZone = (next: FairMapZoneId) => {
    setZoneId(next);
    setSelectedKey(null);
    setModelsOpen(false);
    setDirectoryOpen(false);
    syncUrl(next, null);
  };

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  useEffect(() => { if (directoryOpen) listRef.current?.focus(); }, [directoryOpen]);
  useEffect(() => { if (modelsOpen) modelsRef.current?.focus(); }, [modelsOpen]);
  useEffect(() => {
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

  return <section ref={rootRef} className={styles.root} data-amf-topographic="" data-display={display || undefined} data-reveal="off" aria-label={dict.pageTitle} onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    if (modelsOpen) { setModelsOpen(false); vehicleButton.current?.focus(); }
    else if (directoryOpen) { setDirectoryOpen(false); directoryButton.current?.focus(); }
    else if (searchOpen) { setSearchOpen(false); setQuery(""); }
    else if (selected) closeSelection();
  }}>
    {!display ? <div className={styles.controls}>
      <button type="button" className={styles.iconButton} aria-label={searchOpen ? dict.searchClear : dict.searchLabel} aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setQuery(""); setDirectoryOpen(false); setModelsOpen(false); }}>
        {searchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
      </button>
      {searchOpen ? <div className={styles.searchField}>
        <label className={styles.srOnly} htmlFor="amf-map-search">{dict.searchLabel}</label>
        <input ref={searchRef} id="amf-map-search" type="search" enterKeyHint="search" autoComplete="off" value={query} placeholder={dict.searchPlaceholder} aria-controls={query.trim() ? "amf-map-results" : undefined} onChange={(event) => { setQuery(event.target.value); setActiveResult(0); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveResult((value) => Math.min(value + 1, results.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveResult((value) => Math.max(value - 1, 0)); }
          if (event.key === "Enter" && results[activeResult]) { event.preventDefault(); select(results[activeResult]); vehicleButton.current?.focus(); }
        }} />
      </div> : <div className={styles.tabs} role="group" aria-label={dict.zoneSwitchLabel}>
        <button type="button" aria-pressed={zoneId === "hala"} onClick={() => chooseZone("hala")}>{dict.zones.hala}</button>
        <button type="button" aria-pressed={zoneId === "ispred"} onClick={() => chooseZone("ispred")}>{dict.entranceShort}</button>
      </div>}
      <button ref={directoryButton} type="button" className={styles.listButton} aria-label={directoryOpen ? dict.showMap : dict.showDirectory} aria-expanded={directoryOpen} aria-controls="amf-map-directory" onClick={() => { setDirectoryOpen(!directoryOpen); setSearchOpen(false); setQuery(""); setModelsOpen(false); }}>
        {directoryOpen ? <MapIcon aria-hidden="true" /> : <List aria-hidden="true" />}<span>{directoryOpen ? dict.mapShort : dict.directoryShort}</span>
      </button>
    </div> : null}

    <div className={styles.mapStage}>
      <AmfTopographicCanvas items={items} zoneId={zoneId} selectedKey={selectedKey} levels={levels} completed={completed} onSelect={select} interactive={!display && !directoryOpen && !modelsOpen && !(searchOpen && query.trim())} />
      {searchOpen && query.trim() ? <section id="amf-map-results" className={styles.searchResults} aria-label={dict.searchResultsLabel}>
        {results.length ? results.slice(0, 12).map((item, index) => <button key={item.key} type="button" data-active={index === activeResult} onClick={() => select(item)}><span>{item.name}</span><small>{item.ownerName && item.ownerName !== item.name ? item.ownerName : item.zoneId === "hala" ? dict.zones.hala : dict.entranceShort}</small><ChevronRight aria-hidden="true" /></button>) : <p role="status">{fmt(dict.searchEmpty, { query })}</p>}
      </section> : null}

      {directoryOpen ? <div ref={listRef} tabIndex={-1} id="amf-map-directory" className={styles.directory} aria-label={dict.showDirectory}>
        <div className={styles.overlayHead}><h2>{dict.listTitle}</h2><button type="button" className={styles.iconButton} aria-label={dict.showMap} onClick={() => { setDirectoryOpen(false); directoryButton.current?.focus(); }}><X aria-hidden="true" /></button></div>
        <ul>{exhibits.map((item) => <li key={item.key}><button type="button" onClick={() => select(item)}><span>{item.name}</span><small>{item.zoneId === "hala" ? dict.zones.hala : dict.entranceShort}</small>{completed.has(item.key) ? <Check aria-label={dict.passportComplete} /> : <ChevronRight aria-hidden="true" />}</button></li>)}</ul>
        {view.withoutLocation.filter((item) => !exhibits.some((exhibit) => exhibit.participationId === item.participationId)).map((item) => <p key={item.participationId}>{item.exhibitorName}<small>{dict.standUnplaced}</small></p>)}
        {view.unplaced.map((item) => <p key={item.standId}>{item.exhibitorName}<small>{dict.standUnplaced}</small></p>)}
      </div> : null}

      {modelsOpen && selected ? <section ref={modelsRef} tabIndex={-1} className={styles.models} aria-labelledby="amf-map-models-title">
        <div className={styles.overlayHead}><h2 id="amf-map-models-title">{selected.name}</h2><button type="button" className={styles.iconButton} aria-label={dict.closeDetail} onClick={() => { setModelsOpen(false); vehicleButton.current?.focus(); }}><X aria-hidden="true" /></button></div>
        <p className={styles.srOnly}>{dict.modelsLabel}</p>
        {selected.models.length ? <ul>{selected.models.map((model) => <li key={model.id}><Link prefetch={false} href={`/sajam/${eventSlug}/model/${model.slug}`}><span>{model.displayName}{model.variant ? <small>{model.variant}</small> : null}</span><ChevronRight aria-hidden="true" /></Link></li>)}</ul> : <p>{dict.noModels}</p>}
      </section> : null}
    </div>

    {!display ? <div className={styles.selectionSlot} aria-live="polite">
      {selected ? <div className={styles.selection} data-amf-selection="">
        <span className={styles.selectionName}>{selected.name}{selected.ownerName && selected.ownerName !== selected.name ? <small>{selected.ownerName}</small> : null}</span>
        <button ref={vehicleButton} type="button" className={styles.vehicles} aria-expanded={modelsOpen} aria-controls={modelsOpen ? "amf-map-models-title" : undefined} onClick={() => { setModelsOpen(!modelsOpen); setDirectoryOpen(false); setSearchOpen(false); setQuery(""); }}>{dict.vehiclesShort}<ChevronRight aria-hidden="true" /></button>
        <button type="button" className={styles.iconButton} aria-label={dict.closeDetail} onClick={closeSelection}><X aria-hidden="true" /></button>
      </div> : null}
    </div> : null}

    <div className={styles.legend}>
      <div className={styles.legendSymbols}>
        <span className={styles.interest}><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>{dict.interestLabel}</span>
        <span className={styles.collected}><Check aria-hidden="true" />{dict.progressCollected}</span>
      </div>
      <p>{dict.heatServiceNote}</p>
      <p id="amf-heat-explanation" className={styles.srOnly}>{dict.heatServiceAria}</p>
      {heat.failed ? <button type="button" className={styles.heatRetry} onClick={heat.retry}>{dict.heatRetry}</button> : null}
    </div>

    {sponsor ? <Link prefetch={false} className={styles.sponsor} data-amf-sponsor="" href={`/sajam/${eventSlug}/model/${sponsor.slug}`} aria-label={`${dict.rotationLabel}: ${sponsor.brandName}, ${sponsor.displayName}`}>
      <span className={styles.sponsorLabel}>{dict.rotationLabel}</span>
      {sponsor.brandLogoUrl ? <Image src={sponsor.brandLogoUrl} alt="" width={100} height={30} unoptimized /> : null}
      <strong>{sponsor.brandName}</strong><span className={styles.sponsorModel}>{sponsor.displayName}</span><ChevronRight aria-hidden="true" />
    </Link> : null}
  </section>;
}
