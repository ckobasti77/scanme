import { fairMapLabelPoint as labelPoint, fairMapPointsAttr as pointsAttr, type FairMapLocationKind, type FairMapZone } from "@/lib/fair-map";

// M0 geometry check: the organizer image with every location polygon and its
// mapLocationId on top, in the image's own pixel space (viewBox = image size).
// Data/adapter layer only — not the public map's final style (MASTER §14).
// N3: one colour per location kind (stand, ScanMe, partner point, open area).

const OVERLAY_PAINT: Record<FairMapLocationKind, { fill: string; stroke: string }> = {
  stand: { fill: "rgba(219, 39, 119, 0.22)", stroke: "#be185d" },
  scanme: { fill: "rgba(198, 255, 74, 0.6)", stroke: "#3f6212" },
  partner: { fill: "rgba(245, 158, 11, 0.28)", stroke: "#b45309" },
  area: { fill: "rgba(13, 148, 136, 0.12)", stroke: "#0f766e" },
};

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
        const paint = OVERLAY_PAINT[location.kind];
        return (
          <g key={location.id}>
            <polygon
              points={pointsAttr(location.polygon)}
              fill={paint.fill}
              stroke={paint.stroke}
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
