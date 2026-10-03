import type { FairMapPoint, FairMapZone } from "@/lib/fair-map";

// M0 geometry check: the organizer image with every location polygon and its
// mapLocationId on top, in the image's own pixel space (viewBox = image size).
// Data/adapter layer only — not the public map's final style (MASTER §14).

function pointsAttr(polygon: readonly FairMapPoint[]) {
  return polygon.map(([x, y]) => `${x},${y}`).join(" ");
}

/** Area centroid, falling back to the vertex mean for a degenerate polygon. */
function labelPoint(polygon: readonly FairMapPoint[]): FairMapPoint {
  let area = 0;
  let cx = 0;
  let cy = 0;
  polygon.forEach(([x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  });
  if (area === 0) {
    return [polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length, polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

export function FairMapOverlay({ zone, label }: { zone: FairMapZone; label: string }) {
  const { src, width, height } = zone.image;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block h-auto w-full">
      <image href={src} width={width} height={height} />
      {zone.landmarks.map((landmark) => (
        <polygon
          key={landmark.id}
          points={pointsAttr(landmark.polygon)}
          fill="rgba(37, 99, 235, 0.16)"
          stroke="#1d4ed8"
          strokeWidth={2}
          strokeDasharray="8 6"
        />
      ))}
      {zone.locations.map((location) => {
        const [x, y] = labelPoint(location.polygon);
        const scanme = location.kind === "scanme";
        return (
          <g key={location.id}>
            <polygon
              points={pointsAttr(location.polygon)}
              fill={scanme ? "rgba(198, 255, 74, 0.6)" : "rgba(219, 39, 119, 0.22)"}
              stroke={scanme ? "#3f6212" : "#be185d"}
              strokeWidth={3}
              strokeDasharray={location.placement === "placeholder" ? "10 6" : undefined}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={24}
              fontWeight={700}
              fill="#111827"
              stroke="#ffffff"
              strokeWidth={5}
              paintOrder="stroke"
            >
              {location.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
