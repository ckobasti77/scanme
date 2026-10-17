"use client";

import { motion, useMotionValue } from "framer-motion";
import { ArrowUp, Check, Maximize2 } from "lucide-react";
import { siVespa } from "simple-icons";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { fairMapClamp, fairMapFit, fairMapLimits, fairMapZoomAt, type FairMapSize, type FairMapViewport, type FairMapZoneId } from "@/lib/fair-map";
import { AMF_TOPOGRAPHIC_SIZE, fairMapContourOpacity, fairMapContourPath, hitAmfTopographicExhibit, type AmfTopographicExhibit } from "@/lib/fair-map/topography";
import { FairBrandMark } from "../garage/fair-brand-mark";
import { amfMapSr as dict } from "./amf-map-copy";
import styles from "./amf-topographic-map.module.css";

const HALL = "M245 42 H745 Q790 42 850 75 L930 108 Q975 126 975 195 V1180 Q975 1230 925 1255 L840 1300 H245 L100 1260 Q25 1235 25 1180 V190 Q25 135 80 110 L190 65 Q220 48 245 42 Z";

function Brand({ item }: { item: AmfTopographicExhibit }) {
  if (item.small) return <span className={styles.smallName}>{item.name}</span>;
  const wordmark = ["motogrini", "tvs", "aprilia", "piaggio", "honda-moto"].includes(item.key);
  return (
    <>
      {item.key === "vespa" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={siVespa.path} fill="currentColor" /></svg>
      ) : wordmark ? (
        <span className={styles.wordmark}>{item.name}</span>
      ) : (
        <FairBrandMark brandName={item.name} fallback={<span className={styles.wordmark}>{item.name}</span>} />
      )}
      {!wordmark && <span className={styles.brandName}>{item.name}</span>}
    </>
  );
}

function Stairs({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return <g className={styles.stairs} aria-hidden="true">
    <rect x={x} y={y} width={width} height={height} rx="2" />
    {Array.from({ length: 11 }, (_, i) => <line key={i} x1={x} x2={x + width} y1={y + (i + 1) * height / 12} y2={y + (i + 1) * height / 12} />)}
  </g>;
}

export function AmfTopographicCanvas({ items, zoneId, selectedKey, levels, completed, onSelect, interactive = true }: {
  items: AmfTopographicExhibit[];
  zoneId: FairMapZoneId;
  selectedKey: string | null;
  levels: ReadonlyMap<string, number>;
  completed: ReadonlySet<string>;
  onSelect: (item: AmfTopographicExhibit) => void;
  interactive?: boolean;
}) {
  const clipId = useId().replaceAll(":", "");
  const viewport = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0), y = useMotionValue(0), scale = useMotionValue(1);
  const [size, setSize] = useState<FairMapSize | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: FairMapViewport; x: number; y: number; distance: number; moved: number } | null>(null);
  const limits = useMemo(() => size ? fairMapLimits(size, AMF_TOPOGRAPHIC_SIZE, 4) : null, [size]);
  const current = useCallback(() => ({ x: x.get(), y: y.get(), scale: scale.get() }), [x, y, scale]);
  const apply = useCallback((next: FairMapViewport) => { x.set(next.x); y.set(next.y); scale.set(next.scale); }, [x, y, scale]);
  const fit = useCallback(() => { if (size && limits) apply(fairMapFit(size, AMF_TOPOGRAPHIC_SIZE, limits)); }, [apply, size, limits]);

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
      apply(fairMapZoomAt(current(), Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }, size, AMF_TOPOGRAPHIC_SIZE, limits));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [apply, current, interactive, limits, size]);

  const point = (event: PointerEvent) => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || (event.target as Element).closest("button")) return;
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
      ? fairMapZoomAt(g.start, Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y) / g.distance, g, size, AMF_TOPOGRAPHIC_SIZE, limits)
      : g.start;
    if (g.moved > 8 || all.length > 1) apply(fairMapClamp({ ...next, x: next.x + dx, y: next.y + dy }, size, AMF_TOPOGRAPHIC_SIZE, limits));
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
    const hit = hitAmfTopographicExhibit(items, (g.x - view.x) / view.scale, (g.y - view.y) / view.scale, view.scale);
    if (hit) onSelect(hit);
  };

  const drawing = (
    <svg viewBox={`0 0 ${AMF_TOPOGRAPHIC_SIZE.width} ${AMF_TOPOGRAPHIC_SIZE.height}`} width="100%" height="100%" role="group" aria-label={zoneId === "hala" ? dict.zones.hala : dict.entranceShort}>
      <defs><clipPath id={clipId}>{zoneId === "hala" ? <path d={HALL} /> : <rect x="20" y="20" width="960" height="1290" rx="60" />}</clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        {items.map((item) => <g key={item.key} data-heat-eligible={item.paid} data-exhibit={item.key} aria-hidden="true">
          {Array.from({ length: 6 }, (_, band) => <path key={band} d={fairMapContourPath(item, band)} fill={item.paid ? "var(--topo-orange)" : "var(--topo-grey)"} fillOpacity={fairMapContourOpacity(item.paid, levels.get(item.key) ?? 0, band)} stroke={item.paid ? "var(--topo-orange)" : "var(--topo-grey)"} strokeOpacity={item.paid ? 0.13 : 0.15} strokeWidth="1.2" />)}
        </g>)}
      </g>
      <path className={styles.wall} d={zoneId === "hala" ? HALL : "M70 20 H930 Q980 20 980 70 V1240 Q980 1310 910 1310 H90 Q20 1310 20 1240 V70 Q20 20 70 20 Z"} />
      {zoneId === "hala" ? <><Stairs x={345} y={30} width={50} height={110} /><Stairs x={326} y={1195} width={48} height={105} /></> : null}
      {items.map((item) => <g key={item.key} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={`${item.name}${!item.paid ? `. ${dict.noMeasurement}` : ""}${completed.has(item.key) ? `. ${dict.passportComplete}` : ""}`} aria-pressed={interactive ? selectedKey === item.key : undefined} aria-describedby="amf-heat-explanation" className={styles.summit} data-selected={selectedKey === item.key} data-brand={item.key} onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(item); }
      }}>
        <title>{item.name}</title>
        <ellipse className={styles.focusRing} cx={item.x} cy={item.y} rx={item.rx * 0.72} ry={item.ry * 0.72} />
        <foreignObject x={item.x - (item.small ? 90 : item.rx * 0.92)} y={item.y - (item.small ? 26 : 57)} width={item.small ? 180 : item.rx * 1.84} height={item.small ? 52 : 118} pointerEvents="none">
          <div className={styles.brand} data-small={item.small} data-moto={item.moto}><Brand item={item} /></div>
        </foreignObject>
        {completed.has(item.key) ? <foreignObject x={item.x + Math.min(item.rx * 0.58, 63)} y={item.y - 60} width="38" height="38" pointerEvents="none"><span className={styles.completed}><Check aria-hidden="true" /></span></foreignObject> : null}
      </g>)}
      {zoneId === "hala" ? <g aria-hidden="true"><foreignObject x="325" y="1308" width="50" height="50"><ArrowUp className={styles.entranceArrow} /></foreignObject><text className={styles.entranceText} x="350" y="1370" textAnchor="middle">{dict.entranceShort}</text></g> : null}
    </svg>
  );

  return <div ref={viewport} className={styles.canvas} data-amf-canvas="" data-zone={zoneId} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    {size ? <motion.div className={styles.mapLayer} data-amf-layer="" style={{ x, y, scale, width: AMF_TOPOGRAPHIC_SIZE.width, height: AMF_TOPOGRAPHIC_SIZE.height }}>{drawing}</motion.div> : drawing}
    {interactive ? <button type="button" className={styles.fit} onClick={fit} aria-label={dict.fitMap} title={dict.fitMap}><Maximize2 aria-hidden="true" /></button> : null}
  </div>;
}
