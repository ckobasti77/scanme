"use client";

import { LocateFixed, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { FairPassportCatalogEntry, FairPassportProgress, FairPassportState, FairSponsoredRotationView } from "@/lib/fair-contract";
import {
  FAIR_MAP_FILTERS,
  fairMapDeepLinkSearch,
  fairMapDirectory,
  fairMapExhibitors,
  fairMapFilterCounts,
  fairMapLitLocations,
  fairMapLocationSummary,
  fairMapReadDeepLink,
  fairMapScanmeTarget,
  fairMapSearch,
  fairPassportProgressFor,
  locateFairMapStand,
  type FairMapExhibitorEntry,
  type FairMapFilter,
  type FairMapView,
  type FairMapZoneId,
} from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { ZoneCanvas, type ZoneFocusRequest } from "./fair-map-canvas";
import { FairMapCloseButton, FairMapSheet, FairMapStandDetail, FairMapUnlocatedDetail, type FairMapPassportInfo } from "./fair-map-detail";
import { FairMapDirectory } from "./fair-map-directory";
import { useLiveFairMapRotation } from "./fair-map-live-rotation";
import { FAIR_MAP_CATEGORY_ICONS, FairMapLogoBox, fairMapCategoryLabel } from "./fair-map-logo";
import { FairMapRotationCard, useFairMapRotation } from "./fair-map-rotation";
import { fairMapExhibitorCount, fairMapPlaceText } from "./fair-map-text";
import styles from "./fair-event-map.module.css";

// N4 — public event map v2 (/sajam/[eventSlug]): the test map's look and
// interactions (/dev/sajam-cair) over the real organizer geometry (lib/fair-map)
// and the real catalog (fairPublic.getEventMap), with the fair's tokens and
// Archivo. Phone first: intro card + "Pronađi ScanMe", search, zones, category
// filters, the map in the first screen, the 12 s rotation card, the
// exhibitor list. A stand opens a bottom sheet on the phone and the
// "Izabrani štand" panel on a computer; ?zona= and ?stand= open a zone and a
// stand. Not a game: no route, no "you are here", no voting, no "visited"
// colouring, and the map writes nothing (the passport N/M read is a query
// behind the gateway). The 12 s rotation is M2's (rotation-slot.ts), read
// live (K2). All decisions are pure functions in lib/fair-map (explore,
// layout, viewport).

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

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
}

/** Phone first: false on the server and until the browser answers. */
function useMedia(query: string) {
  const subscribe = useMemo(() => subscribeMedia(query), [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const DESKTOP = "(min-width: 1024px)";
const WIDE = "(min-width: 1440px)";

export type FairEventMapProps = {
  eventSlug: string;
  view: FairMapView;
  /** Server-rendered B5 projection: the first state until the live read answers. */
  initialRotation: FairSponsoredRotationView | null;
  /** `?prikaz=ekran`: the fair display composition. */
  display: boolean;
  /** `?zona=` / `?stand=` of the request. */
  initialLink?: { zona?: string | string[]; stand?: string | string[] };
};

/** The public map: the rotation followed live over Convex (K2). */
export function FairEventMap(props: FairEventMapProps) {
  const rotation = useLiveFairMapRotation(props.eventSlug, props.initialRotation);
  return <FairEventMapView {...props} rotation={rotation} />;
}

type Selection = { locationId: string; participationId?: string } | { unlocated: string };

export function FairEventMapView({
  eventSlug,
  view,
  rotation,
  display,
  initialLink,
  passportProgress,
}: Omit<FairEventMapProps, "initialRotation"> & {
  rotation: FairSponsoredRotationView | null;
  /** DEV preview only: a fixed passport state instead of the gateway read. */
  passportProgress?: FairPassportProgress[];
}) {
  const link = useMemo(() => fairMapReadDeepLink(initialLink ?? {}, view), [initialLink, view]);
  const rotationState = useFairMapRotation(rotation);
  const rotationStand = rotationState ? locateFairMapStand(view, rotationState.item.standMapLocationId) : null;
  const placed = useMemo(() => view.zones.flatMap((zone) => zone.stands), [view]);
  const exhibitors = useMemo(() => fairMapExhibitors(view), [view]);
  const counts = useMemo(() => fairMapFilterCounts(view), [view]);
  const hasPassports = placed.some((row) => row.passports.length > 0);
  const gateway = usePassportProgress(eventSlug, hasPassports && !passportProgress);
  const passport = passportProgress ? { status: "ready" as const, progress: passportProgress, retry: gateway.retry } : gateway;
  const reducedMotion = useMedia(REDUCED_MOTION);
  const isDesktop = useMedia(DESKTOP);
  const isWide = useMedia(WIDE);

  const [zoneId, setZoneId] = useState<FairMapZoneId>(() => link.zoneId ?? view.zones.find((zone) => zone.stands.length > 0)?.zone.id ?? view.zones[0].zone.id);
  const [filter, setFilter] = useState<FairMapFilter>("sve");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(() => (link.locationId ? { locationId: link.locationId } : null));
  const [focus, setFocus] = useState<ZoneFocusRequest | null>(() => (link.locationId ? { locationId: link.locationId, key: 1, anchorY: 0.4 } : null));
  const [showOriginal, setShowOriginal] = useState(false);
  const focusKey = useRef(1);
  const mapRef = useRef<HTMLDivElement>(null);

  // A deep-linked stand on a phone: bring the map up so the stand shows above the sheet.
  useEffect(() => {
    if (!link.locationId || display) return;
    const desktop = window.matchMedia(DESKTOP).matches;
    mapRef.current?.scrollIntoView({ block: desktop ? "nearest" : "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only for the link the page was opened with
  }, []);

  const lit = useMemo(() => fairMapLitLocations(view, filter, query), [view, filter, query]);
  const results = useMemo(() => fairMapSearch(view, filter, query), [view, filter, query]);
  const directory = useMemo(() => fairMapDirectory(view, filter), [view, filter]);
  const selectedLocationId = selection && "locationId" in selection ? selection.locationId : null;
  const focusParticipation = selection && "locationId" in selection ? selection.participationId : undefined;
  const summary = selectedLocationId ? fairMapLocationSummary(view, selectedLocationId, focusParticipation) : null;
  const unlocated = selection && "unlocated" in selection ? (exhibitors.find((row) => row.participationId === selection.unlocated) ?? null) : null;
  const selectedParticipationId = selection ? ("unlocated" in selection ? selection.unlocated : (selection.participationId ?? null)) : null;
  // Every zone is on screen on a large display; a phone/desktop shows the chosen one.
  const allZones = display || isWide;

  const passportInfo: FairMapPassportInfo = (entry: FairPassportCatalogEntry) => {
    const own = fairPassportProgressFor(passport.status === "ready" ? passport.progress : null, entry);
    return own
      ? { label: fmt(dict.passportProgress, { stamped: own.stamped, required: own.required }), aria: fmt(dict.passportProgressAria, { brand: entry.brandName, stamped: own.stamped, required: own.required }) }
      : { label: null, aria: dict.passportLabel };
  };
  const passportMarkers = useMemo(() => {
    const markers = new Map<string, string>();
    for (const zone of view.zones) {
      for (const row of zone.locations) {
        const entries = [...new Map(row.stands.flatMap((placedStand) => placedStand.passports).map((entry) => [entry.passportId, entry])).values()];
        if (!entries.length) continue;
        markers.set(
          row.location.id,
          entries
            .map((entry) => {
              const own = fairPassportProgressFor(passport.status === "ready" ? passport.progress : null, entry);
              return own ? fmt(dict.passportProgress, { stamped: own.stamped, required: own.required }) : "…";
            })
            .join(" · "),
        );
      }
    }
    return markers;
  }, [view, passport.status, passport.progress]);

  const syncUrl = (zone: FairMapZoneId | null, locationId: string | null) => {
    const search = fairMapDeepLinkSearch(window.location.search, { zoneId: zone, locationId });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  };

  const revealMap = (block: ScrollLogicalPosition) => mapRef.current?.scrollIntoView({ block, behavior: reducedMotion ? "auto" : "smooth" });

  /** Select an occupied location (from the map, the list, search, rotation or "Pronađi ScanMe"). */
  const selectLocation = (locationId: string, participationId?: string) => {
    const hit = fairMapLocationSummary(view, locationId);
    if (!hit) return;
    focusKey.current += 1;
    setZoneId(hit.zoneId);
    setSelection({ locationId, ...(participationId ? { participationId } : {}) });
    setFocus({ locationId, key: focusKey.current, anchorY: isDesktop ? 0.5 : 0.36 });
    setQuery("");
    syncUrl(hit.zoneId, locationId);
    // On a phone the sheet covers the lower half: bring the map to the top so the stand stays visible.
    if (!display) revealMap(isDesktop ? "nearest" : "start");
  };

  const selectUnlocated = (participationId: string) => {
    setSelection({ unlocated: participationId });
    setQuery("");
    syncUrl(zoneId, null);
  };

  const closeSelection = () => {
    setSelection(null);
    syncUrl(zoneId, null);
  };

  const chooseZone = (next: FairMapZoneId) => {
    setZoneId(next);
    const keep = selectedLocationId !== null && summary?.zoneId === next;
    if (!keep && selectedLocationId) setSelection(null);
    syncUrl(next, keep ? selectedLocationId : null);
  };

  const scanmeTarget = fairMapScanmeTarget(view);
  const findScanMe = () => {
    if (!scanmeTarget) return;
    setFilter("sve");
    if (fairMapLocationSummary(view, scanmeTarget.locationId)) {
      selectLocation(scanmeTarget.locationId);
      return;
    }
    focusKey.current += 1;
    setZoneId(scanmeTarget.zoneId);
    setFocus({ locationId: scanmeTarget.locationId, key: focusKey.current, anchorY: 0.5 });
    syncUrl(scanmeTarget.zoneId, null);
    revealMap(isDesktop ? "nearest" : "start");
  };

  const unlocatedText = (entry: Pick<FairMapExhibitorEntry, "withoutLocation">) =>
    entry.withoutLocation?.zoneId ? fmt(dict.withoutLocation, { zone: dict.zones[entry.withoutLocation.zoneId] }) : dict.withoutLocationNoZone;

  const bubble = summary
    ? summary.stands.length === 1
      ? summary.stands[0].stand.exhibitorName
      : `${fairMapPlaceText(summary.location, summary.zoneId, summary.label)} · ${fairMapExhibitorCount(summary.stands.length)}`
    : null;
  const sheetOpen = !display && !isDesktop && (summary !== null || unlocated !== null);

  const detail = (headingId: string) =>
    summary ? (
      <FairMapStandDetail summary={summary} eventSlug={eventSlug} passportInfo={passportInfo} headingId={headingId} action={<FairMapCloseButton onClose={closeSelection} />} />
    ) : unlocated ? (
      <FairMapUnlocatedDetail exhibitor={unlocated} placeText={unlocatedText(unlocated)} headingId={headingId} action={<FairMapCloseButton onClose={closeSelection} />} />
    ) : null;

  const rotationCard = (placement: "inline" | "panel") =>
    rotation?.items.length ? (
      <div className={placement === "inline" ? styles.rotationInline : styles.rotationPanel}>
        <FairMapRotationCard
          state={rotationState}
          display={display}
          locationText={rotationStand ? fairMapPlaceText(rotationStand.location, rotationStand.zoneId) : dict.standUnplaced}
          onShowStand={
            rotationStand
              ? () => {
                  if (rotationStand.standIds.length) selectLocation(rotationStand.location.id);
                  else chooseZone(rotationStand.zoneId);
                }
              : null
          }
        />
      </div>
    ) : null;

  const hasExhibitors = exhibitors.length > 0;
  const pick = (result: (typeof results)[number]) => (result.place ? selectLocation(result.place.location.id, result.participationId) : selectUnlocated(result.participationId));

  return (
    <div className={styles.root} data-display={display ? "on" : undefined}>
      <section className={styles.intro} aria-labelledby="fair-map-intro-title">
        <div className={styles.introText}>
          <h2 id="fair-map-intro-title" className={styles.introTitle}>
            {dict.introTitle}
          </h2>
          <p className={styles.introHint}>{display ? dict.displayHint : hasExhibitors ? dict.introHint : dict.listEmpty}</p>
        </div>
        {display ? null : (
          <button type="button" className={styles.findButton} onClick={findScanMe} disabled={!scanmeTarget}>
            <LocateFixed aria-hidden="true" />
            {dict.findScanMe}
          </button>
        )}
      </section>

      {display ? null : (
        <div className={styles.tools}>
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
                  if (event.key === "Enter" && results[0]) pick(results[0]);
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
                  results.map((result) => (
                    <li key={result.key}>
                      <button type="button" className={styles.resultButton} onClick={() => pick(result)}>
                        <FairMapLogoBox logoUrl={result.logoUrl} name={result.exhibitorName} size="sm" />
                        <span className={styles.entryText}>
                          <span className={styles.entryName}>{result.exhibitorName}</span>
                          <span className={styles.resultMeta}>
                            {[
                              result.models.length ? result.models.join(", ") : result.brands.join(", "),
                              result.place ? fairMapPlaceText(result.place.location, result.place.zoneId) : unlocatedText({ withoutLocation: { zoneId: result.zoneHint } }),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          <div className={styles.zoneSwitch} role="group" aria-label={dict.zoneSwitchLabel} style={{ "--fair-map-zones": view.zones.length } as CSSProperties}>
            {view.zones.map(({ zone }) => (
              <button key={zone.id} type="button" className={styles.zoneButton} aria-pressed={zone.id === zoneId} onClick={() => chooseZone(zone.id)}>
                {dict.zones[zone.id]}
              </button>
            ))}
          </div>

          <div className={styles.filters} role="group" aria-label={dict.filtersLabel}>
            {FAIR_MAP_FILTERS.filter((key) => key === "sve" || counts[key] > 0).map((key) => {
              const Icon = FAIR_MAP_CATEGORY_ICONS[key];
              const label = fairMapCategoryLabel(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.filterButton}
                  aria-pressed={filter === key}
                  aria-label={fmt(dict.filterAria, { label, count: fairMapExhibitorCount(counts[key]) })}
                  onClick={() => setFilter(key)}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                  <span className={styles.count} aria-hidden="true">
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div ref={mapRef} className={styles.mapArea} data-all-zones={allZones} aria-describedby="fair-map-hint">
        <p id="fair-map-hint" className={styles.srOnly}>
          {dict.mapHint}
        </p>
        {view.zones.map((zoneView) => (
          <ZoneCanvas
            key={zoneView.zone.id}
            zoneView={zoneView}
            active={allZones || zoneView.zone.id === zoneId}
            interactive={!display}
            display={display}
            lit={lit}
            selectedLocationId={summary?.zoneId === zoneView.zone.id ? selectedLocationId : null}
            focus={focus && zoneView.zone.locations.some((row) => row.id === focus.locationId) ? focus : null}
            highlight={rotationStand && rotationState && rotationStand.zoneId === zoneView.zone.id ? { location: rotationStand.location, key: rotationState.slotNumber } : null}
            showOriginal={showOriginal}
            passportMarkers={passportMarkers}
            bubble={isDesktop && !display ? bubble : null}
            onSelect={(locationId) => selectLocation(locationId)}
            onToggleOriginal={() => setShowOriginal((value) => !value)}
          />
        ))}
      </div>

      {rotationCard("inline")}

      {display ? (
        <section className={styles.legend} aria-label={dict.directoryTitle}>
          {FAIR_MAP_FILTERS.filter((key) => key !== "sve" && counts[key] > 0).map((key) => {
            const Icon = FAIR_MAP_CATEGORY_ICONS[key];
            return (
              <span key={key} className={styles.legendItem}>
                <Icon aria-hidden="true" />
                {fairMapCategoryLabel(key)}
                <span className={styles.count}>{counts[key]}</span>
              </span>
            );
          })}
        </section>
      ) : (
        <FairMapDirectory
          groups={directory}
          filter={filter}
          selectedParticipationId={selectedParticipationId}
          unlocatedText={unlocatedText}
          onSelectPlace={(locationId, participationId) => selectLocation(locationId, participationId)}
          onSelectUnlocated={selectUnlocated}
        />
      )}

      {display ? (
        <aside className={styles.panel}>{rotationCard("panel")}</aside>
      ) : (
        <aside className={styles.panel} aria-label={dict.selectedStand}>
          {rotationCard("panel")}
          <section className={styles.card} aria-live="polite">
            {summary || unlocated ? detail("fair-map-panel-title") : <p className={styles.hint}>{hasExhibitors ? dict.selectHint : dict.listEmpty}</p>}
          </section>
        </aside>
      )}

      {display ? null : (
        <FairMapSheet open={sheetOpen} labelledBy="fair-map-sheet-title" onClose={closeSelection}>
          {detail("fair-map-sheet-title")}
        </FairMapSheet>
      )}
    </div>
  );
}
