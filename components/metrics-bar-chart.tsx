"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

type MetricRow = {
  dateKey: string;
  label: string;
  count: number;
};

type ScrollState = {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
};

const numberFormatter = new Intl.NumberFormat("sr-Latn-RS");

export function MetricsBarChart({
  rows,
  rangeLabel,
  heightClassName,
  showCounts = false,
  barMinWidth = 36,
  variant = "bars",
}: {
  rows: MetricRow[];
  rangeLabel: string;
  heightClassName: string;
  showCounts?: boolean;
  barMinWidth?: number;
  variant?: "bars" | "line";
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportId = useId();
  const dragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [scrollState, setScrollState] = useState<ScrollState>({ clientWidth: 0, scrollWidth: 0, scrollLeft: 0 });
  const maximum = useMemo(() => Math.max(1, ...rows.map((row) => row.count)), [rows]);
  const dataKey = `${rangeLabel}:${rows.map((row) => row.dateKey).join("|")}`;
  const chartLabel = rows.map((row) => `${row.label}, ${row.count}`).join("; ");
  const lineChartWidth = Math.max(76, rows.length * 76);
  const linePoints = rows.map((row, index) => ({
    ...row,
    x: rows.length === 1 ? 500 : 40 + index * (920 / Math.max(1, rows.length - 1)),
    y: rows.length === 1 ? 45 : 14 + (1 - row.count / maximum) * 60,
  }));

  function syncScrollState() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setScrollState({
      clientWidth: viewport.clientWidth,
      scrollWidth: viewport.scrollWidth,
      scrollLeft: viewport.scrollLeft,
    });
  }

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    syncScrollState();
  }, [dataKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const resizeObserver = new ResizeObserver(syncScrollState);
    resizeObserver.observe(viewport);
    const content = viewport.firstElementChild;
    if (content) resizeObserver.observe(content);

    function handleScroll() {
      syncScrollState();
    }

    function handleWheel(event: WheelEvent) {
      const currentViewport = viewportRef.current;
      if (!currentViewport) return;
      const maxScroll = Math.max(0, currentViewport.scrollWidth - currentViewport.clientWidth);
      if (maxScroll <= 1) return;

      const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (rawDelta === 0) return;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 24 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? currentViewport.clientWidth : 1;
      const delta = rawDelta * scale;
      const canMoveLeft = delta < 0 && currentViewport.scrollLeft > 1;
      const canMoveRight = delta > 0 && currentViewport.scrollLeft < maxScroll - 1;

      if (!canMoveLeft && !canMoveRight) return;
      event.preventDefault();
      currentViewport.scrollLeft = Math.min(maxScroll, Math.max(0, currentViewport.scrollLeft + delta));
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    syncScrollState();

    return () => {
      resizeObserver.disconnect();
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const maxScroll = Math.max(0, scrollState.scrollWidth - scrollState.clientWidth);
  const hasOverflow = maxScroll > 1;
  const viewportRatio = scrollState.scrollWidth > 0 ? Math.min(1, scrollState.clientWidth / scrollState.scrollWidth) : 1;
  const scrollProgress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollState.scrollLeft / maxScroll)) : 0;

  function moveTo(scrollLeft: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.min(maxScroll, Math.max(0, scrollLeft));
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: scrollState.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !track) return;
    const movableTrackWidth = track.clientWidth * (1 - viewportRatio);
    if (movableTrackWidth <= 0) return;
    moveTo(drag.startScrollLeft + (event.clientX - drag.startX) * (maxScroll / movableTrackWidth));
  }

  function handlePointerEnd(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleScrollbarKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = Math.max(80, scrollState.clientWidth * 0.2);
    if (event.key === "ArrowLeft") moveTo(scrollState.scrollLeft - step);
    else if (event.key === "ArrowRight") moveTo(scrollState.scrollLeft + step);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(maxScroll);
    else return;
    event.preventDefault();
  }

  return (
    <div className="mt-6">
      <div className="relative">
        {variant === "line" && rows.length ? (
          <div className="pointer-events-none absolute inset-0 z-10 text-[10px] uppercase tracking-[0.12em] text-muted-foreground" aria-hidden="true">
            <span className="absolute left-2 top-1 bg-card/90 px-1.5 py-1">Y / Skeniranja</span>
            <span className="absolute bottom-7 right-2 bg-card/90 px-1.5 py-1">Vreme / X</span>
          </div>
        ) : null}
        <div
          id={viewportId}
          ref={viewportRef}
          className={cn("metrics-scroll-viewport overflow-x-auto overscroll-x-contain", heightClassName)}
          aria-label={`Grafikon skeniranja za period ${rangeLabel}`}
        >
          <div
            className={cn(
              "h-full min-w-full w-max",
              variant === "line" ? "relative text-primary" : "grid items-end gap-2 sm:gap-4",
            )}
            style={variant === "line"
              ? { width: `${lineChartWidth}px` }
              : { gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(${barMinWidth}px, 1fr))` }}
            role={rows.length ? "img" : "status"}
            aria-label={rows.length
              ? `Skeniranja za period ${rangeLabel}: ${chartLabel}`
              : `Još nema skeniranja za period ${rangeLabel}.`}
          >
          {variant === "line" ? (
            rows.length ? (
              <>
                <div className="absolute inset-x-0 bottom-8 top-2 border-b border-border">
                  {[14, 44, 74].map((position) => (
                    <span key={position} className="absolute inset-x-0 h-px bg-border/55" style={{ top: `${position}%` }} aria-hidden="true" />
                  ))}
                  {linePoints.length > 1 ? (
                    <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
                      <polyline
                        points={linePoints.map((point) => `${point.x},${point.y}`).join(" ")}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="miter"
                        strokeLinecap="square"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  ) : null}
                  {linePoints.map((point) => (
                    <span
                      key={point.dateKey}
                      className="absolute size-3 -translate-x-1/2 -translate-y-1/2 bg-primary ring-4 ring-card"
                      style={{ left: `${point.x / 10}%`, top: `${point.y}%` }}
                      title={`${point.label}: ${numberFormatter.format(point.count)}`}
                      aria-hidden="true"
                    >
                      <strong className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-foreground sm:text-xs">
                        {numberFormatter.format(point.count)}
                      </strong>
                    </span>
                  ))}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-6" aria-hidden="true">
                  {linePoints.map((point) => (
                    <span
                      key={point.dateKey}
                      className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs"
                      style={{ left: `${point.x / 10}%` }}
                    >
                      {point.label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid h-full min-w-full place-items-center border-b border-border text-sm text-muted-foreground">
                Još nema skeniranja za prikaz.
              </div>
            )
          ) : rows.map((row) => (
              <div key={row.dateKey} className={cn("grid h-full gap-2", showCounts ? "grid-rows-[1fr_auto_auto]" : "grid-rows-[1fr_auto]")}>
                <div className="flex items-end border-b border-border">
                  <div
                    className="w-full bg-primary transition-[height] duration-300 ease-out motion-reduce:transition-none"
                    style={{ height: `${Math.max(3, row.count / maximum * 100)}%` }}
                    title={`${row.label}: ${numberFormatter.format(row.count)}`}
                  />
                </div>
                {showCounts ? <strong className="text-center text-xs tabular-nums">{numberFormatter.format(row.count)}</strong> : null}
                <span className="whitespace-nowrap text-center text-[10px] text-muted-foreground sm:text-xs">{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hasOverflow ? (
        <div ref={trackRef} className="relative mt-4 h-5">
          <div className="absolute inset-x-0 top-2 h-px bg-border" />
          <button
            type="button"
            role="scrollbar"
            aria-label="Pomeranje grafikona"
            aria-controls={viewportId}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(scrollProgress * 100)}
            className="metrics-scroll-thumb pointer-events-none absolute top-1 h-2 touch-none bg-primary outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:pointer-events-auto"
            style={{
              left: `${scrollProgress * (1 - viewportRatio) * 100}%`,
              width: `${viewportRatio * 100}%`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onKeyDown={handleScrollbarKeyDown}
          />
        </div>
      ) : null}
    </div>
  );
}
