"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { Check, Maximize2 } from "lucide-react";
import { siAudi, siDacia, siFord, siOpel, siVespa } from "simple-icons";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { fairMapClamp, fairMapFit, fairMapLimits, fairMapZoomAt, type FairMapSize, type FairMapViewport, type FairMapZoneId } from "@/lib/fair-map";
import { AMF_TOPOGRAPHIC_HALL, AMF_TOPOGRAPHIC_SIZE, amfTopographicPopupPosition, amfTopographicSize, fairMapContourOpacity, fairMapContourPath, hitAmfTopographicExhibit, type AmfTopographicExhibit } from "@/lib/fair-map/topography";
import { FairBrandMark } from "../garage/fair-brand-mark";
import Image from "next/image";
import { amfMapSr as dict } from "./amf-map-copy";
import styles from "./amf-topographic-map.module.css";
// Monochrome look baked into the raster logos (scripts/fair/bake-map-logos.mjs).
import hondaMotoLogo from "./brand-assets/map/honda-moto.png";
import motogriniLogo from "./brand-assets/map/motogrini.png";
import piaggioLogo from "./brand-assets/map/piaggio.png";
import tvsLogo from "./brand-assets/tvs.svg";
import apriliaLogo from "./brand-assets/map/aprilia.png";
import jetourLogo from "./brand-assets/map/jetour.png";
import { amfEntranceCroppedLogos, amfEntranceLogos } from "./amf-entrance-logos";
import { amfEntrancePoint, AMF_ENTRANCE_PLAN, AMF_ENTRANCE_SIZE, AMF_FORECOURT_SCALE } from "@/lib/fair-map/amf-entrance-plan";
import { BrandLogo } from "@/components/brand-logo";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const ENTRANCE_FOYER = AMF_ENTRANCE_PLAN.foyer.map((point, i) => `${i ? "L" : "M"}${amfEntrancePoint(point).join(" ")}`).join(" ");
const ENTRANCE_STAIRS = amfEntrancePoint([AMF_ENTRANCE_PLAN.stairs.x, AMF_ENTRANCE_PLAN.stairs.y]);
const OUTSIDE_STEPS = amfEntrancePoint([AMF_ENTRANCE_PLAN.outsideSteps.x, AMF_ENTRANCE_PLAN.outsideSteps.y]);
const ENTRANCE_LABEL = amfEntrancePoint([252.5, 835]);

/** A drawing-space box as percentages of the drawing, for the HTML label layer. */
function percentBox(box: { x: number; y: number; width: number; height: number }, content: FairMapSize): CSSProperties {
  return {
    left: `${(box.x / content.width) * 100}%`,
    top: `${(box.y / content.height) * 100}%`,
    width: `${(box.width / content.width) * 100}%`,
    height: `${(box.height / content.height) * 100}%`,
  };
}

const motorcycleLogos = {
  "honda-moto": hondaMotoLogo,
  motogrini: motogriniLogo,
  piaggio: piaggioLogo,
  tvs: tvsLogo,
  aprilia: apriliaLogo,
  // 30 Oct 2026: Jetour shares the motorcycle wing of stand 6-7 (organizer plan).
  jetour: jetourLogo,
};

// Wide emblems need tight presentation bounds, not a padded square icon box.
const wideHallLogos = {
  audi: { path: siAudi.path, viewBox: "-0.2 7.6 24.4 8.8" },
  dacia: { path: siDacia.path, viewBox: "-0.2 8.4 24.4 7.2" },
  ford: { path: siFord.path, viewBox: "-0.2 7.3 24.4 9.4" },
  opel: { path: siOpel.path, viewBox: "-0.2 4.3 24.4 15.4" },
};

function brandFrame(item: AmfTopographicExhibit, stretchY: number) {
  if (item.area === "foyer") return { x: item.x - item.rx + 9, y: item.y - item.ry + 9, width: item.rx * 2 - 18, height: item.ry * 2 - 18 };
  if (item.area === "outdoor") {
    const width = (item.key === "auto-happy-outdoor" ? 164 : item.key === "swm" ? 100 : item.key === "moto-revolution" ? 90 : item.key === "aodes" ? 150 : 140) * AMF_FORECOURT_SCALE;
    const height = (item.key === "auto-happy-outdoor" ? 84 : item.key === "swm" || item.key === "kia" ? 48 : item.key === "moto-revolution" ? 40 : 110) * AMF_FORECOURT_SCALE;
    return { x: item.x - width / 2, y: item.y - height / 2, width, height };
  }
  const scale = Math.min(stretchY, 1);
  const width = item.small ? 180 : item.rx * 1.84;
  const height = (item.small ? 52 : item.key === "mercedes" ? 160 : item.moto ? 100 : 118) * (item.small ? 1 : scale);
  const offset = !item.area && !item.small && !item.moto && item.key !== "mercedes" ? 2 * scale : 0;
  return { x: item.x - width / 2, y: item.y - height / 2 + offset, width, height };
}

function Brand({ item }: { item: AmfTopographicExhibit }) {
  if (item.small) return <span className={styles.smallName}>{item.name}</span>;
  if (item.logoUrl === "/fair/demo/logo.svg") return <><Image src={item.logoUrl} alt="" width={90} height={65} unoptimized data-demo-logo="" /><span className={styles.brandName}>{item.name}</span></>;
  if (item.area) {
    if (item.key === "scanme") return <BrandLogo className={styles.scanmeLogo} width="100%" />;
    if (item.key === "lukac") return <span className={styles.lukacLogo}>{item.name}</span>;
    if (item.key === "makete") return <span className={styles.maketeName}>{item.name}</span>;
    const baked = amfEntranceLogos[item.key as keyof typeof amfEntranceLogos];
    const logo = baked ?? item.logoUrl;
    const caption = dict.entranceCaptions[item.key as keyof typeof dict.entranceCaptions] ?? item.name;
    const needsCaption = !logo || ["direkcija", "ton", "parking"].includes(item.key);
    return <>{logo ? <Image className={styles.entranceLogo} data-entrance-logo="" data-baked={baked ? "" : undefined} data-crop={amfEntranceCroppedLogos.has(item.key) ? "" : undefined} src={logo} alt="" width={200} height={100} unoptimized /> : null}{needsCaption ? <span className={styles.entranceName}>{caption}</span> : null}</>;
  }
  const logo = motorcycleLogos[item.key as keyof typeof motorcycleLogos];
  if (logo) return <Image className={styles.motorcycleLogo} data-baked={logo === tvsLogo ? undefined : ""} src={logo} alt="" width={160} height={100} unoptimized />;
  const wideLogo = wideHallLogos[item.key as keyof typeof wideHallLogos];
  if (wideLogo) return <><svg className={styles.wideHallLogo} viewBox={wideLogo.viewBox} aria-hidden="true"><path d={wideLogo.path} fill="currentColor" /></svg><span className={styles.brandName}>{item.name}</span></>;
  return (
    <>
      {item.key === "vespa" ? (
        <svg className={styles.vespaLogo} viewBox="-0.1 7.7 24.2 8.6" aria-hidden="true"><path d={siVespa.path} fill="currentColor" /></svg>
      ) : (
        <FairBrandMark brandName={item.name} fallback={<span className={styles.wordmark}>{item.name}</span>} />
      )}
      {!["geely", "vespa"].includes(item.key) && <span className={styles.brandName}>{item.name}</span>}
    </>
  );
}

/**
 * The part of a label child that is actually visible: an <img> with
 * `object-fit: contain` only paints its letterboxed artwork, and a text span
 * only its line boxes. The selection ring circles this, not the element box.
 */
function visibleRect(element: Element): DOMRect {
  const box = element.getBoundingClientRect();
  if (element instanceof HTMLImageElement && element.naturalWidth && element.naturalHeight) {
    const fit = Math.min(box.width / element.naturalWidth, box.height / element.naturalHeight);
    const width = element.naturalWidth * fit, height = element.naturalHeight * fit;
    return new DOMRect(box.left + (box.width - width) / 2, box.top + (box.height - height) / 2, width, height);
  }
  if (element.childElementCount === 0 && element.textContent?.trim()) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    if (text.width && text.height) return text;
  }
  return box;
}

function Stairs({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return <g className={styles.stairs} aria-hidden="true">
    <rect x={x} y={y} width={width} height={height} rx="2" />
    {Array.from({ length: 11 }, (_, i) => <line key={i} x1={x} x2={x + width} y1={y + (i + 1) * height / 12} y2={y + (i + 1) * height / 12} />)}
  </g>;
}

export function AmfTopographicCanvas({ items, zoneId, selectedKey, levels, completed, onSelect, onDismiss, popup, interactive = true }: {
  items: AmfTopographicExhibit[];
  zoneId: FairMapZoneId;
  selectedKey: string | null;
  levels: ReadonlyMap<string, number>;
  completed: ReadonlySet<string>;
  onSelect: (item: AmfTopographicExhibit) => void;
  onDismiss?: () => void;
  popup?: ReactNode;
  interactive?: boolean;
}) {
  const clipId = useId().replaceAll(":", "");
  const viewport = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0), y = useMotionValue(0), scale = useMotionValue(1);
  const [size, setSize] = useState<FairMapSize | null>(null);
  const [ready, setReady] = useState(false);
  const content = useMemo(() => zoneId === "ispred" ? AMF_ENTRANCE_SIZE : size ? amfTopographicSize(size) : AMF_TOPOGRAPHIC_SIZE, [size, zoneId]);
  const stretchY = content.height / (zoneId === "ispred" ? AMF_ENTRANCE_SIZE.height : AMF_TOPOGRAPHIC_SIZE.height);
  const drawingItems = useMemo(() => items.map((item) => ({ ...item, y: item.y * stretchY, ry: item.ry * stretchY, footprint: item.footprint?.map(([x, y]) => [x, y * stretchY] as const) })), [items, stretchY]);
  const [rings, setRings] = useState<Record<string, { cx: number; cy: number; rx: number; ry: number }>>({});
  const selected = drawingItems.find((item) => item.key === selectedKey);
  const popupElement = useRef<HTMLDivElement>(null);
  const [popupSize, setPopupSize] = useState({ width: 220, height: 104 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: FairMapViewport; x: number; y: number; distance: number; moved: number } | null>(null);
  const limits = useMemo(() => size ? fairMapLimits(size, content, 4) : null, [size, content]);
  const current = useCallback(() => ({ x: x.get(), y: y.get(), scale: scale.get() }), [x, y, scale]);
  const apply = useCallback((next: FairMapViewport) => { x.set(next.x); y.set(next.y); scale.set(next.scale); }, [x, y, scale]);
  const fitSize = useCallback((targetSize: FairMapSize, targetZone: FairMapZoneId) => {
    const targetContent = targetZone === "ispred" ? AMF_ENTRANCE_SIZE : amfTopographicSize(targetSize);
    const targetLimits = fairMapLimits(targetSize, targetContent, 4);
    apply(fairMapFit(targetSize, targetContent, targetLimits));
  }, [apply]);
  const fit = useCallback(() => { if (size && limits) apply(fairMapFit(size, content, limits)); }, [apply, content, size, limits]);
  const popupPosition = () => amfTopographicPopupPosition({ x: x.get() + (selected?.x ?? 0) * scale.get(), y: y.get() + (selected?.y ?? 0) * scale.get() }, size ?? content, popupSize);
  const popupX = useTransform(() => popupPosition().x);
  const popupY = useTransform(() => popupPosition().y);

  useEffect(() => {
    if (!popupElement.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.target.getBoundingClientRect();
      setPopupSize((old) => old.width === width && old.height === height ? old : { width, height });
    });
    observer.observe(popupElement.current);
    return () => observer.disconnect();
  }, [popup]);

  useIsomorphicLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const root = element.closest<HTMLElement>("[data-amf-topographic]");
    if (root) {
      root.style.setProperty("--topo-offset", `${Math.ceil(root.getBoundingClientRect().top + window.scrollY)}px`);
    }
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastWidth = -1;
    let lastHeight = -1;
    const commitSize = (width: number, height: number) => {
      const w = Math.round(width);
      const h = Math.round(height);
      if (w <= 0 || h <= 0) return;
      if (w === lastWidth && h === lastHeight) return;
      lastWidth = w;
      lastHeight = h;
      const next = { width: w, height: h };
      fitSize(next, zoneId);
      setSize((old) => old?.width === next.width && old.height === next.height ? old : next);
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
      raf = requestAnimationFrame(() => {
        timer = setTimeout(() => setReady(true), 60);
      });
    };
    const rect = element.getBoundingClientRect();
    commitSize(rect.width, rect.height);
    const observer = new ResizeObserver(([entry]) => {
      commitSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
    };
  }, [fitSize, zoneId]);

  useEffect(() => {
    const root = viewport.current;
    if (!root || !size) return;
    const marks = [...root.querySelectorAll<HTMLElement>("[data-amf-labels] [data-mark]")];
    const measure = () => {
      const matrix = root.querySelector<SVGSVGElement>('svg[role="group"]')?.getScreenCTM()?.inverse();
      if (!matrix) return;
      const next: typeof rings = {};
      for (const mark of marks) {
        const points = [...mark.children].flatMap(child => {
          const box = visibleRect(child);
          return [[box.left, box.top], [box.right, box.bottom]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
        });
        if (!points.length) continue;
        const xs = points.map(p => p.x), ys = points.map(p => p.y);
        const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
        next[mark.dataset.mark!] = { cx: (left + right) / 2, cy: (top + bottom) / 2, rx: (right - left) * 0.75 + 8, ry: (bottom - top) * 0.75 + 8 };
      }
      setRings(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    for (const mark of marks) for (const child of mark.children) observer.observe(child);
    // An image's visible box is known only once it has loaded (natural size).
    const images = marks.flatMap(mark => [...mark.querySelectorAll("img")]);
    for (const image of images) image.addEventListener("load", measure);
    return () => {
      observer.disconnect();
      for (const image of images) image.removeEventListener("load", measure);
    };
  }, [drawingItems, size]);

  useIsomorphicLayoutEffect(() => { fit(); }, [fit, zoneId]);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !interactive || !size || !limits) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      apply(fairMapZoomAt(current(), Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }, size, content, limits));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [apply, content, current, interactive, limits, size]);

  const point = (event: PointerEvent) => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || (event.target as Element).closest("button, a, [data-amf-popup]")) return;
    pointers.current.set(event.pointerId, point(event));
    event.currentTarget.setPointerCapture(event.pointerId);
    const all = [...pointers.current.values()];
    const mid = all.length > 1 ? { x: (all[0].x + all[1].x) / 2, y: (all[0].y + all[1].y) / 2 } : all[0];
    gesture.current = { start: current(), ...mid, distance: all.length > 1 ? Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y) : 0, moved: all.length > 1 ? 9 : 0 };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !size || !limits || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, point(event));
    const all = [...pointers.current.values()];
    const mid = all.length > 1 ? { x: (all[0].x + all[1].x) / 2, y: (all[0].y + all[1].y) / 2 } : all[0];
    const dx = mid.x - g.x, dy = mid.y - g.y;
    g.moved = Math.max(g.moved, Math.hypot(dx, dy));
    const next = all.length > 1 && g.distance > 0
      ? fairMapZoomAt(g.start, Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y) / g.distance, g, size, content, limits)
      : g.start;
    if (g.moved > 8 || all.length > 1) apply(fairMapClamp({ ...next, x: next.x + dx, y: next.y + dy }, size, content, limits));
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) {
      const rest = [...pointers.current.values()][0];
      gesture.current = { start: current(), ...rest, distance: 0, moved: 9 };
      return;
    }
    gesture.current = null;
    if (!g || g.moved > 8 || event.type !== "pointerup") return;
    const view = current();
    const hit = hitAmfTopographicExhibit(drawingItems, (g.x - view.x) / view.scale, (g.y - view.y) / view.scale, view.scale);
    if (hit) onSelect(items.find((item) => item.key === hit.key)!);
    else onDismiss?.();
  };

  const drawing = (
    <svg viewBox={`0 0 ${content.width} ${content.height}`} width="100%" height="100%" role="group" aria-label={zoneId === "hala" ? dict.zones.hala : dict.entranceShort}>
      <defs><clipPath id={clipId}>{zoneId === "hala" ? <path d={AMF_TOPOGRAPHIC_HALL} transform={`scale(1 ${stretchY})`} /> : <rect width={content.width} height={content.height} />}</clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        {drawingItems.map((item) => <g key={item.key} data-heat-eligible={item.paid} data-exhibit={item.key} data-area={item.area} aria-hidden="true">
          {item.footprint ? <polygon className={styles.foyerStand} data-scanme={item.key === "scanme" || undefined} points={item.footprint.map((point) => point.join(",")).join(" ")} /> : item.area === "foyer" ? <rect className={styles.foyerStand} x={item.x - item.rx} y={item.y - item.ry} width={item.rx * 2} height={item.ry * 2} rx="8" /> : null}
          {item.area !== "foyer" ? <g>{Array.from({ length: 6 }, (_, band) => <path key={band} d={fairMapContourPath(item, band)} fill={item.paid ? "var(--topo-orange)" : "var(--topo-grey)"} fillOpacity={fairMapContourOpacity(item.paid, levels.get(item.key) ?? 0, band)} stroke={item.paid ? "var(--topo-orange)" : "var(--topo-grey)"} strokeOpacity={item.paid ? 0.13 : 0.15} strokeWidth="1.2" />)}</g> : null}
        </g>)}
      </g>
      <path className={styles.wall} data-amf-wall="" d={zoneId === "hala" ? AMF_TOPOGRAPHIC_HALL : ENTRANCE_FOYER} transform={`scale(1 ${stretchY})`} />
      {zoneId === "hala" ? <><Stairs x={345} y={30 * stretchY} width={50} height={110 * stretchY} /><Stairs x={326} y={1195 * stretchY} width={48} height={140 * stretchY} /></> : <g aria-hidden="true" data-amf-entrance-landmarks="">
        <g data-amf-inner-stairs=""><Stairs x={ENTRANCE_STAIRS[0]} y={ENTRANCE_STAIRS[1] * stretchY} width={AMF_ENTRANCE_PLAN.stairs.width * 0.85} height={AMF_ENTRANCE_PLAN.stairs.height * 0.85 * stretchY} /></g>
        <line className={styles.stairDivider} x1={ENTRANCE_STAIRS[0] + AMF_ENTRANCE_PLAN.stairs.width * 0.85 / 2} x2={ENTRANCE_STAIRS[0] + AMF_ENTRANCE_PLAN.stairs.width * 0.85 / 2} y1={ENTRANCE_STAIRS[1] * stretchY} y2={(ENTRANCE_STAIRS[1] + AMF_ENTRANCE_PLAN.stairs.height * 0.85) * stretchY} />
        <g data-amf-main-entrance=""><Stairs x={OUTSIDE_STEPS[0]} y={OUTSIDE_STEPS[1] * stretchY} width={AMF_ENTRANCE_PLAN.outsideSteps.width * 0.85} height={AMF_ENTRANCE_PLAN.outsideSteps.height * 0.85 * stretchY} /></g>
      </g>}
      {drawingItems.map((item) => <g key={item.key} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={`${item.name}${completed.has(item.key) ? `. ${dict.passportComplete}` : ""}`} aria-pressed={interactive ? selectedKey === item.key : undefined} aria-expanded={interactive ? selectedKey === item.key : undefined} aria-controls={selectedKey === item.key && popup ? "amf-map-popup" : undefined} className={styles.summit} data-selected={selectedKey === item.key} data-brand={item.key} onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(items.find((original) => original.key === item.key)!); }
      }}>
        <title>{item.name}</title>
        <ellipse className={styles.focusRing} {...(rings[item.key] ?? { cx: item.x, cy: item.y, rx: brandFrame(item, stretchY).width * 0.75 + 8, ry: brandFrame(item, stretchY).height * 0.75 + 8 })} />
      </g>)}
      {zoneId === "hala" ? <g aria-hidden="true" data-amf-hall-entrance=""><path className={styles.entranceArrow} d={`M350 ${1424 * stretchY} V${1370 * stretchY} M337 ${1384 * stretchY} L350 ${1370 * stretchY} L363 ${1384 * stretchY}`} /><text className={styles.entranceText} x="382" y={1410 * stretchY}>{dict.entranceShort}</text></g> : null}
    </svg>
  );

  // Logos, names, completed checks and the entrance label are HTML positioned
  // over the drawing (same box, percentages of the drawing), not <foreignObject>:
  // iOS Safari does not paint foreignObject content inside a transformed SVG.
  const labels = (
    <div className={styles.labels} data-amf-labels="" aria-hidden="true">
      {zoneId === "ispred" ? <div className={styles.entranceLabel} style={percentBox({ x: ENTRANCE_LABEL[0] - 90, y: (ENTRANCE_LABEL[1] - 8) * stretchY, width: 180, height: 64 }, content)}><svg viewBox="0 0 28 64" aria-hidden="true"><path d="M14 60V5M3 17L14 5L25 17" /></svg><span>{dict.entranceShort}</span></div> : null}
      {drawingItems.map((item) => <Fragment key={item.key}>
        <div className={styles.brandFrame} data-label={item.key} style={percentBox(brandFrame(item, stretchY), content)}>
          <div className={styles.brand} data-small={item.small} data-moto={item.moto} data-mark={item.key} data-area={item.area} style={{ "--summit-scale": Math.min(stretchY, 1) } as CSSProperties}><Brand item={item} /></div>
        </div>
        {completed.has(item.key) ? <div className={styles.completedFrame} style={percentBox({ x: item.x + Math.min(item.rx * 0.58, 63), y: item.y - 60, width: 38, height: 38 }, content)}><span className={styles.completed}><Check aria-hidden="true" /></span></div> : null}
      </Fragment>)}
    </div>
  );

  return <div ref={viewport} className={styles.canvas} data-amf-canvas="" data-ready={ready || undefined} data-zone={zoneId} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <motion.div className={styles.mapLayer} data-amf-layer="" style={{ x, y, scale, width: content.width, height: content.height, opacity: ready ? 1 : 0, visibility: ready ? "visible" : "hidden", pointerEvents: ready ? "auto" : "none" }}>{drawing}{labels}</motion.div>
    {!ready ? <div className={styles.canvasLoader} role="status" aria-live="polite"><span className={styles.canvasSpinner} aria-hidden="true" /><span>{dict.loadingLabel}</span></div> : null}
    {ready && selected && popup && interactive ? <motion.div ref={popupElement} className={styles.popup} data-amf-popup="" style={{ x: popupX, y: popupY }}>{popup}</motion.div> : null}
    {interactive ? <button type="button" className={styles.fit} onClick={fit} aria-label={dict.fitMap} title={dict.fitMap} style={{ opacity: ready ? 1 : 0, visibility: ready ? "visible" : "hidden", pointerEvents: ready ? "auto" : "none" }}><Maximize2 aria-hidden="true" /></button> : null}
  </div>;
}
