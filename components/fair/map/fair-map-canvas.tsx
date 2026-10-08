import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Layers, MapPin, Maximize2, Minus, Plus, Stamp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { FairPublicMapStand } from "@/lib/fair-contract";
import {
  fairMapBadgeRadius,
  fairMapBounds,
  fairMapChipGrid,
  fairMapClamp,
  fairMapFit,
  fairMapFocus,
  fairMapInscribedRect,
  fairMapLabelPoint,
  fairMapLimits,
  fairMapLocationTakesStands,
  fairMapLogo,
  fairMapPointsAttr,
  fairMapStandLayout,
  fairMapTouchLocation,
  fairMapZoomAt,
  type FairMapLocation,
  type FairMapPlacedStand,
  type FairMapPoint,
  type FairMapRect,
  type FairMapSize,
  type FairMapViewport,
  type FairMapZoneView,
} from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { fairMapPlaceText } from "./fair-map-text";
import styles from "./fair-event-map.module.css";

// N4 — one zone of the map as a vector drawing from the organizer geometry
// (lib/fair-map): paper card with a fine grid, the zone outline, landmarks,
// every stand with its number badge (once per split stand) and its
// exhibitors' logo chips, partner points as circles, the open rear area.
// The organizer's JPG is only an optional underlay ("Originalna mapa").
// Pan / pinch / wheel / +/−/fit as in the test map (framer-motion values, no
// re-render per frame), at most 4× the fitted view; Tab reaches every
// occupied stand and Enter/Space selects it. Nothing here writes anything.

/** EDS §5.1 `event.scanmeStand`: set ONLY on the ScanMe location (EDS §3: never CTA, progress, selection or decoration). */
const SCANME_STAND_STYLE = { "--fair-map-scanme": "#C6FF4A" } as CSSProperties;
const TAP_SLOP = 8;
const CHIP_ASPECT = 1.7;
/** Smallest on-screen badge radius (px): numbers stay readable on the fitted map and grow when zoomed in. */
const BADGE_MIN_PX = 11;
const BADGE_MIN_PX_DISPLAY = 19;

export type ZoneFocusRequest = { locationId: string; key: number; anchorY: number };

type ZoneItem = {
  location: FairMapLocation;
  stands: FairMapPlacedStand[];
  badge: FairMapPoint | null;
  chips: Array<{ rect: FairMapRect; stand: FairPublicMapStand }>;
  box: FairMapRect;
};

function Chip({ rect, stand }: { rect: FairMapRect; stand: FairPublicMapStand }) {
  const logo = fairMapLogo(stand.logoUrl);
  const pad = Math.min(rect.height, rect.width) * 0.12;
  const fontSize = rect.height * 0.26;
  const maxChars = Math.max(Math.floor((rect.width - 2 * pad) / (fontSize * 0.56)), 3);
  const name = stand.exhibitorName.length > maxChars ? `${stand.exhibitorName.slice(0, maxChars - 1)}…` : stand.exhibitorName;
  return (
    <g className={styles.chip}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={rect.height * 0.2} />
      {logo ? (
        <image href={logo.src} x={rect.x + pad} y={rect.y + pad} width={rect.width - 2 * pad} height={rect.height - 2 * pad} preserveAspectRatio="xMidYMid meet" />
      ) : (
        <text x={rect.x + rect.width / 2} y={rect.y + rect.height / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize}>
          {name}
        </text>
      )}
    </g>
  );
}

function PartnerPoint({ box, stand }: { box: FairMapRect; stand: FairPublicMapStand | undefined }) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.max(box.width, box.height) * 0.58;
  const logo = stand ? fairMapLogo(stand.logoUrl) : null;
  const side = r * 1.3;
  return (
    <>
      <circle className={styles.partnerCircle} cx={cx} cy={cy} r={r} />
      {logo ? <image href={logo.src} x={cx - side / 2} y={cy - side / 2} width={side} height={side} preserveAspectRatio="xMidYMid meet" /> : null}
    </>
  );
}

export function ZoneCanvas({
  zoneView,
  active,
  interactive,
  display,
  lit,
  selectedLocationId,
  focus,
  highlight,
  showOriginal,
  passportMarkers,
  bubble,
  onSelect,
  onToggleOriginal,
}: {
  zoneView: FairMapZoneView;
  /** Shown on screen (the chosen zone on a phone; every zone on a large display). */
  active: boolean;
  /** Gestures, Tab and the map buttons; off on the fair display. */
  interactive: boolean;
  display: boolean;
  /** Locations that stay lit under the filter/search; null = none dimmed. */
  lit: Set<string> | null;
  selectedLocationId: string | null;
  focus: ZoneFocusRequest | null;
  /** M2: the rotation's active stand in this zone; `key` restarts the reveal each slot. */
  highlight: { location: FairMapLocation; key: number } | null;
  showOriginal: boolean;
  /** Location id → the visitor's passport N/M label. */
  passportMarkers: ReadonlyMap<string, string>;
  /** Small callout over the selected stand (desktop); null for none. */
  bubble: string | null;
  onSelect: (locationId: string) => void;
  onToggleOriginal: () => void;
}) {
  const { zone } = zoneView;
  const content = useMemo<FairMapSize>(() => ({ width: zone.image.width, height: zone.image.height }), [zone.image.width, zone.image.height]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const inverse = useTransform(scale, (value) => 1 / value);
  const radius = fairMapBadgeRadius(zone, display);
  const badgeMin = display ? BADGE_MIN_PX_DISPLAY : BADGE_MIN_PX;
  const badgeScale = useTransform(scale, (value) => Math.max(1, badgeMin / (radius * value)));
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState<FairMapSize | null>(null);
  const controls = useRef<Array<{ stop: () => void }>>([]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: FairMapViewport; px: number; py: number; distance: number; moved: number; locationId: string | null; touch: boolean } | null>(null);
  const padding = display ? 6 : 12;
  const limits = size ? fairMapLimits(size, content, padding) : null;

  const current = useCallback((): FairMapViewport => ({ scale: scale.get(), x: x.get(), y: y.get() }), [scale, x, y]);
  const apply = useCallback(
    (next: FairMapViewport, animated: boolean) => {
      controls.current.forEach((control) => control.stop());
      controls.current = [];
      if (animated && !reduceMotion) {
        const transition = { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const };
        controls.current = [animate(x, next.x, transition), animate(y, next.y, transition), animate(scale, next.scale, transition)];
      } else {
        x.set(next.x);
        y.set(next.y);
        scale.set(next.scale);
      }
    },
    [reduceMotion, scale, x, y],
  );

  // Measure the viewport; fit on first measure and on every resize (rotation, zone shown).
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (next.width && next.height) setSize((old) => (old && old.width === next.width && old.height === next.height ? old : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size && limits) apply(fairMapFit(size, content, limits), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the measured size changes
  }, [size]);

  // A focus request (selection, search, list, deep link) for a location of this zone.
  useEffect(() => {
    if (!focus || !active || !size || !limits) return;
    const location = zone.locations.find((row) => row.id === focus.locationId);
    if (!location) return;
    apply(fairMapFocus(fairMapBounds(location.polygon), size, content, limits, focus.anchorY), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one move per request
  }, [focus?.key, active, size]);

  const zoomBy = (factor: number) => {
    if (!size || !limits) return;
    apply(fairMapZoomAt(current(), factor, { x: size.width / 2, y: size.height / 2 }, size, content, limits), true);
  };

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || !interactive) return;
    const onWheel = (event: WheelEvent) => {
      if (!size || !limits) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      apply(fairMapZoomAt(current(), Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }, size, content, limits), false);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [apply, content, current, interactive, limits, size]);

  const occupiedLocations = useMemo(() => zoneView.locations.map((row) => row.location), [zoneView.locations]);
  /** The occupied location whose touch zone holds the viewport point (px, py), or null. */
  const touchedLocation = (px: number, py: number) => {
    const view = current();
    return fairMapTouchLocation([(px - view.x) / view.scale, (py - view.y) / view.scale], occupiedLocations, view.scale);
  };

  const local = (event: ReactPointerEvent) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || (event.target as Element).closest("button")) return;
    controls.current.forEach((control) => control.stop());
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    const all = [...pointers.current.values()];
    const distance = all.length === 2 ? Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y) : 0;
    const mid = all.length === 2 ? { x: (all[0].x + all[1].x) / 2, y: (all[0].y + all[1].y) / 2 } : point;
    const locationId = all.length === 1 ? ((event.target as Element).closest("[data-location-id]")?.getAttribute("data-location-id") ?? null) : null;
    gesture.current = { start: current(), px: mid.x, py: mid.y, distance, moved: all.length > 1 ? TAP_SLOP + 1 : 0, locationId, touch: event.pointerType !== "mouse" };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !size || !limits || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, local(event));
    const all = [...pointers.current.values()];
    if (all.length >= 2 && g.distance > 0) {
      const distance = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
      const mid = { x: (all[0].x + all[1].x) / 2, y: (all[0].y + all[1].y) / 2 };
      const next = fairMapZoomAt(g.start, distance / g.distance, { x: g.px, y: g.py }, size, content, limits);
      apply(fairMapClamp({ ...next, x: next.x + (mid.x - g.px), y: next.y + (mid.y - g.py) }, size, content, limits), false);
      g.moved = TAP_SLOP + 1;
      return;
    }
    const dx = all[0].x - g.px;
    const dy = all[0].y - g.py;
    g.moved = Math.max(g.moved, Math.hypot(dx, dy));
    if (g.moved > TAP_SLOP) apply(fairMapClamp({ scale: g.start.scale, x: g.start.x + dx, y: g.start.y + dy }, size, content, limits), false);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0) {
      // Pinch → pan handover: restart from the remaining finger.
      const [rest] = pointers.current.values();
      gesture.current = g ? { ...g, start: current(), px: rest.x, py: rest.y, distance: 0, locationId: null } : null;
      return;
    }
    gesture.current = null;
    if (!g || event.type !== "pointerup" || g.moved > TAP_SLOP) return;
    // D1 (RN N7): a finger that missed a small stand still reaches it — every
    // occupied location has an invisible touch zone of at least 44 CSS px.
    const locationId = g.locationId ?? (g.touch ? touchedLocation(g.px, g.py) : null);
    if (locationId) onSelect(locationId);
  };

  const items = useMemo<ZoneItem[]>(() => {
    const occupied = new Map(zoneView.locations.map((row) => [row.location.id, row.stands]));
    const chipOptions = { aspect: CHIP_ASPECT, gap: zone.image.width * 0.006, padding: zone.image.width * 0.006, maxWidth: zone.image.width * 0.15 };
    // D1 (RN nisko): a placeholder (AMF "scanme") is not on the organizer map — not drawn.
    return zone.locations.filter(fairMapLocationTakesStands).map((location) => {
      const stands = [...(occupied.get(location.id) ?? [])].sort((a, b) => a.stand.exhibitorName.localeCompare(b.stand.exhibitorName, "sr"));
      const layout = fairMapStandLayout(location, radius);
      const chips = location.kind === "partner" ? [] : fairMapChipGrid(layout.chips, stands.length, chipOptions).map((rect, index) => ({ rect, stand: stands[index].stand }));
      return { location, stands, badge: layout.badge, chips, box: fairMapInscribedRect(location.polygon) };
    });
  }, [radius, zone, zoneView.locations]);

  const selectedItem = items.find((item) => item.location.id === selectedLocationId && item.stands.length) ?? null;
  const dimmed = (item: ZoneItem) => (item.stands.length ? lit !== null && !lit.has(item.location.id) : lit !== null);
  const badges = [
    ...items.flatMap((item) => (item.badge ? [{ key: item.location.id, at: item.badge, label: item.location.label, empty: !item.stands.length, dim: dimmed(item), selected: item.location.id === selectedLocationId }] : [])),
    ...(zone.groups ?? []).flatMap((group) => {
      if (!group.badge) return [];
      const boxes = items.filter((item) => item.location.group === group.id);
      return [{ key: group.id, at: group.badge, label: group.label, empty: boxes.every((item) => !item.stands.length), dim: boxes.every(dimmed), selected: boxes.some((item) => item.location.id === selectedLocationId) }];
    }),
  ];
  const zoneName = dict.zones[zone.id];
  const hatchId = `fair-map-hatch-${zone.id}`;
  const gridId = `fair-map-grid-${zone.id}`;
  const grid = zone.image.width / 40;
  const stroke = zone.image.width / 600;

  return (
    <section className={styles.zone} data-active={active} data-zone={zone.id} aria-label={zoneName}>
      <div className={styles.zoneBar}>
        <h2 className={styles.zoneTitle}>{zoneName}</h2>
        {interactive ? (
          <>
            <button type="button" className={styles.originalToggle} aria-pressed={showOriginal} onClick={onToggleOriginal}>
              <Layers aria-hidden="true" />
              {dict.originalMap}
            </button>
            <div className={styles.controls} role="group" aria-label={dict.mapControlsLabel}>
              <button type="button" className={styles.controlButton} aria-label={dict.zoomIn} onClick={() => zoomBy(1.5)}>
                <Plus aria-hidden="true" />
              </button>
              <button type="button" className={styles.controlButton} aria-label={dict.zoomOut} onClick={() => zoomBy(1 / 1.5)}>
                <Minus aria-hidden="true" />
              </button>
              <button type="button" className={styles.controlButton} aria-label={dict.fitMap} onClick={() => size && limits && apply(fairMapFit(size, content, limits), true)}>
                <Maximize2 aria-hidden="true" />
              </button>
            </div>
          </>
        ) : null}
      </div>
      <div
        ref={viewportRef}
        className={styles.viewport}
        data-interactive={interactive}
        data-original={showOriginal}
        style={{ "--fair-map-ratio": `${zone.image.width} / ${zone.image.height}` } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <motion.div className={styles.layer} style={{ x, y, scale, width: zone.image.width, height: zone.image.height, visibility: size ? "visible" : "hidden" }}>
          <svg viewBox={`0 0 ${zone.image.width} ${zone.image.height}`} width={zone.image.width} height={zone.image.height} role="group" aria-label={fmt(dict.mapAria, { zone: zoneName })}>
            <defs>
              <pattern id={gridId} width={grid} height={grid} patternUnits="userSpaceOnUse">
                <path d={`M${grid} 0H0V${grid}`} className={styles.gridLine} strokeWidth={stroke * 0.6} />
              </pattern>
              <pattern id={hatchId} width={grid * 0.45} height={grid * 0.45} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d={`M0 0V${grid * 0.45}`} className={styles.hatchLine} strokeWidth={stroke * 1.4} />
              </pattern>
            </defs>
            <rect width={zone.image.width} height={zone.image.height} className={styles.paper} />
            <rect width={zone.image.width} height={zone.image.height} fill={`url(#${gridId})`} />
            {showOriginal ? <image href={zone.image.src} width={zone.image.width} height={zone.image.height} className={styles.original} /> : null}
            {zone.outline ? <polygon points={fairMapPointsAttr(zone.outline)} className={styles.zoneOutline} strokeWidth={stroke * 2.5} /> : null}

            {zone.landmarks.map((landmark) => {
              const bounds = fairMapBounds(landmark.polygon);
              const points = fairMapPointsAttr(landmark.polygon);
              if (landmark.kind === "stairs") return <polygon key={landmark.id} points={points} fill={`url(#${hatchId})`} className={styles.stairs} strokeWidth={stroke} aria-hidden="true" />;
              if (landmark.kind === "totem") return <polygon key={landmark.id} points={points} className={styles.totem} aria-hidden="true" />;
              if (landmark.kind === "parking") {
                const fontSize = Math.min(bounds.maxY - bounds.minY, bounds.maxX - bounds.minX) * 0.55;
                const [cx, cy] = fairMapLabelPoint(landmark.polygon);
                return (
                  <g key={landmark.id} className={styles.parking} aria-hidden="true">
                    <polygon points={points} strokeWidth={stroke * 1.2} />
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={fontSize}>
                      {dict.landmarkParking}
                    </text>
                  </g>
                );
              }
              return (
                <g key={landmark.id} className={styles.entrance}>
                  <polygon points={points} />
                  <text x={bounds.minX - zone.image.width * 0.012} y={(bounds.minY + bounds.maxY) / 2} textAnchor="end" dominantBaseline="central" fontSize={zone.image.width * 0.024}>
                    {dict.landmarkEntrance}
                  </text>
                </g>
              );
            })}

            {/* Empty locations: drawn (they are on the organizer map), not interactive. */}
            {items
              .filter((item) => !item.stands.length && item.location.kind !== "scanme")
              .map((item) => (
                <g key={item.location.id} className={styles.standEmpty} data-dimmed={lit !== null} aria-hidden="true">
                  <polygon points={fairMapPointsAttr(item.location.polygon)} strokeWidth={stroke * 1.5} />
                </g>
              ))}

            {/* D1 (RN N5): the ScanMe stand is always ScanMe green — without a stand row it is only drawn, not interactive. */}
            {items
              .filter((item) => item.stands.length || item.location.kind === "scanme")
              .map((item) => {
                const { location } = item;
                const open = item.stands.length > 0;
                const selected = open && location.id === selectedLocationId;
                const shape = <polygon className={styles.standShape} points={fairMapPointsAttr(location.polygon)} strokeWidth={stroke * (selected ? 4 : 2)} />;
                return (
                  <g
                    key={location.id}
                    className={styles.stand}
                    data-location-id={open ? location.id : undefined}
                    data-kind={location.kind}
                    data-selected={selected}
                    data-dimmed={lit !== null && !lit.has(location.id)}
                    role={open ? "button" : undefined}
                    tabIndex={open ? (interactive && active ? 0 : -1) : undefined}
                    aria-hidden={open ? undefined : true}
                    aria-pressed={open ? selected : undefined}
                    aria-label={open ? fmt(dict.locationAria, { location: fairMapPlaceText(location, zone.id), exhibitors: item.stands.map((row) => row.stand.exhibitorName).join(", ") }) : undefined}
                    onClick={(event) => {
                      // Keyboard / assistive activation; pointer taps are handled on the viewport.
                      if (open && event.detail === 0 && interactive) onSelect(location.id);
                    }}
                    onKeyDown={(event) => {
                      if (open && interactive && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onSelect(location.id);
                      }
                    }}
                  >
                    {selected ? <polygon className={styles.selectedGlow} points={fairMapPointsAttr(location.polygon)} strokeWidth={stroke * 14} /> : null}
                    {location.kind === "scanme" ? (
                      <g className={styles.scanmeLocation} style={SCANME_STAND_STYLE}>
                        {shape}
                      </g>
                    ) : (
                      shape
                    )}
                    {location.kind === "partner" ? <PartnerPoint box={item.box} stand={item.stands[0]?.stand} /> : null}
                    {item.chips.map((chip) => (
                      <Chip key={chip.stand.standId} rect={chip.rect} stand={chip.stand} />
                    ))}
                  </g>
                );
              })}

            {highlight ? (
              <g key={highlight.key} className={styles.rotationHighlight} aria-hidden="true">
                <polygon className={styles.rotationGlow} points={fairMapPointsAttr(highlight.location.polygon)} strokeWidth={stroke * 16} />
                <polygon points={fairMapPointsAttr(highlight.location.polygon)} strokeWidth={stroke * 4} />
              </g>
            ) : null}
          </svg>

          {/* Stand numbers (a split stand's label once, where the organizer prints it). */}
          {badges.map((badge) => (
            <motion.span
              key={`badge-${badge.key}`}
              className={styles.badge}
              aria-hidden="true"
              data-empty={badge.empty}
              data-dimmed={badge.dim}
              data-selected={badge.selected}
              style={{ left: badge.at[0], top: badge.at[1], x: "-50%", y: "-50%", scale: badgeScale, height: 2 * radius, minWidth: 2 * radius, fontSize: radius * 1.05, paddingInline: radius * 0.45 }}
            >
              {badge.label}
            </motion.span>
          ))}
          {highlight
            ? (() => {
                const bounds = fairMapBounds(highlight.location.polygon);
                const below = bounds.minY < zone.image.height * 0.08;
                return (
                  <motion.span
                    key={`pin-${highlight.key}`}
                    className={styles.rotationPin}
                    data-below={below}
                    aria-hidden="true"
                    style={{ left: (bounds.minX + bounds.maxX) / 2, top: below ? bounds.maxY : bounds.minY, scale: inverse, x: "-50%", y: below ? "0%" : "-100%" }}
                  >
                    <MapPin />
                    <span className={styles.pinText}>{dict.rotationStandPin}</span>
                  </motion.span>
                );
              })()
            : null}
          {items
            .filter((item) => passportMarkers.has(item.location.id))
            .map((item) => (
              <motion.span
                key={`passport-${item.location.id}`}
                className={styles.marker}
                aria-hidden="true"
                style={{ left: item.box.x + item.box.width, top: item.box.y + item.box.height, scale: inverse, x: "-100%", y: "-100%" }}
              >
                <Stamp />
                {passportMarkers.get(item.location.id)}
              </motion.span>
            ))}
          {bubble && selectedItem ? (
            <motion.span
              className={styles.bubble}
              aria-hidden="true"
              style={{ left: selectedItem.box.x + selectedItem.box.width / 2, top: fairMapBounds(selectedItem.location.polygon).minY, scale: inverse, x: "-50%", y: "-100%" }}
            >
              {bubble}
            </motion.span>
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}
