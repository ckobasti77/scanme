import { useMemo } from "react";
import { qrMatrix } from "@/lib/qr/qrcodegen";
import styles from "./wall.module.css";

// TASK-22 STEP 3 — the persistent recruit. The wall advertises itself: a small
// QR encoding the space's join URL, so anyone watching can join without asking.
// Rendered as an SVG of the module matrix (dark on a white card so it scans off
// a bright projection), computed once — the URL never changes while it is up.

const QUIET = 4; // spec-mandated quiet zone, in modules

export function WallQr({ url, title }: { url: string; title: string }) {
  const { path, dim } = useMemo(() => {
    const matrix = qrMatrix(url, "MEDIUM");
    const n = matrix.length;
    const dim = n + QUIET * 2;
    // One SVG path of all dark modules — far fewer nodes than a rect per cell.
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
      className={styles.qrCode}
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <rect width={dim} height={dim} fill="#f7efe6" />
      <path d={path} fill="#0d0a08" />
    </svg>
  );
}
