import Link from "next/link";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
import { ChevronRight, ExternalLink, Stamp, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { FairPassportCatalogEntry } from "@/lib/fair-contract";
import type { FairMapExhibitorEntry, FairMapLocationSummary, FairMapPlacedStand } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { FairMapLogoBox } from "./fair-map-logo";
import { fairMapSummaryText } from "./fair-map-text";
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

function ExhibitorBlock({ placed, eventSlug, passportInfo }: { placed: FairMapPlacedStand; eventSlug: string; passportInfo: FairMapPassportInfo }) {
  const { stand } = placed;
  return (
    <li className={styles.exhibitor}>
      <div className={styles.exhibitorHead}>
        <FairMapLogoBox logoUrl={stand.logoUrl} name={stand.exhibitorName} size="lg" />
        <div className={styles.exhibitorText}>
          <h3 className={styles.exhibitorName}>{stand.exhibitorName}</h3>
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
        })
      )}
    </li>
  );
}

/** The selected location: header "Štand 2 · Hala · 490 m²" and every exhibitor there. */
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
  return (
    <div className={styles.detail} data-kind={summary.location.kind}>
      <div className={styles.detailHeader}>
        <div>
          <p className={styles.eyebrow}>{dict.selectedStand}</p>
          <h2 id={headingId} className={styles.detailTitle} tabIndex={-1}>
            {fairMapSummaryText(summary)}
          </h2>
          {summary.location.kind === "scanme" ? <p className={styles.scanmeNote}>{dict.scanmeBody}</p> : null}
        </div>
        {action}
      </div>
      <ul className={styles.exhibitors}>
        {summary.stands.map((placed) => (
          <ExhibitorBlock key={placed.stand.standId} placed={placed} eventSlug={eventSlug} passportInfo={passportInfo} />
        ))}
      </ul>
    </div>
  );
}

/** An exhibitor the organizer lists without a place on the map yet. */
export function FairMapUnlocatedDetail({ exhibitor, placeText, headingId, action }: { exhibitor: FairMapExhibitorEntry; placeText: string; headingId: string; action?: ReactNode }) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div>
          <p className={styles.eyebrow}>{placeText}</p>
          <h2 id={headingId} className={styles.detailTitle} tabIndex={-1}>
            {exhibitor.exhibitorName}
          </h2>
        </div>
        {action}
      </div>
      <ul className={styles.exhibitors}>
        <li className={styles.exhibitor}>
          <div className={styles.exhibitorHead}>
            <FairMapLogoBox logoUrl={exhibitor.logoUrl} name={exhibitor.exhibitorName} size="lg" />
            <div className={styles.exhibitorText}>
              <h3 className={styles.exhibitorName}>{exhibitor.exhibitorName}</h3>
              <WebsiteLink exhibitor={exhibitor.exhibitorName} url={exhibitor.websiteUrl} />
            </div>
          </div>
          <p className={styles.quiet}>{dict.noModels}</p>
        </li>
      </ul>
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
 * Phone bottom sheet: never the whole screen (the chosen stand stays visible
 * above it), safe-area aware, drag the handle down / Esc / tap outside to
 * close; focus moves in and goes back to where it came from.
 */
const GHOST_CLICK_MS = 450;

export function FairMapSheet({ open, labelledBy, onClose, children }: { open: boolean; labelledBy: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  const reduceMotion = useReducedMotion();
  const closeRef = useRef(onClose);
  // The click a phone synthesizes after the opening tap lands on the backdrop: ignore it.
  const openedAt = useRef(0);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    openedAt.current = performance.now();
    // A stand on the map is an SVG element: both kinds can take the focus back.
    const active = document.activeElement;
    const previous = active instanceof HTMLElement || active instanceof SVGElement ? active : null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-sheet-close]")?.focus({ preventScroll: true });
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
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  const duration = reduceMotion ? 0 : 0.24;
  return (
    <AnimatePresence>
      {open ? (
        <div className={styles.sheetRoot}>
          <motion.div
            className={styles.sheetBackdrop}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: duration * 0.7 } }}
            transition={{ duration }}
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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%", transition: { duration: duration * 0.7, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
          >
            <div className={styles.sheetHandle} onPointerDown={(event) => drag.start(event)}>
              <span aria-hidden="true" />
              <span className={styles.srOnly}>{dict.sheetHandle}</span>
            </div>
            <div className={styles.sheetBody}>{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
