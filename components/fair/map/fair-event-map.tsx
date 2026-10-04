"use client";

import Link from "next/link";
import { ChevronRight, MapPin, Maximize2, Minus, Plus, Search, Stamp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { FairPassportCatalogEntry, FairPassportProgress, FairPassportState, FairPublicMapStand, FairSponsoredRotationView } from "@/lib/fair-contract";
import {
  fairMapBounds,
  fairMapLabelPoint,
  fairMapPointsAttr,
  fairPassportProgressFor,
  locateFairMapStand,
  searchFairMapStands,
  type FairMapLocation,
  type FairMapPlacedStand,
  type FairMapView,
  type FairMapZoneId,
  type FairMapZoneView,
} from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { useLiveFairMapRotation } from "./fair-map-live-rotation";
import { FairMapRotationCard, useFairMapRotation } from "./fair-map-rotation";
import styles from "./fair-event-map.module.css";

// M1 — public event map (/sajam/[eventSlug]). Geometry from lib/fair-map (M0),
// stands/models from fairPublic.getEventMap (by mapLocationId), passport
// eligibility from fairPublic.getPassportCatalog and the visitor's own N/M from
// the same-origin POST gateway /api/fair/passport. Not a game: no voting, no
// points, no guidance, no "visited" colouring, and showing the map writes
// nothing (the passport read is a query behind the gateway).
// M2 adds the 12 s Advanced rotation (fair-map-rotation.tsx): the active
// model's stand gets a discrete, animated highlight; still no write.
// K2: the rotation is read live (fair-map-live-rotation.ts), starting from the
// server-rendered projection.

const MAX_ZOOM = 4;
const FOCUS_ZOOM = 3;
const TAP_SLOP = 8;
const RESULTS_LIMIT = 8;
/** EDS §5.1 `event.scanmeStand`: set ONLY on the ScanMe location (EDS §3: never CTA, progress, selection or decoration). */
const SCANME_STAND_STYLE = { "--fair-map-scanme": "#C6FF4A" } as CSSProperties;

type PassportStatus = { status: "loading" | "ready" | "error"; progress: FairPassportProgress[] | null };

function usePassportProgress(eventSlug: string, enabled: boolean) {
  const [state, setState] = useState<PassportStatus>({ status: "loading", progress: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/fair/passport", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventSlug }),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as { ok: boolean; value?: FairPassportState | null };
        if (!response.ok || !body.ok) throw new Error("passport");
        setState({ status: "ready", progress: body.value?.progress ?? [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error", progress: null });
      });
    return () => controller.abort();
  }, [enabled, eventSlug, attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading", progress: null });
    setAttempt((value) => value + 1);
  }, []);
  return { ...state, retry };
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
}

function brandSummary(stand: FairPublicMapStand) {
  return stand.brands.map((brand) => brand.brandName).join(", ");
}

// -----------------------------------------------------------------------------
// One zone: image + stand polygons, with pan / pinch / wheel / button zoom.
// -----------------------------------------------------------------------------

type View = { s: number; tx: number; ty: number };
type Size = { w: number; h: number };

/** Keeps the zoom between fit and MAX_ZOOM and the image inside the viewport (centered when smaller). */
function clampView(next: View, size: Size, imageWidth: number, imageHeight: number): View {
  const base = Math.min(size.w / imageWidth, size.h / imageHeight);
  if (!base) return next;
  const s = Math.min(Math.max(next.s, base), base * MAX_ZOOM);
  const contentW = imageWidth * s;
  const contentH = imageHeight * s;
  const tx = contentW <= size.w ? (size.w - contentW) / 2 : Math.min(0, Math.max(size.w - contentW, next.tx));
  const ty = contentH <= size.h ? (size.h - contentH) / 2 : Math.min(0, Math.max(size.h - contentH, next.ty));
  return { s, tx, ty };
}

function ZoneMap({
  zoneView,
  active,
  selectedStandId,
  matchIds,
  passportLabel,
  highlight,
  onSelect,
}: {
  zoneView: FairMapZoneView;
  active: boolean;
  selectedStandId: string | null;
  matchIds: Set<string> | null;
  passportLabel: (entry: FairPassportCatalogEntry) => string;
  /** M2: the rotation's active stand in this zone; `key` restarts the reveal each slot. */
  highlight: { location: FairMapLocation; key: number } | null;
  onSelect: (standId: string) => void;
}) {
  const { zone } = zoneView;
  const { width: imageWidth, height: imageHeight } = zone.image;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ s: 0, tx: 0, ty: 0 });
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: View; startX: number; startY: number; distance: number; moved: number; standId: string | null } | null>(null);

  const base = size.w && size.h ? Math.min(size.w / imageWidth, size.h / imageHeight) : 0;

  const clamp = useCallback((next: View): View => clampView(next, size, imageWidth, imageHeight), [size, imageWidth, imageHeight]);

  // Fit on first measure and on every resize (rotation, display switch, zone shown).
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { w: entry.contentRect.width, h: entry.contentRect.height };
      if (!next.w || !next.h) return;
      setSize(next);
      setAnimate(false);
      setView(clampView({ s: 0, tx: 0, ty: 0 }, next, imageWidth, imageHeight));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [imageWidth, imageHeight]);

  const zoomAt = useCallback(
    (factor: number, px: number, py: number, withAnimation: boolean) => {
      setAnimate(withAnimation);
      setView((current) => {
        const s = Math.min(Math.max(current.s * factor, base), base * MAX_ZOOM);
        const ratio = s / current.s;
        return clamp({ s, tx: px - (px - current.tx) * ratio, ty: py - (py - current.ty) * ratio });
      });
    },
    [base, clamp],
  );

  // Focus the selected stand once per selection (the user keeps control afterwards).
  // Derived from the selection change during render, not in an effect.
  const selected = zoneView.stands.find((row) => row.stand.standId === selectedStandId) ?? null;
  const focusKey = selected && active && base ? `${selected.stand.standId}:${size.w}x${size.h}` : null;
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  if (focusKey !== focusedKey) {
    setFocusedKey(focusKey);
    if (selected && focusKey) {
      const bounds = fairMapBounds(selected.location.polygon);
      const bw = Math.max(bounds.maxX - bounds.minX, 1);
      const bh = Math.max(bounds.maxY - bounds.minY, 1);
      const s = Math.min(Math.max(Math.min((size.w * 0.5) / bw, (size.h * 0.5) / bh), base), base * FOCUS_ZOOM);
      setAnimate(true);
      setView(clamp({ s, tx: size.w / 2 - ((bounds.minX + bounds.maxX) / 2) * s, ty: size.h / 2 - ((bounds.minY + bounds.maxY) / 2) * s }));
    }
  }

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top, false);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const local = (event: ReactPointerEvent) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button")) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    const standId = (event.target as Element).closest("[data-stand-id]")?.getAttribute("data-stand-id") ?? null;
    const all = [...pointers.current.values()];
    const distance = all.length === 2 ? Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y) : 0;
    gesture.current = { start: view, startX: point.x, startY: point.y, distance, moved: all.length > 1 ? TAP_SLOP + 1 : 0, standId };
    setAnimate(false);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(event.pointerId)) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const all = [...pointers.current.values()];
    if (all.length >= 2 && g.distance > 0) {
      const distance = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
      const mid = { x: (all[0].x + all[1].x) / 2, y: (all[0].y + all[1].y) / 2 };
      const s = Math.min(Math.max(g.start.s * (distance / g.distance), base), base * MAX_ZOOM);
      const ratio = s / g.start.s;
      setView(clamp({ s, tx: mid.x - (mid.x - g.start.tx) * ratio, ty: mid.y - (mid.y - g.start.ty) * ratio }));
      g.moved = TAP_SLOP + 1;
      return;
    }
    const dx = point.x - g.startX;
    const dy = point.y - g.startY;
    g.moved = Math.max(g.moved, Math.hypot(dx, dy));
    if (g.moved > TAP_SLOP) {
      setDragging(true);
      setView(clamp({ s: g.start.s, tx: g.start.tx + dx, ty: g.start.ty + dy }));
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0) {
      // Pinch → pan handover: restart from the remaining finger.
      const [rest] = pointers.current.values();
      gesture.current = g ? { ...g, start: view, startX: rest.x, startY: rest.y, distance: 0 } : null;
      return;
    }
    setDragging(false);
    gesture.current = null;
    if (g && event.type === "pointerup" && g.moved <= TAP_SLOP && g.standId) onSelect(g.standId);
  };

  const scale = view.s || 1;
  const center = { x: size.w / 2, y: size.h / 2 };
  const zoneName = dict.zones[zone.id];

  return (
    <section className={styles.zone} data-active={active} aria-label={zoneName}>
      <h2 className={styles.zoneTitle}>{zoneName}</h2>
      <div
        ref={viewportRef}
        className={styles.viewport}
        data-dragging={dragging}
        style={{ "--fair-map-ratio": `${imageWidth} / ${imageHeight}` } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          className={styles.layer}
          data-animate={animate}
          style={{ width: imageWidth, height: imageHeight, transform: `translate(${view.tx}px, ${view.ty}px) scale(${scale})`, visibility: view.s ? "visible" : "hidden" }}
        >
          <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} width={imageWidth} height={imageHeight} role="group" aria-label={fmt(dict.mapAria, { zone: zoneName })}>
            <image href={zone.image.src} width={imageWidth} height={imageHeight} />
            {zoneView.scanme ? (
              <g className={styles.scanmeLocation} style={SCANME_STAND_STYLE} aria-label={dict.scanmeStand} role="img">
                <polygon points={fairMapPointsAttr(zoneView.scanme.polygon)} vectorEffect="non-scaling-stroke" />
              </g>
            ) : null}
            {zoneView.stands.map(({ stand, location }) => (
              <g
                key={stand.standId}
                className={styles.stand}
                data-stand-id={stand.standId}
                data-dimmed={matchIds !== null && !matchIds.has(stand.standId)}
                role="button"
                tabIndex={active ? 0 : -1}
                aria-pressed={stand.standId === selectedStandId}
                aria-label={fmt(dict.standAria, { exhibitor: stand.exhibitorName, label: location.label })}
                onClick={(event) => {
                  // Keyboard / assistive activation; pointer taps are handled above.
                  if (event.detail === 0) onSelect(stand.standId);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(stand.standId);
                  }
                }}
              >
                <polygon points={fairMapPointsAttr(location.polygon)} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            {highlight ? (
              <g key={highlight.key} className={styles.rotationHighlight} aria-hidden="true">
                <polygon className={styles.rotationGlow} points={fairMapPointsAttr(highlight.location.polygon)} vectorEffect="non-scaling-stroke" />
                <polygon points={fairMapPointsAttr(highlight.location.polygon)} vectorEffect="non-scaling-stroke" />
              </g>
            ) : null}
          </svg>
          {highlight
            ? (() => {
                const [x, y] = fairMapLabelPoint(highlight.location.polygon);
                return (
                  <span
                    key={highlight.key}
                    className={styles.rotationPin}
                    aria-hidden="true"
                    style={{ left: x, top: y, transform: `translate(-50%, -100%) scale(${1 / scale})` }}
                  >
                    <MapPin />
                    {dict.rotationStandPin}
                  </span>
                );
              })()
            : null}
          {zoneView.stands
            .filter((row) => row.passports.length > 0)
            .map(({ stand, location, passports }) => {
              const [x, y] = fairMapLabelPoint(location.polygon);
              return (
                <span
                  key={stand.standId}
                  className={styles.marker}
                  aria-hidden="true"
                  style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${1 / scale})` }}
                >
                  <Stamp />
                  {passports.map(passportLabel).join(" · ")}
                </span>
              );
            })}
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.controlButton} aria-label={dict.zoomIn} onClick={() => zoomAt(1.5, center.x, center.y, true)}>
            <Plus aria-hidden="true" />
          </button>
          <button type="button" className={styles.controlButton} aria-label={dict.zoomOut} onClick={() => zoomAt(1 / 1.5, center.x, center.y, true)}>
            <Minus aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.controlButton}
            aria-label={dict.fitMap}
            onClick={() => {
              setAnimate(true);
              setView(clamp({ s: base, tx: 0, ty: 0 }));
            }}
          >
            <Maximize2 aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Whole map: search, zone switch, zones, stand detail and exhibitor list.
// -----------------------------------------------------------------------------

export function FairEventMap({
  eventSlug,
  view,
  initialRotation,
  display,
}: {
  eventSlug: string;
  view: FairMapView;
  /** Server-rendered B5 projection: the first state until the live read answers. */
  initialRotation: FairSponsoredRotationView | null;
  display: boolean;
}) {
  const rotation = useLiveFairMapRotation(eventSlug, initialRotation);
  const rotationState = useFairMapRotation(rotation);
  const rotationStand = rotationState ? locateFairMapStand(view, rotationState.item.standMapLocationId) : null;
  const placed = useMemo(() => view.zones.flatMap((zone) => zone.stands), [view]);
  const hasPassports = placed.some((row) => row.passports.length > 0);
  const passport = usePassportProgress(eventSlug, hasPassports);
  const reducedMotion = useReducedMotion();
  const [zoneId, setZoneId] = useState<FairMapZoneId>(() => view.zones.find((zone) => zone.stands.length > 0)?.zone.id ?? view.zones[0].zone.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchFairMapStands(placed, query), [placed, query]);
  const matchIds = query.trim() ? new Set(results.map((row) => row.stand.standId)) : null;
  const selectedPlaced = placed.find((row) => row.stand.standId === selectedId) ?? null;
  const selectedUnplaced = selectedPlaced ? null : (view.unplaced.find((stand) => stand.standId === selectedId) ?? null);

  const progressFor = (entry: FairPassportCatalogEntry) => fairPassportProgressFor(passport.status === "ready" ? passport.progress : null, entry);
  const passportLabel = (entry: FairPassportCatalogEntry) => {
    const own = progressFor(entry);
    return own ? fmt(dict.passportProgress, { stamped: own.stamped, required: own.required }) : "…";
  };

  const select = (standId: string, fromList = false) => {
    const row = placed.find((item) => item.stand.standId === standId);
    if (row) setZoneId(row.zoneId);
    setSelectedId(standId);
    setQuery("");
    if (fromList && row) stageRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  };

  const locationText = (row: FairMapPlacedStand) => fmt(dict.standLocation, { label: row.location.label, zone: dict.zones[row.zoneId] });

  const passportChip = (entry: FairPassportCatalogEntry) => {
    const own = progressFor(entry);
    return (
      <span
        className={styles.passport}
        aria-label={own ? fmt(dict.passportProgressAria, { brand: entry.brandName, stamped: own.stamped, required: own.required }) : dict.passportLabel}
      >
        <Stamp aria-hidden="true" />
        {dict.passportLabel}
        {own ? ` · ${fmt(dict.passportProgress, { stamped: own.stamped, required: own.required })}` : null}
      </span>
    );
  };

  const detailStand = selectedPlaced?.stand ?? selectedUnplaced;
  const detailPassports = selectedPlaced?.passports ?? [];

  return (
    <div className={styles.root} data-display={display ? "on" : undefined}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label className={styles.searchLabel} htmlFor="fair-map-search">
            {dict.searchLabel}
          </label>
          <div className={styles.searchField}>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input
              id="fair-map-search"
              className={styles.searchInput}
              type="search"
              autoComplete="off"
              enterKeyHint="search"
              placeholder={dict.searchPlaceholder}
              value={query}
              aria-controls={query.trim() ? "fair-map-results" : undefined}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
                if (event.key === "Enter" && results[0]) select(results[0].stand.standId);
              }}
            />
            {query ? (
              <button type="button" className={styles.searchClear} aria-label={dict.searchClear} onClick={() => setQuery("")}>
                <X aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {query.trim() ? (
            <ul id="fair-map-results" className={styles.results} aria-label={dict.searchResultsLabel} aria-live="polite">
              {results.length === 0 ? (
                <li className={styles.resultsEmpty}>{fmt(dict.searchEmpty, { query: query.trim() })}</li>
              ) : (
                results.slice(0, RESULTS_LIMIT).map((row) => (
                  <li key={row.stand.standId}>
                    <button type="button" className={styles.listButton} onClick={() => select(row.stand.standId)}>
                      <span className={styles.listName}>{row.stand.exhibitorName}</span>
                      <span className={styles.listMeta}>
                        {brandSummary(row.stand)} · {locationText(row)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
        <div className={styles.zoneSwitch} role="group" aria-label={dict.zoneSwitchLabel}>
          {view.zones.map(({ zone }) => (
            <button
              key={zone.id}
              type="button"
              className={styles.zoneButton}
              aria-pressed={zone.id === zoneId}
              onClick={() => setZoneId(zone.id)}
            >
              {dict.zones[zone.id]}
            </button>
          ))}
        </div>
      </div>

      <div ref={stageRef} className={styles.stage} aria-describedby="fair-map-hint">
        <p id="fair-map-hint" className={styles.srOnly}>
          {dict.mapHint}
        </p>
        {view.zones.map((zoneView) => (
          <ZoneMap
            key={zoneView.zone.id}
            zoneView={zoneView}
            active={zoneView.zone.id === zoneId}
            selectedStandId={selectedId}
            matchIds={matchIds}
            passportLabel={passportLabel}
            highlight={rotationStand && rotationState && rotationStand.zoneId === zoneView.zone.id ? { location: rotationStand.location, key: rotationState.slotNumber } : null}
            onSelect={(standId) => select(standId)}
          />
        ))}
      </div>

      <div className={styles.panel}>
        {rotation?.items.length ? (
          <FairMapRotationCard
            state={rotationState}
            display={display}
            locationText={rotationStand ? fmt(dict.standLocation, { label: rotationStand.location.label, zone: dict.zones[rotationStand.zoneId] }) : dict.standUnplaced}
            onShowStand={
              rotationStand
                ? () => {
                    if (rotationStand.standId) select(rotationStand.standId, true);
                    else setZoneId(rotationStand.zoneId);
                  }
                : null
            }
          />
        ) : null}
        <section className={styles.card} aria-live="polite">
          {detailStand ? (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <h2 className={styles.detailTitle}>{detailStand.exhibitorName}</h2>
                  <p className={styles.detailMeta}>{selectedPlaced ? locationText(selectedPlaced) : dict.standUnplaced}</p>
                </div>
                <button type="button" className={styles.iconButton} aria-label={dict.closeDetail} onClick={() => setSelectedId(null)}>
                  <X aria-hidden="true" />
                </button>
              </div>
              {detailStand.brands.map((brand) => {
                const entry = detailPassports.find((row) => row.brandId === brand.brandId);
                const own = entry ? progressFor(entry) : null;
                return (
                  <div key={brand.brandId} className={styles.brand}>
                    <div className={styles.brandHeader}>
                      <h3 className={styles.brandName}>{brand.brandName}</h3>
                      {entry ? passportChip(entry) : null}
                    </div>
                    {entry ? (
                      passport.status === "error" ? (
                        <div>
                          <p className={styles.passportNote}>{dict.passportUnavailable}</p>
                          <button type="button" className={styles.retry} onClick={passport.retry}>
                            {dict.retry}
                          </button>
                        </div>
                      ) : (
                        <p className={styles.passportNote}>
                          {passport.status === "loading" ? dict.passportLoading : own?.completed ? dict.passportComplete : dict.passportHint}
                        </p>
                      )
                    ) : null}
                    <p className={styles.modelsLabel}>{dict.modelsLabel}</p>
                    <ul className={styles.models}>
                      {brand.models.map((model) => (
                        <li key={model.id}>
                          <Link prefetch={false} className={styles.modelLink} href={`/sajam/${eventSlug}/model/${model.slug}`}>
                            <span>
                              {model.displayName}
                              {model.variant ? <small>{model.variant}</small> : null}
                            </span>
                            <ChevronRight aria-hidden="true" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </>
          ) : (
            <p className={styles.hint}>{placed.length || view.unplaced.length ? dict.selectHint : dict.listEmpty}</p>
          )}
        </section>

        {placed.length || view.unplaced.length ? (
          <section className={styles.card} aria-labelledby="fair-map-list-title">
            <h2 id="fair-map-list-title" className={styles.listTitle}>
              {dict.listTitle}
            </h2>
            {view.zones
              .filter((zoneView) => zoneView.stands.length > 0)
              .map((zoneView) => (
                <div key={zoneView.zone.id}>
                  <p className={styles.listZone}>{dict.zones[zoneView.zone.id]}</p>
                  <ul className={styles.list}>
                    {zoneView.stands.map((row) => (
                      <li key={row.stand.standId}>
                        <button
                          type="button"
                          className={styles.listButton}
                          aria-pressed={row.stand.standId === selectedId}
                          onClick={() => select(row.stand.standId, true)}
                        >
                          <span className={styles.listName}>
                            {row.stand.exhibitorName}
                            {row.passports.length ? <Stamp aria-label={dict.passportLabel} /> : null}
                          </span>
                          <span className={styles.listMeta}>
                            {brandSummary(row.stand)} · {fmt(dict.standLocation, { label: row.location.label, zone: dict.zones[row.zoneId] })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            {view.unplaced.length ? (
              <ul className={styles.list}>
                {view.unplaced.map((stand) => (
                  <li key={stand.standId}>
                    <button type="button" className={styles.listButton} aria-pressed={stand.standId === selectedId} onClick={() => setSelectedId(stand.standId)}>
                      <span className={styles.listName}>{stand.exhibitorName}</span>
                      <span className={styles.listMeta}>
                        {brandSummary(stand)} · {dict.standUnplaced}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
