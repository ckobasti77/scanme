import { useMemo } from "react";
import { qrMatrix } from "@/lib/qr/qrcodegen";
import { fairPassportBrandSlug } from "@/lib/fair-passport";
import styles from "./brand-qr-poster.module.css";

// Kartica 11 — the A4 poster of one brand's QR. Presentational: the section
// passes the URL (what the QR must contain) and the copy; the poster is the
// same box on the screen (a scaled preview) and on the print sheet (210x297
// millimetres), every size inside is a container unit of its width, so both
// show the identical layout. QR is SVG paths (crisp edges, print-color-adjust
// exact) — no canvas, no image, no QR library.

export const SCANME_PUBLIC_ORIGIN = "https://www.scanme.rs";

/** The brand page URL the poster's QR opens (same slug rule as the brand passport share link). */
export function brandQrPosterUrl(eventSlug: string, brandName: string, origin = SCANME_PUBLIC_ORIGIN) {
  return `${SCANME_PUBLIC_ORIGIN === origin ? origin : origin.replace(/\/+$/, "")}/sajam/${encodeURIComponent(eventSlug)}/brend/${fairPassportBrandSlug(brandName)}`;
}

export type BrandQrPosterCopy = {
  /** „<BREND> · ŠTAND <štand>“ in the orange band. */
  standLine: string;
  /** „Probna vožnja?“ */
  title: string;
  /** „Prijavite se ovde.“ (orange, under the title) */
  callToAction: string;
  /** what the visitor does with the phone */
  lead: string;
  /** the three numbered steps */
  steps: readonly string[];
  /** the ScanMe wordmark at the bottom */
  footer: string;
};

const QUIET_ZONE = 4; // modules of white around the code (spec minimum)

function QrPaths({ url }: { url: string }) {
  const modules = useMemo(() => qrMatrix(url, "HIGH"), [url]);
  const dark = useMemo(() => {
    let path = "";
    for (let y = 0; y < modules.length; y += 1) {
      const row = modules[y];
      for (let x = 0; x < row.length; x += 1) {
        if (!row[x]) continue;
        path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return path;
  }, [modules]);
  const size = (modules[0]?.length ?? 0) + QUIET_ZONE * 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={styles.qr} shapeRendering="crispEdges" role="img" aria-label={url} focusable="false">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={dark} fill="#000000" />
    </svg>
  );
}

export function BrandQrPoster({ url, copy }: { url: string; copy: BrandQrPosterCopy }) {
  return (
    <article className={styles.poster} data-brand-qr-poster aria-label={copy.standLine}>
      <header className={styles.band}>
        <p className={styles.standLine}>{copy.standLine}</p>
      </header>
      <div className={styles.main}>
        <div className={styles.text}>
          <h2 className={styles.title}>{copy.title}</h2>
          <p className={styles.callToAction}>{copy.callToAction}</p>
          <p className={styles.lead}>{copy.lead}</p>
        </div>
        <div className={styles.code}>
          <QrPaths url={url} />
          <p className={styles.url}>{url}</p>
        </div>
      </div>
      <ol className={styles.steps}>
        {copy.steps.map((step, index) => (
          <li key={step} className={styles.step}>
            <span className={styles.stepNumber}>{index + 1}</span>
            <span className={styles.stepText}>{step}</span>
          </li>
        ))}
      </ol>
      <footer className={styles.footer}>
        <span className={styles.wordmark}>{copy.footer}</span>
      </footer>
    </article>
  );
}
