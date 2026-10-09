import Link from "next/link";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { CarFront, ChevronRight, ExternalLink, Stamp, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { FairPassportCatalogEntry } from "@/lib/fair-contract";
import type { FairMapExhibitorEntry, FairMapLocationSummary, FairMapPlacedStand } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { FairMapLogoBox } from "./fair-map-logo";
import { fairMapExhibitorCount, fairMapSummaryText } from "./fair-map-text";
import { FAIR_DURATION, FAIR_EASE } from "../fair-motion";
import styles from "./fair-event-map.module.css";

// N4 — what a tap on a stand shows: every exhibitor of the location with its
// logo, website, brands and published models (links to the model page), the
// passport badge where a brand has one, a quiet line for an exhibitor without
// a published car, and the ScanMe stand's own short text. The same content is
// the phone bottom sheet and the desktop "Izabrani štand" panel.

function WebsiteLink({ exhibitor, url }: { exhibitor: string; url?: string }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    <a className={styles.website} href={url} target="_blank" rel="noopener noreferrer" aria-label={fmt(dict.websiteLinkAria, { exhibitor })}>
      {dict.websiteLink}
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

function PassportChip({ label, aria }: { label: string | null; aria: string }) {
  return (
    <span className={styles.passport} aria-label={aria}>
      <Stamp aria-hidden="true" />
      {dict.passportLabel}
      {label ? ` · ${label}` : null}
    </span>
  );
}

export type FairMapPassportInfo = (entry: FairPassportCatalogEntry) => { label: string | null; aria: string };

function ExhibitorBlock({
  placed,
  eventSlug,
  passportInfo,
  named,
}: {
  placed: FairMapPlacedStand;
  eventSlug: string;
  passportInfo: FairMapPassportInfo;
  /** False when the header already names this, the only exhibitor: the name stays for screen readers. */
  named: boolean;
}) {
  const { stand } = placed;
  return (
    <li className={styles.exhibitor}>
      <div className={styles.exhibitorHead}>
        <FairMapLogoBox logoUrl={stand.logoUrl} name={stand.exhibitorName} size="lg" />
        <div className={styles.exhibitorText}>
          <h3 className={named ? styles.exhibitorName : styles.srOnly}>{stand.exhibitorName}</h3>
          <WebsiteLink exhibitor={stand.exhibitorName} url={stand.websiteUrl} />
        </div>
      </div>
      {stand.brands.length === 0 ? (
        <p className={styles.quiet}>{dict.noModels}</p>
      ) : (
        stand.brands.map((brand) => {
          const entry = placed.passports.find((row) => row.brandId === brand.brandId);
          const info = entry ? passportInfo(entry) : null;
          return (
            <div key={brand.brandId} className={styles.brand}>
              <div className={styles.brandHeader}>
                <h4 className={styles.brandName}>{brand.brandName}</h4>
                {info ? <PassportChip label={info.label} aria={info.aria} /> : null}
              </div>
              <ul className={styles.models} aria-label={dict.modelsLabel}>
                {brand.models.map((model) => (
                  <li key={model.id}>
                    {/* A rich row: tile, name, one line about it, the arrow — the whole row opens the model. */}
                    <Link prefetch={false} className={styles.modelLink} href={`/sajam/${eventSlug}/model/${model.slug}`}>
                      <span className={styles.modelThumb} aria-hidden="true">
                        <CarFront />
                      </span>
                      <span className={styles.modelText}>
                        <span className={styles.modelName}>{model.displayName}</span>
                        <span className={styles.modelMeta}>{model.variant ?? dict.modelRowHint}</span>
                      </span>
                      <span className={styles.modelArrow} aria-hidden="true">
                        <ChevronRight />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </li>
  );
}

/** Header line under the stand: the exhibitor's name, or how many share the place. */
function exhibitorLine(summary: FairMapLocationSummary) {
  return summary.stands.length === 1 ? summary.stands[0].stand.exhibitorName : fairMapExhibitorCount(summary.stands.length);
}

/** The selected location: header "Štand 2 · Hala · 490 m²" with who is there, and every exhibitor there. */
export function FairMapStandDetail({
  summary,
  eventSlug,
  passportInfo,
  headingId,
  action,
}: {
  summary: FairMapLocationSummary;
  eventSlug: string;
  passportInfo: FairMapPassportInfo;
  headingId: string;
  /** Close button (sheet / panel). */
  action?: ReactNode;
}) {
  const single = summary.stands.length === 1;
  return (
    <div className={styles.detail} data-kind={summary.location.kind}>
      <div className={styles.detailHeader} data-sheet-header="">
        <div className={styles.detailHeading}>
          <h2 id={headingId} className={styles.detailPlace} tabIndex={-1}>
            <span className={styles.srOnly}>{dict.selectedStand}: </span>
            {fairMapSummaryText(summary)}
          </h2>
          <p className={styles.detailTitle}>{exhibitorLine(summary)}</p>
        </div>
        {action}
      </div>
      <div className={styles.detailBody}>
        {summary.location.kind === "scanme" ? <p className={styles.scanmeNote}>{dict.scanmeBody}</p> : null}
        <ul className={styles.exhibitors} data-single={single}>
          {summary.stands.map((placed) => (
            <ExhibitorBlock key={placed.stand.standId} placed={placed} eventSlug={eventSlug} passportInfo={passportInfo} named={!single} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** An exhibitor the organizer lists without a place on the map yet. */
export function FairMapUnlocatedDetail({ exhibitor, placeText, headingId, action }: { exhibitor: FairMapExhibitorEntry; placeText: string; headingId: string; action?: ReactNode }) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader} data-sheet-header="">
        <div className={styles.detailHeading}>
          <p className={styles.detailPlace}>{placeText}</p>
          <h2 id={headingId} className={styles.detailTitle} tabIndex={-1}>
            {exhibitor.exhibitorName}
          </h2>
        </div>
        {action}
      </div>
      <div className={styles.detailBody}>
        <ul className={styles.exhibitors} data-single="true">
          <li className={styles.exhibitor}>
            <div className={styles.exhibitorHead}>
              <FairMapLogoBox logoUrl={exhibitor.logoUrl} name={exhibitor.exhibitorName} size="lg" />
              <div className={styles.exhibitorText}>
                <h3 className={styles.srOnly}>{exhibitor.exhibitorName}</h3>
                <WebsiteLink exhibitor={exhibitor.exhibitorName} url={exhibitor.websiteUrl} />
              </div>
            </div>
            <p className={styles.quiet}>{dict.noModels}</p>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function FairMapCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className={styles.iconButton} aria-label={dict.closeDetail} onClick={onClose} data-sheet-close="true">
      <X aria-hidden="true" />
    </button>
  );
}

/**
 * Phone bottom sheet with two heights: a preview (~45 % of the screen, the
 * chosen stand stays visible on the map above it) and the full stand (~90 %,
 * only there the content scrolls). The handle, the sticky header and — in the
 * preview — the whole sheet drag; a drag down past the threshold or a quick
 * flick closes it, and so do the backdrop, Escape and the 44 px close button.
 * It is a modal dialog: the focus moves in and goes back, the page behind does
 * not scroll, and the bottom keeps clear of the home indicator (safe area).
 */
const GHOST_CLICK_MS = 450;
/** Share of the screen the preview shows. */
const PREVIEW_SHARE = 0.45;
/** Movement before a press becomes a drag (a tap on a model link stays a tap). */
const DRAG_SLOP = 6;
/** A drag this far below the preview closes the sheet… */
const CLOSE_DISTANCE = 96;
/** …and so does a flick this fast (px/s) going down. */
const FLICK_SPEED = 700;

type SheetSnap = "preview" | "full";
type SheetMetrics = { height: number; previewY: number };

export function FairMapSheet({ open, labelledBy, onClose, children }: { open: boolean; labelledBy: string; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open ? (
        <SheetPanel key="sheet" labelledBy={labelledBy} onClose={onClose}>
          {children}
        </SheetPanel>
      ) : null}
    </AnimatePresence>
  );
}

function SheetPanel({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const closeRef = useRef(onClose);
  // The click a phone synthesizes after the opening tap lands on the backdrop: ignore it.
  const openedAt = useRef(0);
  const y = useMotionValue(0);
  const [metrics, setMetrics] = useState<SheetMetrics | null>(null);
  const metricsRef = useRef<SheetMetrics | null>(null);
  const [snap, setSnap] = useState<SheetSnap>("preview");
  const [scrolled, setScrolled] = useState(false);
  const snapRef = useRef(snap);
  const drag = useRef<{ id: number; startY: number; from: number; lastY: number; lastT: number; speed: number; active: boolean } | null>(null);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  const settle = useCallback(
    (target: number) => {
      if (reduceMotion) y.set(target);
      else animate(y, target, { duration: FAIR_DURATION.overlay, ease: FAIR_EASE.enter });
    },
    [reduceMotion, y],
  );

  // Measure: the sheet is as tall as its content, at most 90 % of the screen.
  // The preview shows its top 45 %; a short stand has only the one height.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => {
      const height = panel.offsetHeight;
      const visible = Math.min(height, Math.round(window.innerHeight * PREVIEW_SHARE));
      const previewY = height - visible < 32 ? 0 : height - visible;
      const old = metricsRef.current;
      if (old && old.height === height && old.previewY === previewY) return;
      metricsRef.current = { height, previewY };
      if (!old) {
        // First measure: start below the screen, then rise into the preview.
        y.set(reduceMotion ? previewY : height);
        settle(previewY);
      } else if (!drag.current?.active) {
        settle(snapRef.current === "full" || previewY === 0 ? 0 : previewY);
      }
      setMetrics({ height, previewY });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [reduceMotion, settle, y]);

  // Focus in, Tab kept inside, Escape closes, focus back; the page behind stays put.
  useEffect(() => {
    openedAt.current = performance.now();
    // A stand on the map is an SVG element: both kinds can take the focus back.
    const active = document.activeElement;
    const previous = active instanceof HTMLElement || active instanceof SVGElement ? active : null;
    const panel = panelRef.current;
    const root = document.documentElement;
    const locked = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    root.style.overflow = "hidden";
    root.style.scrollbarGutter = "stable";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusables = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!focusables.length) return;
      const firstItem = focusables[0];
      const lastItem = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = locked.overflow;
      root.style.scrollbarGutter = locked.gutter;
      previous?.focus({ preventScroll: true });
    };
  }, []);

  // The focus moves in once the sheet is measured and visible (a hidden element cannot take it).
  const ready = metrics !== null;
  useEffect(() => {
    if (ready) panelRef.current?.querySelector<HTMLElement>("[data-sheet-close]")?.focus({ preventScroll: true });
  }, [ready]);

  const twoHeights = metrics !== null && metrics.previewY > 0;
  const goTo = (next: SheetSnap) => {
    if (!metrics) return;
    setSnap(next);
    settle(next === "full" || !twoHeights ? 0 : metrics.previewY);
    if (next === "preview") bodyRef.current?.scrollTo({ top: 0 });
  };

  /** Where a drag may start: the handle and the header always; the whole sheet while it is a preview. */
  const canDrag = (target: Element) =>
    target.closest("[data-sheet-handle]") !== null || target.closest("[data-sheet-header]") !== null || (snapRef.current === "preview" && twoHeights) || !twoHeights;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!metrics || event.button !== 0 || (event.target as Element).closest("[data-sheet-close]")) return;
    if (!canDrag(event.target as Element)) return;
    drag.current = { id: event.pointerId, startY: event.clientY, from: y.get(), lastY: event.clientY, lastT: event.timeStamp, speed: 0, active: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId || !metrics) return;
    const delta = event.clientY - state.startY;
    if (!state.active) {
      if (Math.abs(delta) < DRAG_SLOP) return;
      state.active = true;
      panelRef.current?.setPointerCapture(event.pointerId);
    }
    const dt = Math.max(event.timeStamp - state.lastT, 1);
    state.speed = 0.7 * ((event.clientY - state.lastY) / dt) * 1000 + 0.3 * state.speed;
    state.lastY = event.clientY;
    state.lastT = event.timeStamp;
    const next = state.from + delta;
    // Above the full height the sheet resists instead of leaving the bottom edge.
    y.set(next < 0 ? next * 0.2 : next);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    if (!state.active || !metrics) return;
    // The click that ends a drag must not open a model link or toggle the handle under the finger.
    const swallow = (click: MouseEvent) => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 250);
    const current = y.get();
    const rest = twoHeights ? metrics.previewY : 0;
    const projected = current + state.speed * 0.12;
    if (current > rest + CLOSE_DISTANCE || (state.speed > FLICK_SPEED && (snapRef.current === "preview" || !twoHeights || current > rest))) {
      closeRef.current();
      return;
    }
    if (!twoHeights) {
      settle(0);
      return;
    }
    goTo(projected < metrics.previewY / 2 || state.speed < -FLICK_SPEED ? "full" : "preview");
  };

  const exitY = metrics ? metrics.height + 24 : 900;
  return (
    <div className={styles.sheetRoot}>
      <motion.div
        className={styles.sheetBackdrop}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: FAIR_DURATION.overlay, ease: FAIR_EASE.enter } }}
        exit={{ opacity: 0, transition: { duration: FAIR_DURATION.state, ease: FAIR_EASE.exit } }}
        onClick={() => {
          if (performance.now() - openedAt.current > GHOST_CLICK_MS) onClose();
        }}
      />
      <motion.div
        ref={panelRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-ready={ready}
        data-snap={twoHeights ? snap : "full"}
        data-scrolled={scrolled}
        style={{ y }}
        initial={reduceMotion ? { opacity: 0 } : false}
        animate={reduceMotion ? { opacity: 1, transition: { duration: FAIR_DURATION.state } } : undefined}
        exit={reduceMotion ? { opacity: 0, transition: { duration: FAIR_DURATION.state } } : { y: exitY, transition: { duration: FAIR_DURATION.state, ease: FAIR_EASE.exit } }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <button
          type="button"
          className={styles.sheetHandle}
          data-sheet-handle=""
          aria-label={twoHeights && snap === "preview" ? dict.sheetExpand : dict.sheetCollapse}
          aria-describedby="fair-map-sheet-hint"
          disabled={!twoHeights}
          onClick={() => goTo(snap === "preview" ? "full" : "preview")}
        >
          <span aria-hidden="true" />
        </button>
        <span id="fair-map-sheet-hint" className={styles.srOnly}>
          {dict.sheetHandle}
        </span>
        <div ref={bodyRef} className={styles.sheetBody} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
