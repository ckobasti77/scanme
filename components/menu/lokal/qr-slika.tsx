"use client";

// ScanMe Menu V1 (K20) — the QR code of a card (master §9.2). `QrSlika` draws it
// inline; `qrSvgDokument` writes the same code as a standalone, print-ready SVG
// file (white background, black modules, the label under the code). Black on
// white whatever the app theme: a QR must scan off paper. Quiet zone of 4
// modules, as the spec demands (the same drawing as the live wall's QR).

import { useMemo } from "react";
import { qrMatrix } from "@/lib/qr/qrcodegen";

const MIRNA_ZONA = 4;
const BELA = "#ffffff";
const CRNA = "#000000";

/** What a scan of this card opens: `${origin}/r/${cardCode}`. */
export function qrAdresa(qrOrigin: string, cardCode: string): string {
  return `${qrOrigin}/r/${cardCode}`;
}

/** One SVG path of the dark modules (horizontal runs), inside the quiet zone; `dim` is the side in modules. */
export function qrPutanja(url: string): { path: string; dim: number } {
  const matrica = qrMatrix(url, "MEDIUM");
  const n = matrica.length;
  let path = "";
  for (let y = 0; y < n; y += 1) {
    let x = 0;
    while (x < n) {
      if (!matrica[y][x]) {
        x += 1;
        continue;
      }
      const pocetak = x;
      while (x < n && matrica[y][x]) x += 1;
      path += `M${pocetak + MIRNA_ZONA},${y + MIRNA_ZONA}h${x - pocetak}v1h-${x - pocetak}z`;
    }
  }
  return { path, dim: n + MIRNA_ZONA * 2 };
}

export function QrSlika({
  url,
  naslov,
  velicina,
  className,
}: {
  url: string;
  /** The accessible name of the picture ("QR kod za karticu Sto 12"). */
  naslov: string;
  /** Side of the square: a number (px) or any CSS length ("4cm"). Omitted: the width of the parent. */
  velicina?: string | number;
  className?: string;
}) {
  const { path, dim } = useMemo(() => qrPutanja(url), [url]);
  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={naslov}
      shapeRendering="crispEdges"
      width={velicina}
      height={velicina}
      className={className}
    >
      <rect width={dim} height={dim} fill={BELA} />
      <path d={path} fill={CRNA} />
    </svg>
  );
}

function xml(tekst: string): string {
  return Array.from(tekst)
    .filter((znak) => znak.charCodeAt(0) >= 32)
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function broj(vrednost: number): string {
  return String(Math.round(vrednost * 100) / 100);
}

/** The width of a printed card in the file, in millimetres (the height follows from the text). */
const SIRINA_MM = 60;

/**
 * A standalone SVG document of the card: the QR code, the label big under it
 * and an optional smaller line. Text is escaped; sizes are in module units so
 * the file scales as one piece (60 mm wide as saved).
 */
export function qrSvgDokument({
  url,
  naslov,
  podnaslov,
}: {
  url: string;
  naslov: string;
  podnaslov?: string;
}): string {
  const { path, dim } = qrPutanja(url);
  // The big line never runs wider than the code: shrink long labels instead of cutting them.
  const velNaslov = Math.min(dim * 0.1, (dim * 0.92) / Math.max(1, Array.from(naslov).length * 0.58));
  const velPodnaslov = velNaslov * 0.58;
  const y1 = dim + velNaslov;
  const y2 = y1 + velPodnaslov * 1.45;
  const visina = podnaslov ? y2 + velPodnaslov * 0.7 : y1 + velNaslov * 0.45;
  const tekst = (y: number, velicina: number, debljina: string, sadrzaj: string) =>
    `<text x="${broj(dim / 2)}" y="${broj(y)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${broj(velicina)}" font-weight="${debljina}" fill="${CRNA}">${xml(sadrzaj)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIRINA_MM}mm" height="${broj((SIRINA_MM * visina) / dim)}mm" viewBox="0 0 ${broj(dim)} ${broj(visina)}" role="img" aria-label="${xml(naslov)}">`,
    `<title>${xml(naslov)}</title>`,
    `<rect width="${broj(dim)}" height="${broj(visina)}" fill="${BELA}"/>`,
    `<path d="${path}" fill="${CRNA}" shape-rendering="crispEdges"/>`,
    tekst(y1, velNaslov, "700", naslov),
    podnaslov ? tekst(y2, velPodnaslov, "400", podnaslov) : "",
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Saves a text document as a file through the browser (an object URL, nothing is uploaded). */
export function preuzmiSvg(imeFajla: string, dokument: string): void {
  const blob = new Blob([dokument], { type: "image/svg+xml;charset=utf-8" });
  const adresa = URL.createObjectURL(blob);
  const veza = document.createElement("a");
  veza.href = adresa;
  veza.download = imeFajla;
  document.body.append(veza);
  veza.click();
  veza.remove();
  window.setTimeout(() => URL.revokeObjectURL(adresa), 1000);
}
