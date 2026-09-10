import { useMemo } from "react";
import { qrMatrix } from "@/lib/qr/qrcodegen";

// TASK-72 — a card's printable QR. Same matrix→single-path SVG technique as the
// Memories wall (components/memories/wall/wall-qr.tsx) but with neutral, always
// high-contrast colors (dark modules on white) so the code scans regardless of
// the admin's theme and prints correctly.

const QUIET = 4; // spec-mandated quiet zone, in modules

export function CardQr({
  url,
  title,
  className,
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const { path, dim } = useMemo(() => {
    const matrix = qrMatrix(url, "MEDIUM");
    const n = matrix.length;
    const dim = n + QUIET * 2;
    let path = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (matrix[y][x]) path += `M${x + QUIET},${y + QUIET}h1v1h-1z`;
      }
    }
    return { path, dim };
  }, [url]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
