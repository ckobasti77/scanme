"use client";

import { useMemo, useSyncExternalStore } from "react";
import { FAIR_QR_DEFAULT_ORIGIN, fairQrPublicUrl } from "@/lib/admin-v1/qr-url";
import { qrMatrix } from "@/lib/qr/qrcodegen";
import { cn } from "@/lib/utils";

// Izlagači 2026 — a real, scannable QR of a fair code in the admin (the QR
// list cards and the code detail). One SVG path of the dark modules on a
// white square with the spec quiet zone, so it scans from a phone screen in
// light and dark admin themes. No new package: lib/qr/qrcodegen.

const QUIET = 4;

const subscribe = () => () => undefined;
/** The admin's own origin after hydration; the production address while rendering on the server. */
export function useAdminOrigin(): string {
  return useSyncExternalStore(subscribe, () => window.location.origin, () => FAIR_QR_DEFAULT_ORIGIN);
}

/** `<origin>/r/<resolverCode>` of the deployment the admin runs on. */
export function useFairQrUrl(resolverCode: string): string {
  return fairQrPublicUrl(useAdminOrigin(), resolverCode);
}

export function QrCodeImage({ url, label, className }: { url: string; label: string; className?: string }) {
  const { path, dim } = useMemo(() => {
    const matrix = qrMatrix(url, "MEDIUM");
    const n = matrix.length;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (matrix[y][x]) d += `M${x + QUIET},${y + QUIET}h1v1h-1z`;
      }
    }
    return { path: d, dim: n + QUIET * 2 };
  }, [url]);
  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={cn("block aspect-square rounded-[6px] border border-[var(--admin-border)]", className)}
      data-qr-url={url}
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill="#0b0b0c" />
    </svg>
  );
}

/** The QR of one fair code: the hook builds the address, the image draws it. */
export function FairQrCodeImage({ resolverCode, label, className }: { resolverCode: string; label: string; className?: string }) {
  const url = useFairQrUrl(resolverCode);
  return <QrCodeImage url={url} label={label} className={className} />;
}
