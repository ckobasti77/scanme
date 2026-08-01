"use client";

import {
  useId,
  type ReactNode,
} from "react";
import { gsap } from "gsap";

const QR_SIZE = 29;
const QR_VIEWBOX_SIZE = QR_SIZE + 4;
export const QR_GLOW_BAND_HEIGHT = 2.4;

function isFinderCell(row: number, column: number, top: number, left: number) {
  const localRow = row - top;
  const localColumn = column - left;

  if (localRow < 0 || localRow > 6 || localColumn < 0 || localColumn > 6) {
    return false;
  }

  const outerEdge =
    localRow === 0 || localRow === 6 || localColumn === 0 || localColumn === 6;
  const center =
    localRow >= 2 && localRow <= 4 && localColumn >= 2 && localColumn <= 4;

  return outerEdge || center;
}

function isAlignmentCell(row: number, column: number, top: number, left: number) {
  const localRow = row - top;
  const localColumn = column - left;

  if (localRow < 0 || localRow > 4 || localColumn < 0 || localColumn > 4) {
    return false;
  }

  const outerEdge =
    localRow === 0 || localRow === 4 || localColumn === 0 || localColumn === 4;
  const center = localRow === 2 && localColumn === 2;
  return outerEdge || center;
}

function isFinderReserve(row: number, column: number) {
  return (
    (row <= 7 && column <= 7) ||
    (row <= 7 && column >= QR_SIZE - 8) ||
    (row >= QR_SIZE - 8 && column <= 7)
  );
}

function isQrCellActive(row: number, column: number) {
  if (
    isFinderCell(row, column, 0, 0) ||
    isFinderCell(row, column, 0, QR_SIZE - 7) ||
    isFinderCell(row, column, QR_SIZE - 7, 0)
  ) {
    return true;
  }

  if (isFinderReserve(row, column)) return false;
  if (isAlignmentCell(row, column, QR_SIZE - 9, QR_SIZE - 9)) return true;
  if (row >= 10 && row <= 18 && column >= 10 && column <= 18) return false;
  if (row === 6 || column === 6) return (row + column) % 2 === 0;

  const pattern = (row * 17 + column * 31 + row * column * 7) % 29;
  return pattern < 13 || (row * 3 + column * 5) % 17 === 0;
}

const QR_CELLS = Array.from({ length: QR_SIZE }, (_, row) =>
  Array.from({ length: QR_SIZE }, (_, column) => ({
    row,
    column,
    active: isQrCellActive(row, column),
  })),
).flat();

export type HeroQrScanElements = {
  scene: HTMLDivElement;
  tile: HTMLDivElement;
  glowBand: SVGRectElement;
  glowGroup: SVGGElement;
  scanArea: HTMLDivElement;
  scanLine: HTMLSpanElement;
};

export function resolveHeroQrScanElements(
  root: ParentNode,
): HeroQrScanElements | null {
  const scene = root.querySelector<HTMLDivElement>("[data-hero-qr-scene]");
  const tile = root.querySelector<HTMLDivElement>("[data-qr-tile]");
  const glowBand = root.querySelector<SVGRectElement>("[data-qr-glow-band]");
  const glowGroup = root.querySelector<SVGGElement>("[data-qr-glow-wake]");
  const scanArea = root.querySelector<HTMLDivElement>("[data-scan-area]");
  const scanLine = root.querySelector<HTMLSpanElement>("[data-scan-line]");

  if (!scene || !tile || !glowBand || !glowGroup || !scanArea || !scanLine) {
    return null;
  }

  return { scene, tile, glowBand, glowGroup, scanArea, scanLine };
}

export function resetHeroQrScan(elements: HeroQrScanElements) {
  gsap.set(elements.scene, { autoAlpha: 1, y: 0 });
  gsap.set(elements.scanLine, { autoAlpha: 0, y: 0 });
  gsap.set(elements.glowBand, {
    attr: { y: -QR_GLOW_BAND_HEIGHT },
  });
  gsap.set(elements.glowGroup, { autoAlpha: 0 });
}

const scanEase = (progress: number) =>
  progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

export function appendHeroQrScanSequence({
  timeline,
  elements,
  startAt = 0,
  onProgress,
}: {
  timeline: gsap.core.Timeline;
  elements: HeroQrScanElements;
  startAt?: number;
  onProgress?: (progress: number, lineCenterY: number) => void;
}) {
  const syncReveal = () => {
    const lineBox = elements.scanLine.getBoundingClientRect();
    const tileBox = elements.tile.getBoundingClientRect();
    const lineCenterY = lineBox.top + lineBox.height / 2;
    const progress = gsap.utils.clamp(
      0,
      1,
      (lineCenterY - tileBox.top) / Math.max(1, tileBox.height),
    );

    gsap.set(elements.glowBand, {
      attr: { y: progress * QR_VIEWBOX_SIZE - QR_GLOW_BAND_HEIGHT },
    });
    onProgress?.(progress, lineCenterY);
  };

  timeline
    .set(elements.scanLine, { y: 0, autoAlpha: 0 }, startAt)
    .set(
      elements.glowBand,
      { attr: { y: -QR_GLOW_BAND_HEIGHT } },
      startAt,
    )
    .set(elements.glowGroup, { autoAlpha: 0 }, startAt)
    .to(
      elements.scanLine,
      { autoAlpha: 0.96, duration: 0.24, ease: "power1.out" },
      startAt + 0.22,
    )
    .to(
      elements.glowGroup,
      { autoAlpha: 0.78, duration: 0.22, ease: "power1.out" },
      startAt + 0.28,
    )
    .to(
      elements.scanLine,
      {
        y: () => Math.max(0, elements.scanArea.clientHeight - 2),
        duration: 2.15,
        ease: scanEase,
        onUpdate: syncReveal,
      },
      startAt + 0.34,
    )
    .to(
      elements.scanLine,
      { autoAlpha: 0, duration: 0.24, ease: "power1.out" },
      startAt + 2.38,
    )
    .to(
      elements.glowGroup,
      { autoAlpha: 0, duration: 0.3, ease: "power1.out" },
      startAt + 2.49,
    )
    .to(
      elements.scene,
      { autoAlpha: 0, y: -6, duration: 0.34, ease: "power2.in" },
      startAt + 2.54,
    );
}

export function HeroQrScanScene({
  center,
}: {
  center?: ReactNode;
}) {
  const effectId = useId().replaceAll(":", "");
  const glowMaskId = `hero-qr-glow-mask-${effectId}`;
  const glowGradientId = `hero-qr-glow-gradient-${effectId}`;
  const glowWashGradientId = `hero-qr-glow-wash-gradient-${effectId}`;
  const glowFilterId = `hero-qr-glow-filter-${effectId}`;

  return (
    <div data-hero-qr-scene className="absolute inset-0 grid place-items-center">
      <div
        data-qr-tile
        className="relative size-[64%] bg-[#f3f4ef] shadow-[inset_0_0_0_1px_rgba(35,39,35,0.12)]"
      >
        <svg
          className="size-full"
          viewBox={`0 0 ${QR_VIEWBOX_SIZE} ${QR_VIEWBOX_SIZE}`}
          shapeRendering="crispEdges"
          role="presentation"
        >
          <defs>
            <linearGradient id={glowGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="white" stopOpacity="0" />
              <stop offset="0.18" stopColor="white" stopOpacity="0.18" />
              <stop offset="0.46" stopColor="white" />
              <stop offset="0.72" stopColor="white" stopOpacity="0.42" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={glowWashGradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0" />
              <stop offset="0.14" stopColor="var(--primary)" stopOpacity="0.12" />
              <stop offset="0.5" stopColor="var(--primary)" stopOpacity="0.38" />
              <stop offset="0.86" stopColor="var(--primary)" stopOpacity="0.12" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
            <mask id={glowMaskId} maskUnits="userSpaceOnUse">
              <rect
                data-qr-glow-band
                x="0"
                y={-QR_GLOW_BAND_HEIGHT}
                width={QR_VIEWBOX_SIZE}
                height={QR_GLOW_BAND_HEIGHT}
                fill={`url(#${glowGradientId})`}
              />
            </mask>
            <filter
              id={glowFilterId}
              x="-35%"
              y="-35%"
              width="170%"
              height="170%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="0.72"
                result="qr-glow-blur"
              />
              <feComposite
                in="qr-glow-blur"
                in2="SourceGraphic"
                operator="out"
                result="qr-glow-halo"
              />
              <feComponentTransfer in="SourceGraphic" result="qr-glow-sheen">
                <feFuncA type="linear" slope="0.34" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="qr-glow-halo" />
                <feMergeNode in="qr-glow-sheen" />
              </feMerge>
            </filter>
          </defs>
          <g className="text-[#292c29]">
            {QR_CELLS.map(({ row, column, active }) =>
              active ? (
                <rect
                  key={`base-${row}-${column}`}
                  x={column + 2}
                  y={row + 2}
                  width="1"
                  height="1"
                  fill="currentColor"
                />
              ) : null,
            )}
          </g>
          <g
            data-qr-glow-wake
            mask={`url(#${glowMaskId})`}
            style={{ color: "var(--primary)", opacity: 0 }}
          >
            <rect
              data-qr-glow-wash
              width={QR_VIEWBOX_SIZE}
              height={QR_VIEWBOX_SIZE}
              fill={`url(#${glowWashGradientId})`}
            />
            <g filter={`url(#${glowFilterId})`}>
              {QR_CELLS.map(({ row, column, active }) =>
                active ? (
                  <rect
                    key={`glow-${row}-${column}`}
                    x={column + 2}
                    y={row + 2}
                    width="1"
                    height="1"
                    fill="currentColor"
                  />
                ) : null,
              )}
            </g>
          </g>
        </svg>
        {center ? (
          <span className="absolute left-1/2 top-1/2 grid size-[27%] -translate-x-1/2 -translate-y-1/2 place-items-center bg-[#f3f4ef] p-[6%] text-[#5d625c]">
            {center}
          </span>
        ) : null}
      </div>

      <div
        data-scan-area
        className="pointer-events-none absolute left-1/2 top-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
      >
        <span
          data-scan-line
          className="absolute left-0 top-0 h-[2px] w-full bg-primary"
          style={{
            boxShadow:
              "0 0 12px 2px color-mix(in srgb, var(--primary) 38%, transparent)",
            opacity: 0,
          }}
        />
      </div>
    </div>
  );
}
