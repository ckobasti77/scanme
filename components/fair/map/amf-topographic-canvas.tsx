"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowUp, Check, Maximize2 } from "lucide-react";
import { siVespa } from "simple-icons";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { fairMapClamp, fairMapFit, fairMapLimits, fairMapZoomAt, type FairMapSize, type FairMapViewport, type FairMapZoneId } from "@/lib/fair-map";
import { AMF_TOPOGRAPHIC_HALL, AMF_TOPOGRAPHIC_SIZE, amfTopographicPopupPosition, amfTopographicSize, fairMapContourOpacity, fairMapContourPath, hitAmfTopographicExhibit, type AmfTopographicExhibit } from "@/lib/fair-map/topography";
import { FairBrandMark } from "../garage/fair-brand-mark";
import { amfMapSr as dict } from "./amf-map-copy";
import styles from "./amf-topographic-map.module.css";

function Brand({ item }: { item: AmfTopographicExhibit }) {
  if (item.small) return <span className={styles.smallName}>{item.name}</span>;
  const wordmark = ["motogrini", "tvs", "aprilia", "piaggio", "honda-moto"].includes(item.key);
  return (
    <>
      {item.key === "vespa" ? (
        <svg className={styles.vespaLogo} viewBox="-0.1 7.7 24.2 8.6" aria-hidden="true"><path d={siVespa.path} fill="currentColor" /></svg>
      ) : wordmark ? (
        <span className={styles.wordmark}>{item.name}</span>
      ) : (
        <FairBrandMark brandName={item.name} fallback={<span className={styles.wordmark}>{item.name}</span>} />
      )}
      {!wordmark && !["geely", "vespa"].includes(item.key) && <span className={styles.brandName}>{item.name}</span>}
    </>
  );
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
  const content = useMemo(() => size ? amfTopographicSize(size) : AMF_TOPOGRAPHIC_SIZE, [size]);
  const stretchY = content.height / AMF_TOPOGRAPHIC_SIZE.height;
  const drawingItems = useMemo(() => items.map((item) => ({ ...item, y: item.y * stretchY, ry: item.ry * stretchY })), [items, stretchY]);
  const selected = drawingItems.find((item) => item.key === selectedKey);
  const popupElement = useRef<HTMLDivElement>(null);
  const [popupSize, setPopupSize] = useState({ width: 232, height: 144 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: FairMapViewport; x: number; y: number; distance: number; moved: number } | null>(null);
  const limits = useMemo(() => size ? fairMapLimits(size, content, 4) : null, [size, content]);
  const current = useCallback(() => ({ x: x.get(), y: y.get(), scale: scale.get() }), [x, y, scale]);
  const apply = useCallback((next: FairMapViewport) => { x.set(next.x); y.set(next.y); scale.set(next.scale); }, [x, y, scale]);
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

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (next.width > 0 && next.height > 0) setSize((old) => old?.width === next.width && old.height === next.height ? old : next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { fit(); }, [fit, zoneId]);
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
      <defs><clipPath id={clipId}>{zoneId === "hala" ? <path d={AMF_TOPOGRAPHIC_HALL} transform={`scale(1 ${stretchY})`} /> : <rect x="20" y={20 * stretchY} width="960" height={1290 * stretchY} rx="60" />}</clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        {drawingItems.map((item) => <g key={item.key} data-heat-eligible={item.paid} data-exhibit={item.key} aria-hidden="true">
          {Array.from({ length: 6 }, (_, band) => <path key={band} d={fairMapContourPath(item, band)} fill={item.paid ? "var(--topo-orange)" : "var(--topo-grey)"} fillOpacity={fairMapContourOpacity(item.paid, levels.get(item.key) ?? 0, band)} stroke={item.paid ? "var(--topo-orange)" : "var(--topo-grey)"} strokeOpacity={item.paid ? 0.13 : 0.15} strokeWidth="1.2" />)}
        </g>)}
      </g>
      <path className={styles.wall} data-amf-wall="" d={zoneId === "hala" ? AMF_TOPOGRAPHIC_HALL : "M70 20 H930 Q980 20 980 70 V1240 Q980 1310 910 1310 H90 Q20 1310 20 1240 V70 Q20 20 70 20 Z"} transform={`scale(1 ${stretchY})`} />
      {zoneId === "hala" ? <><Stairs x={345} y={30 * stretchY} width={50} height={110 * stretchY} /><Stairs x={326} y={1195 * stretchY} width={48} height={140 * stretchY} /></> : null}
      {drawingItems.map((item) => <g key={item.key} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={`${item.name}${completed.has(item.key) ? `. ${dict.passportComplete}` : ""}`} aria-pressed={interactive ? selectedKey === item.key : undefined} aria-expanded={interactive ? selectedKey === item.key : undefined} aria-controls={selectedKey === item.key && popup ? "amf-map-popup" : undefined} className={styles.summit} data-selected={selectedKey === item.key} data-brand={item.key} onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(items.find((original) => original.key === item.key)!); }
      }}>
        <title>{item.name}</title>
        <ellipse className={styles.focusRing} cx={item.x} cy={item.y} rx={item.rx * 0.72} ry={item.ry * 0.72} />
        <foreignObject x={item.x - (item.small ? 90 : item.rx * 0.92)} y={item.y - (item.small ? 26 : 57 * Math.min(stretchY, 1))} width={item.small ? 180 : item.rx * 1.84} height={item.small ? 52 : 118 * Math.min(stretchY, 1)} pointerEvents="none">
          <div className={styles.brand} data-small={item.small} data-moto={item.moto} style={{ "--summit-scale": Math.min(stretchY, 1) } as CSSProperties}><Brand item={item} /></div>
        </foreignObject>
        {completed.has(item.key) ? <foreignObject x={item.x + Math.min(item.rx * 0.58, 63)} y={item.y - 60} width="38" height="38" pointerEvents="none"><span className={styles.completed}><Check aria-hidden="true" /></span></foreignObject> : null}
      </g>)}
      {zoneId === "hala" ? <g aria-hidden="true"><foreignObject x="326" y={1344 * stretchY} width="38" height="30"><ArrowUp className={styles.entranceArrow} /></foreignObject><text className={styles.entranceText} x="375" y={1370 * stretchY}>{dict.entranceShort}</text></g> : null}
    </svg>
  );

  return <div ref={viewport} className={styles.canvas} data-amf-canvas="" data-zone={zoneId} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    {size ? <motion.div className={styles.mapLayer} data-amf-layer="" style={{ x, y, scale, width: content.width, height: content.height }}>{drawing}</motion.div> : drawing}
    {selected && popup && interactive ? <motion.div ref={popupElement} className={styles.popup} data-amf-popup="" style={{ x: popupX, y: popupY }}>{popup}</motion.div> : null}
    {interactive ? <button type="button" className={styles.fit} onClick={fit} aria-label={dict.fitMap} title={dict.fitMap}><Maximize2 aria-hidden="true" /></button> : null}
  </div>;
}
