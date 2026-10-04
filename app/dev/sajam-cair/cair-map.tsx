"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import {
  Bike,
  CarFront,
  Coffee,
  LocateFixed,
  MapPin,
  Maximize2,
  Minus,
  Plus,
  Route,
  Sparkles,
} from "lucide-react";
import {
  SiAudi,
  SiCitroen,
  SiDacia,
  SiFiat,
  SiFord,
  SiHonda,
  SiMg,
  SiOpel,
  SiPeugeot,
  SiRenault,
  SiSkoda,
  SiSuzuki,
  SiToyota,
  SiVespa,
  SiVolkswagen,
} from "react-icons/si";
import type { IconType } from "react-icons";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { eventMapSr as dict } from "@/lib/i18n/sr/event-map";
import styles from "./cair-map.module.css";

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 900;
const MIN_PADDING = 26;
const MAX_SCALE = 4;

type Entrance = "north" | "south";
type Category = "cars" | "moto" | "food" | "scanme";
type Filter = "all" | Category;

type Point = { x: number; y: number };

type Brand = {
  key: string;
  name: string;
  color: string;
  icon?: keyof typeof BRAND_ICONS;
};

type Booth = {
  id: string;
  number: string;
  categories: readonly Category[];
  path: string;
  numberAt: Point;
  content: { x: number; y: number; width: number; height: number };
  focus: Point;
  routeAnchor: Point;
  brands: readonly Brand[];
};

const BRAND_ICONS = {
  audi: SiAudi,
  citroen: SiCitroen,
  dacia: SiDacia,
  fiat: SiFiat,
  ford: SiFord,
  honda: SiHonda,
  mg: SiMg,
  opel: SiOpel,
  peugeot: SiPeugeot,
  renault: SiRenault,
  skoda: SiSkoda,
  suzuki: SiSuzuki,
  toyota: SiToyota,
  vespa: SiVespa,
  volkswagen: SiVolkswagen,
} satisfies Record<string, IconType>;

const brands = {
  scanme: { key: "scanme", name: "ScanMe", color: "#171918" },
  skoda: { key: "skoda", name: "Škoda", color: "#0e3a2f", icon: "skoda" },
  mercedes: { key: "mercedes", name: "Mercedes-Benz", color: "#262827" },
  fiat: { key: "fiat", name: "Fiat", color: "#941711", icon: "fiat" },
  dongfeng: { key: "dongfeng", name: "Dongfeng", color: "#d51d2b" },
  volkswagen: {
    key: "volkswagen",
    name: "Volkswagen",
    color: "#151f5d",
    icon: "volkswagen",
  },
  audi: { key: "audi", name: "Audi", color: "#bb0a30", icon: "audi" },
  geely: { key: "geely", name: "Geely", color: "#172d5b" },
  motogrini: { key: "motogrini", name: "Motogrini", color: "#2e302e" },
  tvs: { key: "tvs", name: "TVS", color: "#17458f" },
  toyota: { key: "toyota", name: "Toyota", color: "#eb0a1e", icon: "toyota" },
  citroen: {
    key: "citroen",
    name: "Citroën",
    color: "#da291c",
    icon: "citroen",
  },
  mg: { key: "mg", name: "MG", color: "#e31b23", icon: "mg" },
  ford: { key: "ford", name: "Ford", color: "#00274e", icon: "ford" },
  dacia: { key: "dacia", name: "Dacia", color: "#646b52", icon: "dacia" },
  renault: {
    key: "renault",
    name: "Renault",
    color: "#262827",
    icon: "renault",
  },
  opel: { key: "opel", name: "Opel", color: "#262827", icon: "opel" },
  peugeot: {
    key: "peugeot",
    name: "Peugeot",
    color: "#1d211f",
    icon: "peugeot",
  },
  suzuki: {
    key: "suzuki",
    name: "Suzuki",
    color: "#e30613",
    icon: "suzuki",
  },
  honda: { key: "honda", name: "Honda", color: "#cc0000", icon: "honda" },
  vespa: { key: "vespa", name: "Vespa", color: "#315d91", icon: "vespa" },
  aprilia: { key: "aprilia", name: "Aprilia", color: "#df1927" },
  piaggio: { key: "piaggio", name: "Piaggio", color: "#236aa3" },
} satisfies Record<string, Brand>;

const BOOTHS: readonly Booth[] = [
  {
    id: "10",
    number: "10",
    categories: ["cars"],
    path: "M28 150H112L181 75L216 110L296 39H360V198H389V418H28Z",
    numberAt: { x: 48, y: 176 },
    content: { x: 62, y: 205, width: 276, height: 172 },
    focus: { x: 190, y: 280 },
    routeAnchor: { x: 390, y: 320 },
    brands: [brands.skoda],
  },
  {
    id: "9",
    number: "9",
    categories: ["cars"],
    path: "M28 428H389V606H28Z",
    numberAt: { x: 48, y: 454 },
    content: { x: 62, y: 462, width: 270, height: 112 },
    focus: { x: 205, y: 515 },
    routeAnchor: { x: 390, y: 520 },
    brands: [brands.mercedes],
  },
  {
    id: "8",
    number: "8",
    categories: ["cars"],
    path: "M28 616H389V779H420V876H350L286 817L235 860L178 803H28Z",
    numberAt: { x: 226, y: 822 },
    content: { x: 58, y: 648, width: 292, height: 118 },
    focus: { x: 205, y: 710 },
    routeAnchor: { x: 405, y: 720 },
    brands: [brands.fiat, brands.dongfeng],
  },
  {
    id: "11",
    number: "11",
    categories: ["scanme"],
    path: "M300 34H426V119H300Z",
    numberAt: { x: 314, y: 56 },
    content: { x: 310, y: 62, width: 106, height: 46 },
    focus: { x: 363, y: 76 },
    routeAnchor: { x: 426, y: 92 },
    brands: [brands.scanme],
  },
  {
    id: "2",
    number: "2",
    categories: ["cars", "moto"],
    path: "M445 30H792V407H445V196H414V119H445Z",
    numberAt: { x: 464, y: 56 },
    content: { x: 478, y: 76, width: 282, height: 284 },
    focus: { x: 620, y: 220 },
    routeAnchor: { x: 438, y: 300 },
    brands: [brands.geely, brands.motogrini, brands.tvs, brands.toyota, brands.citroen],
  },
  {
    id: "3",
    number: "3",
    categories: ["cars"],
    path: "M802 30H926L989 111L1045 60L1117 145H1148V396H851V205H802Z",
    numberAt: { x: 823, y: 56 },
    content: { x: 872, y: 120, width: 236, height: 214 },
    focus: { x: 990, y: 220 },
    routeAnchor: { x: 844, y: 310 },
    brands: [brands.mg, brands.ford],
  },
  {
    id: "5",
    number: "5",
    categories: ["cars"],
    path: "M851 407H1172V625H851Z",
    numberAt: { x: 872, y: 434 },
    content: { x: 890, y: 455, width: 246, height: 134 },
    focus: { x: 1010, y: 515 },
    routeAnchor: { x: 844, y: 520 },
    brands: [brands.dacia, brands.renault],
  },
  {
    id: "6-7",
    number: "6-7",
    categories: ["cars"],
    path: "M851 635H1126V792H1082L1028 847L973 804L902 875H851Z",
    numberAt: { x: 872, y: 662 },
    content: { x: 888, y: 682, width: 220, height: 142 },
    focus: { x: 990, y: 745 },
    routeAnchor: { x: 844, y: 720 },
    brands: [brands.opel, brands.peugeot, brands.suzuki, brands.honda],
  },
  {
    id: "1",
    number: "1",
    categories: ["cars"],
    path: "M445 454H792V666H445Z",
    numberAt: { x: 465, y: 481 },
    content: { x: 486, y: 500, width: 266, height: 132 },
    focus: { x: 620, y: 560 },
    routeAnchor: { x: 438, y: 560 },
    brands: [brands.volkswagen, brands.audi],
  },
  {
    id: "moto",
    number: "Moto",
    categories: ["moto"],
    path: "M430 706H850V875H390V806H430Z",
    numberAt: { x: 454, y: 732 },
    content: { x: 475, y: 740, width: 332, height: 106 },
    focus: { x: 640, y: 790 },
    routeAnchor: { x: 425, y: 780 },
    brands: [brands.vespa, brands.aprilia, brands.piaggio, brands.honda],
  },
];

const ENTRANCES: Record<Entrance, Point> = {
  north: { x: 414, y: 142 },
  south: { x: 408, y: 820 },
};

const FILTERS: ReadonlyArray<{
  key: Filter;
  label: string;
  icon: typeof CarFront;
}> = [
  { key: "all", label: dict.filterAll, icon: Sparkles },
  { key: "cars", label: dict.filterCars, icon: CarFront },
  { key: "moto", label: dict.filterMoto, icon: Bike },
  { key: "food", label: dict.filterFood, icon: Coffee },
  { key: "scanme", label: dict.filterScanMe, icon: LocateFixed },
];

type Transform = { x: number; y: number; scale: number };

function BrandMark({ brand, compact = false }: { brand: Brand; compact?: boolean }) {
  const Icon = brand.icon ? BRAND_ICONS[brand.icon] : null;
  const style = { "--brand-color": brand.color } as CSSProperties;

  return (
    <span
      className={`${styles.brandMark} ${compact ? styles.brandMarkCompact : ""} ${brand.key === "scanme" ? styles.scanMeMark : ""}`}
      style={style}
    >
      {brand.key === "scanme" ? (
        <span className={styles.scanMeWordmark}>ScanMe</span>
      ) : (
        <>
          {Icon ? <Icon aria-hidden="true" /> : <span className={styles.wordmarkFallback}>{brand.name}</span>}
          {Icon ? <span>{brand.name}</span> : null}
        </>
      )}
    </span>
  );
}

function pointsToString(points: readonly Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function routeFor(booth: Booth, entrance: Entrance): Point[] {
  const start = ENTRANCES[entrance];
  const corridorX = 420;
  const anchor = booth.routeAnchor;

  if (entrance === "north" && booth.id === "11") {
    return [start, { x: 432, y: 142 }, anchor];
  }

  return [
    start,
    { x: corridorX, y: start.y },
    { x: corridorX, y: anchor.y },
    anchor,
  ];
}

export function CairMap({ initialEntrance }: { initialEntrance: Entrance }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const activePointers = useRef(new Map<number, Point>());
  const gestureStart = useRef<{
    transform: Transform;
    midpoint: Point;
    distance: number;
    tapBooth: string | null;
    moved: boolean;
  } | null>(null);
  const minScale = useRef(0.4);
  const animationControls = useRef<Array<{ stop: () => void }>>([]);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState("11");
  const [entrance, setEntrance] = useState<Entrance>(initialEntrance);
  const [routeVisible, setRouteVisible] = useState(false);

  const selectedBooth = BOOTHS.find((booth) => booth.id === selectedId) ?? BOOTHS[3];
  const allBrands = useMemo(
    () =>
      BOOTHS.flatMap((booth) =>
        booth.brands.map((brand) => ({ brand, booth })),
      ).filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.brand.key === item.brand.key) === index,
      ),
    [],
  );

  const stopAnimations = useCallback(() => {
    animationControls.current.forEach((control) => control.stop());
    animationControls.current = [];
  }, []);

  const clampTransform = useCallback((next: Transform): Transform => {
    const viewport = viewportRef.current;
    if (!viewport) return next;
    const bounds = viewport.getBoundingClientRect();
    const nextScale = Math.min(MAX_SCALE, Math.max(minScale.current, next.scale));
    const scaledWidth = MAP_WIDTH * nextScale;
    const scaledHeight = MAP_HEIGHT * nextScale;

    const nextX =
      scaledWidth <= bounds.width
        ? (bounds.width - scaledWidth) / 2
        : Math.min(MIN_PADDING, Math.max(bounds.width - scaledWidth - MIN_PADDING, next.x));
    const nextY =
      scaledHeight <= bounds.height
        ? (bounds.height - scaledHeight) / 2
        : Math.min(MIN_PADDING, Math.max(bounds.height - scaledHeight - MIN_PADDING, next.y));

    return { x: nextX, y: nextY, scale: nextScale };
  }, []);

  const setTransform = useCallback(
    (next: Transform, animated = false) => {
      const clamped = clampTransform(next);
      stopAnimations();
      if (animated && !reduceMotion) {
        const transition = { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const };
        animationControls.current = [
          animate(x, clamped.x, transition),
          animate(y, clamped.y, transition),
          animate(scale, clamped.scale, transition),
        ];
      } else {
        x.set(clamped.x);
        y.set(clamped.y);
        scale.set(clamped.scale);
      }
    },
    [clampTransform, reduceMotion, scale, stopAnimations, x, y],
  );

  const fitMap = useCallback(
    (animated = false) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const bounds = viewport.getBoundingClientRect();
      const fitted = Math.min(
        (bounds.width - MIN_PADDING * 2) / MAP_WIDTH,
        (bounds.height - MIN_PADDING * 2) / MAP_HEIGHT,
      );
      minScale.current = fitted;
      setTransform(
        {
          scale: fitted,
          x: (bounds.width - MAP_WIDTH * fitted) / 2,
          y: (bounds.height - MAP_HEIGHT * fitted) / 2,
        },
        animated,
      );
    },
    [setTransform],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => fitMap(false));
    observer.observe(viewport);
    fitMap(false);
    return () => observer.disconnect();
  }, [fitMap]);

  const focusBooth = useCallback(
    (booth: Booth) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const bounds = viewport.getBoundingClientRect();
      const nextScale = Math.min(MAX_SCALE, Math.max(minScale.current * 2.05, 0.9));
      setTransform(
        {
          scale: nextScale,
          x: bounds.width / 2 - booth.focus.x * nextScale,
          y: bounds.height / 2 - booth.focus.y * nextScale,
        },
        true,
      );
    },
    [setTransform],
  );

  const selectBooth = useCallback(
    (booth: Booth, shouldFocus = false) => {
      setSelectedId(booth.id);
      setRouteVisible(false);
      if (shouldFocus) focusBooth(booth);
    },
    [focusBooth],
  );

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const bounds = viewport.getBoundingClientRect();
      const currentScale = scale.get();
      const nextScale = Math.min(MAX_SCALE, Math.max(minScale.current, currentScale * factor));
      const center = { x: bounds.width / 2, y: bounds.height / 2 };
      setTransform(
        {
          scale: nextScale,
          x: center.x - ((center.x - x.get()) / currentScale) * nextScale,
          y: center.y - ((center.y - y.get()) / currentScale) * nextScale,
        },
        true,
      );
    },
    [scale, setTransform, x, y],
  );

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const cursor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const currentScale = scale.get();
    const nextScale = Math.min(
      MAX_SCALE,
      Math.max(minScale.current, currentScale * (event.deltaY > 0 ? 0.9 : 1.1)),
    );
    setTransform({
      scale: nextScale,
      x: cursor.x - ((cursor.x - x.get()) / currentScale) * nextScale,
      y: cursor.y - ((cursor.y - y.get()) / currentScale) * nextScale,
    });
  };

  const pointerPoint = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    stopAnimations();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPoint(event);
    activePointers.current.set(event.pointerId, point);
    const points = [...activePointers.current.values()];
    const boothElement = (event.target as Element).closest?.("[data-booth-id]");

    if (points.length === 1) {
      gestureStart.current = {
        transform: { x: x.get(), y: y.get(), scale: scale.get() },
        midpoint: point,
        distance: 0,
        tapBooth: boothElement?.getAttribute("data-booth-id") ?? null,
        moved: false,
      };
    } else if (points.length === 2) {
      const midpoint = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
      gestureStart.current = {
        transform: { x: x.get(), y: y.get(), scale: scale.get() },
        midpoint,
        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
        tapBooth: null,
        moved: true,
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activePointers.current.has(event.pointerId) || !gestureStart.current) return;
    activePointers.current.set(event.pointerId, pointerPoint(event));
    const points = [...activePointers.current.values()];
    const start = gestureStart.current;

    if (points.length === 1) {
      const dx = points[0].x - start.midpoint.x;
      const dy = points[0].y - start.midpoint.y;
      if (Math.hypot(dx, dy) > 6) start.moved = true;
      const clamped = clampTransform({
        scale: start.transform.scale,
        x: start.transform.x + dx,
        y: start.transform.y + dy,
      });
      x.set(clamped.x);
      y.set(clamped.y);
      return;
    }

    if (points.length === 2 && start.distance > 0) {
      const midpoint = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(minScale.current, start.transform.scale * (distance / start.distance)),
      );
      const mapPoint = {
        x: (start.midpoint.x - start.transform.x) / start.transform.scale,
        y: (start.midpoint.y - start.transform.y) / start.transform.scale,
      };
      const clamped = clampTransform({
        scale: nextScale,
        x: midpoint.x - mapPoint.x * nextScale,
        y: midpoint.y - mapPoint.y * nextScale,
      });
      x.set(clamped.x);
      y.set(clamped.y);
      scale.set(clamped.scale);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = gestureStart.current;
    const tappedBooth = start && !start.moved ? start.tapBooth : null;
    activePointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const remaining = [...activePointers.current.values()];
    if (remaining.length === 1) {
      gestureStart.current = {
        transform: { x: x.get(), y: y.get(), scale: scale.get() },
        midpoint: remaining[0],
        distance: 0,
        tapBooth: null,
        moved: true,
      };
    } else if (remaining.length === 0) {
      gestureStart.current = null;
      if (tappedBooth) {
        const booth = BOOTHS.find((candidate) => candidate.id === tappedBooth);
        if (booth) selectBooth(booth);
      }
    }
  };

  const onBoothKeyDown = (event: ReactKeyboardEvent<SVGGElement>, booth: Booth) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectBooth(booth, true);
    }
  };

  const chooseEntrance = (nextEntrance: Entrance) => {
    setEntrance(nextEntrance);
    setRouteVisible(false);
    const url = new URL(window.location.href);
    url.searchParams.set("ulaz", nextEntrance === "north" ? "sever" : "jug");
    window.history.replaceState({}, "", url);
  };

  const findScanMe = () => {
    const scanMeBooth = BOOTHS.find((booth) => booth.id === "11")!;
    setFilter("all");
    setSelectedId("11");
    setRouteVisible(true);
    focusBooth(scanMeBooth);
  };

  const filteredBrands = allBrands.filter(
    ({ booth }) => filter === "all" || booth.categories.includes(filter),
  );

  return (
    <main className={styles.page} data-reveal="off">
      <div className={styles.backdrop} aria-hidden="true">
        <span className={styles.shapeSage} />
        <span className={styles.shapeCoral} />
        <span className={styles.shapeMauve} />
      </div>

      <header className={styles.header}>
        <div className={styles.brandLockup} aria-label="ScanMe">
          <span className={styles.brandSymbol}>S</span>
          <span>ScanMe</span>
        </div>
        <div className={styles.heading}>
          <h1>{dict.title}</h1>
          <p>{dict.subtitle}</p>
        </div>
        <button type="button" className={styles.findButton} onClick={findScanMe}>
          <LocateFixed aria-hidden="true" />
          {dict.findScanMe}
        </button>
      </header>

      <section className={styles.controls} aria-label={dict.filterLabel}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>{dict.filterLabel}</span>
          <div className={styles.filterRow}>
            {FILTERS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={styles.filterButton}
                  data-active={filter === item.key}
                  aria-pressed={filter === item.key}
                  onClick={() => setFilter(item.key)}
                >
                  <Icon aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>{dict.entranceLabel}</span>
          <div className={styles.entranceToggle}>
            {(["north", "south"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={entrance === item}
                data-active={entrance === item}
                onClick={() => chooseEntrance(item)}
              >
                <MapPin aria-hidden="true" />
                {item === "north" ? dict.entranceNorth : dict.entranceSouth}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.mapCard} aria-label={dict.mapAria}>
          <div className={styles.mapChrome}>
            <p>{dict.mapHint}</p>
            <div className={styles.zoomControls}>
              <button type="button" onClick={() => zoomAtCenter(1.24)} aria-label={dict.zoomIn}>
                <Plus aria-hidden="true" />
              </button>
              <button type="button" onClick={() => zoomAtCenter(0.8)} aria-label={dict.zoomOut}>
                <Minus aria-hidden="true" />
              </button>
              <button type="button" onClick={() => fitMap(true)} aria-label={dict.fitMap}>
                <Maximize2 aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            ref={viewportRef}
            className={styles.viewport}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <motion.div
              className={styles.stage}
              style={{ x, y, scale, width: MAP_WIDTH, height: MAP_HEIGHT }}
            >
              <svg
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                role="img"
                aria-label={dict.mapAria}
              >
                <defs>
                  <pattern id="map-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                    <path d="M28 0H0V28" className={styles.gridLine} />
                  </pattern>
                  <marker id="route-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                    <path d="M0 0L10 5L0 10Z" className={styles.routeArrow} />
                  </marker>
                </defs>

                <rect width={MAP_WIDTH} height={MAP_HEIGHT} rx="44" className={styles.mapPaper} />
                <rect width={MAP_WIDTH} height={MAP_HEIGHT} rx="44" fill="url(#map-grid)" />
                <path
                  d="M25 150H112L181 75L216 110L296 39H445V30H926L989 111L1045 60L1117 145H1148V396H1172V625H1126V792H1082L1028 847L973 804L902 875H350L286 817L235 860L178 803H25Z"
                  className={styles.hallShell}
                />

                <g className={styles.stairs} aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((step) => (
                    <rect key={`north-${step}`} x={392} y={42 + step * 15} width={36} height={10} rx={4} />
                  ))}
                  {[0, 1, 2, 3, 4].map((step) => (
                    <rect key={`south-${step}`} x={392} y={786 + step * 15} width={36} height={10} rx={4} />
                  ))}
                </g>

                {routeVisible ? (
                  <polyline
                    points={pointsToString(routeFor(selectedBooth, entrance))}
                    className={styles.routeLine}
                    markerEnd="url(#route-arrow)"
                  />
                ) : null}

                {BOOTHS.map((booth) => {
                  const selected = selectedId === booth.id;
                  const dimmed = filter !== "all" && !booth.categories.includes(filter);
                  return (
                    <g
                      key={booth.id}
                      role="button"
                      tabIndex={0}
                      data-booth-id={booth.id}
                      aria-pressed={selected}
                      aria-label={fmt(dict.boothAria, {
                        stand: booth.number,
                        brands: booth.brands.map((brand) => brand.name).join(", "),
                      })}
                      className={`${styles.booth} ${selected ? styles.boothSelected : ""} ${dimmed ? styles.boothDimmed : ""} ${booth.id === "11" ? styles.scanMeBooth : ""}`}
                      onKeyDown={(event) => onBoothKeyDown(event, booth)}
                    >
                      <path d={booth.path} vectorEffect="non-scaling-stroke" />
                      <g className={styles.boothNumber}>
                        <circle cx={booth.numberAt.x} cy={booth.numberAt.y} r={booth.id === "moto" ? 25 : 21} />
                        <text x={booth.numberAt.x} y={booth.numberAt.y + 6} textAnchor="middle">
                          {booth.number}
                        </text>
                      </g>
                      <foreignObject
                        x={booth.content.x}
                        y={booth.content.y}
                        width={booth.content.width}
                        height={booth.content.height}
                        pointerEvents="none"
                      >
                        <div
                          className={`${styles.mapBrandGrid} ${booth.brands.length >= 4 ? styles.mapBrandGridDense : ""}`}
                        >
                          {booth.brands.map((brand) => (
                            <BrandMark key={brand.key} brand={brand} compact />
                          ))}
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}

                <g className={`${styles.foodMarker} ${filter !== "all" && filter !== "food" ? styles.markerDimmed : ""}`}>
                  <circle cx="382" cy="480" r="34" />
                  <text x="382" y="475" textAnchor="middle">Hotel</text>
                  <text x="382" y="492" textAnchor="middle">Lotos</text>
                </g>
                <g className={`${styles.foodMarker} ${filter !== "all" && filter !== "food" ? styles.markerDimmed : ""}`}>
                  <circle cx="382" cy="565" r="34" />
                  <text x="382" y="560" textAnchor="middle">Hrana</text>
                  <text x="382" y="577" textAnchor="middle">i piće</text>
                </g>

                {(["north", "south"] as const).map((item) => {
                  const point = ENTRANCES[item];
                  const active = entrance === item;
                  return (
                    <g key={item} className={`${styles.entranceMarker} ${active ? styles.entranceActive : ""}`}>
                      <circle cx={point.x} cy={point.y} r={active ? 17 : 11} />
                      <text x={point.x + 26} y={point.y + 5}>
                        {active
                          ? dict.youAreHere
                          : item === "north"
                            ? dict.entranceNorth
                            : dict.entranceSouth}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </motion.div>
          </div>
        </section>

        <aside className={styles.detailsPanel} aria-live="polite">
          <div>
            <span className={styles.panelLabel}>{dict.selectedStand}</span>
            <h2>{fmt(dict.standLabel, { stand: selectedBooth.number })}</h2>
            {selectedBooth.id === "11" ? <p>{dict.scanMeStandBody}</p> : null}
          </div>
          <div className={styles.detailBrands} aria-label={dict.brandsLabel}>
            {selectedBooth.brands.map((brand) => (
              <BrandMark key={brand.key} brand={brand} />
            ))}
          </div>
          <button
            type="button"
            className={styles.routeButton}
            aria-pressed={routeVisible}
            onClick={() => setRouteVisible((visible) => !visible)}
          >
            <Route aria-hidden="true" />
            {routeVisible ? dict.hideRoute : dict.showRoute}
          </button>
        </aside>
      </div>

      <section className={styles.brandDirectory}>
        <div className={styles.directoryHeading}>
          <h2>{dict.brandListTitle}</h2>
          <p>{dict.brandListBody}</p>
        </div>
        <div className={styles.brandList}>
          {filteredBrands.map(({ brand, booth }) => (
            <button
              key={brand.key}
              type="button"
              className={styles.brandButton}
              data-selected={selectedBooth.brands.some((candidate) => candidate.key === brand.key)}
              onClick={() => selectBooth(booth, true)}
            >
              <BrandMark brand={brand} />
              <span className={styles.standBadge}>{fmt(dict.standLabel, { stand: booth.number })}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
