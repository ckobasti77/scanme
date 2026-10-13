"use client";

import { BACKLOG_RADIUS, CORE_RADIUS, FLAT_VIEW, ORBIT_RADIUS, STAR_RADIUS, flatPoint } from "@/lib/admin-v2/constellation/geometry";
import type { ConstellationLayout, OrbitIndex, Star, StarTone } from "@/lib/admin-v2/constellation/types";

// ADMIN v3 V2 — the 2D fallback of the Constellation: the plane of the orbits
// seen from the tilt of the 3D camera, as one still SVG. It is used when WebGL
// does not work, on a phone and while the 3D scene loads. The whole picture is
// decoration for a screen reader (the text equivalent and the list are the
// content), so nothing in it is a tab stop. No animation: the fallback is calm.

const ORBITS: OrbitIndex[] = [1, 2, 3, 4];

const TONE_COLOR: Record<StarTone, string> = {
  danger: "var(--admin-danger)",
  warning: "var(--admin-warning)",
  neutral: "var(--admin-text-muted)",
  success: "var(--admin-success)",
};

/** Half of the minor axis of an orbit: the same point the flat picture uses for the bottom of the ellipse. */
function minorRadius(radius: number): number {
  return flatPoint(Math.PI / 2, radius)[1];
}

function orbitDash(orbit: OrbitIndex): string | undefined {
  return orbit === 4 ? "0.012 0.018" : undefined;
}

function StarMark({
  star,
  aimed,
  onHover,
  onPick,
  moreMark,
}: {
  star: Star;
  aimed: boolean;
  onHover?: (id: string | null) => void;
  onPick?: (id: string) => void;
  moreMark: (count: number) => string;
}) {
  const [x, y] = flatPoint(star.angle, ORBIT_RADIUS[star.orbit]);
  const color = TONE_COLOR[star.tone];
  const radius = STAR_RADIUS[star.size];
  const ringRadius = STAR_RADIUS.medium * 1.6;
  // The mark of a "more" star stands beside its ring; at the right edge it goes to the left so it is not cut off.
  const markX = Number(((x > 0.6 ? -1 : 1) * (ringRadius + 0.07)).toFixed(4));
  return (
    <g
      data-star={star.id}
      data-orbit={star.orbit}
      data-tone={star.tone}
      data-kind={star.kind}
      {...(aimed ? { "data-aimed": "" } : {})}
      transform={`translate(${x.toFixed(5)} ${y.toFixed(5)})`}
      style={{ cursor: "pointer" }}
      onPointerEnter={() => onHover?.(star.id)}
      onPointerLeave={() => onHover?.(null)}
      onClick={() => onPick?.(star.id)}
    >
      <circle r="0.085" fill="transparent" />
      <circle r={radius * 1.8} fill={color} fillOpacity="0.16" />
      {star.kind === "more" ? (
        <>
          <circle r={ringRadius} fill="none" stroke={color} strokeWidth="0.008" />
          <text
            x={markX}
            fontSize="0.05"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--admin-text)"
          >
            {moreMark(star.more)}
          </text>
        </>
      ) : (
        <circle r={radius} fill={color} />
      )}
      {aimed ? <circle r={radius * 2.6} fill="none" stroke="var(--admin-text)" strokeWidth="0.006" /> : null}
    </g>
  );
}

export function Constellation2D({
  layout,
  aimed = null,
  onHover,
  onPick,
  moreMark,
  className,
}: {
  layout: ConstellationLayout;
  /** The star that is highlighted (aimed at from its row, or hovered). */
  aimed?: string | null;
  onHover?: (id: string | null) => void;
  onPick?: (id: string) => void;
  /** The text of a "more" star, e.g. "+3". */
  moreMark: (count: number) => string;
  className?: string;
}) {
  const { halfWidth, halfHeight } = FLAT_VIEW;
  const backlog = layout.backlog;
  return (
    <svg
      viewBox={`${-halfWidth} ${-halfHeight} ${2 * halfWidth} ${2 * halfHeight}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      data-constellation-2d=""
      className={`block h-full w-full${className ? ` ${className}` : ""}`}
    >
      {ORBITS.map((orbit) => (
        <ellipse
          key={orbit}
          data-orbit-ring={orbit}
          rx={ORBIT_RADIUS[orbit]}
          ry={minorRadius(ORBIT_RADIUS[orbit])}
          fill="none"
          stroke="var(--admin-text-muted)"
          strokeOpacity="0.32"
          strokeWidth="0.004"
          strokeDasharray={orbitDash(orbit)}
        />
      ))}
      {layout.calm.map((dot, index) => {
        const [x, y] = flatPoint(dot.angle, dot.radius);
        return <circle key={index} data-calm-dot="" cx={x.toFixed(5)} cy={y.toFixed(5)} r="0.008" fill="var(--admin-success)" fillOpacity="0.55" />;
      })}
      {backlog ? (
        <g data-backlog-ring="">
          <ellipse rx={BACKLOG_RADIUS} ry={minorRadius(BACKLOG_RADIUS)} fill="none" stroke="var(--admin-danger)" strokeOpacity="0.18" strokeWidth="0.012" />
          {backlog.share > 0 ? (
            <ellipse
              data-backlog-arc=""
              rx={BACKLOG_RADIUS}
              ry={minorRadius(BACKLOG_RADIUS)}
              fill="none"
              stroke="var(--admin-danger)"
              strokeWidth="0.012"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${backlog.share} 1`}
            />
          ) : null}
        </g>
      ) : null}
      <circle r={CORE_RADIUS * 1.5} fill="var(--admin-nav-line)" fillOpacity="0.16" />
      <circle r={CORE_RADIUS * 0.8} fill="var(--admin-nav-line)" />
      {layout.stars.map((star) => (
        <StarMark key={star.id} star={star} aimed={aimed === star.id} onHover={onHover} onPick={onPick} moreMark={moreMark} />
      ))}
    </svg>
  );
}
