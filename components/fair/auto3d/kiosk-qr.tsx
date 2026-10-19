"use client";

// QR „Nastavi na telefonu“ u kiosku (A10, odluka E12): kodira `${location.origin}/sajam/3d`, pa domen
// nije izmišljen ni upisan u kod. Pravi se posle mount-a; server i hidratacija crtaju prazno mesto
// iste veličine. Matrica je iz lib/qr/qrcodegen.ts (ECC MEDIUM, tiha zona od 4 modula), kao
// components/memories/wall/wall-qr.tsx: tamni moduli na svetloj podlozi, da se čita i sa ekrana.

import { useMemo, useSyncExternalStore } from "react";
import { qrMatrix } from "@/lib/qr/qrcodegen";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import styles from "./auto3d.module.css";

const QUIET = 4;
export const KIOSK_QR_PATH = "/sajam/3d";

export function kioskQrUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${KIOSK_QR_PATH}`;
}

/** Jedna SVG putanja svih tamnih modula, sa tihom zonom. */
export function qrPath(text: string): { path: string; dim: number } {
  const matrix = qrMatrix(text, "MEDIUM");
  const n = matrix.length;
  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) path += `M${x + QUIET},${y + QUIET}h1v1h-1z`;
    }
  }
  return { path, dim: n + QUIET * 2 };
}

export function QrSvg({ url, label }: { url: string; label: string }) {
  const { path, dim } = useMemo(() => qrPath(url), [url]);
  return (
    <svg className={styles.qrCode} viewBox={`0 0 ${dim} ${dim}`} role="img" aria-label={label} shapeRendering="crispEdges" data-qr-url={url}>
      <rect width={dim} height={dim} fill="#f7efe6" />
      <path d={path} fill="#0d0a08" />
    </svg>
  );
}

const noop = () => () => {};

export function KioskQr() {
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => null,
  );
  return origin ? <QrSvg url={kioskQrUrl(origin)} label={t.kioskQrLabel} /> : <span className={styles.qrCode} data-qr-placeholder="" aria-hidden="true" />;
}
