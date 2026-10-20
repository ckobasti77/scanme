"use client";

import { Lora, Poppins } from "next/font/google";
import { useMemo, type ReactNode } from "react";
import { qrPath } from "@/components/offer-product-preview";
import { prelaunchSr } from "@/lib/i18n/sr/prelaunch";
import styles from "./prelaunch-products-artworks.module.css";

// Approved client designs for the #proizvodi showcase (artboards B, C and D of
// public/prototip/proizvodi/dizajni-proizvoda.html). They are drawn at 1000
// design px of width and sized in cqw of the printed surface (1 px = 0.1cqw),
// so they scale with every product. Client designs: no ScanMe green, no
// dot-matrix and no logo — only the small "powered by ScanMe" line.

// Self-hosted at build time and scoped to these artworks (class on each root).
const lora = Lora({ subsets: ["latin", "latin-ext"], style: ["normal", "italic"], variable: "--artwork-lora" });
const poppins = Poppins({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], variable: "--artwork-poppins" });
const fonts = `${lora.variable} ${poppins.variable}`;

const QR_VALUE = "https://scanme.rs";
const copy = prelaunchSr.products.artwork;

/** Real, scannable QR with its 4-module quiet zone (inside the viewBox). */
function ArtworkQr({ color, className }: { color: string; className: string }) {
  const { path, dimension } = useMemo(() => qrPath(QR_VALUE), []);
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${dimension} ${dimension}`} shapeRendering="crispEdges" className={className}>
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill={color} />
    </svg>
  );
}

const ICONS: Record<"menu" | "star" | "wifi" | "ig", ReactNode> = {
  menu: <path d="M12 6h24v36H12zM18 15h12M18 22h12M18 29h8" />,
  star: <path d="M24 5l5.6 11.6 12.8 1.8-9.3 9 2.3 12.7L24 34l-11.4 6.1 2.3-12.7-9.3-9 12.8-1.8z" />,
  wifi: (
    <>
      <path d="M6 19a26 26 0 0 1 36 0M12 26a17 17 0 0 1 24 0M18 33a8 8 0 0 1 12 0" />
      <circle cx="24" cy="39" r="2.4" />
    </>
  ),
  ig: (
    <>
      <rect x="8" y="8" width="32" height="32" rx="9" />
      <circle cx="24" cy="24" r="7.5" />
      <circle cx="33.5" cy="14.5" r="1.8" />
    </>
  ),
};

function LineIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={styles.icon}>
      {ICONS[name]}
    </svg>
  );
}

/** Light design (#B): both stands — the compact L stand and the A5 insert of the two-piece stand. */
export function StandArtwork() {
  const { stand } = copy;
  return (
    <div className={`${styles.root} ${styles.stand} ${fonts}`}>
      <div className={styles.standLayout}>
        <svg aria-hidden="true" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className={styles.sprig}>
          <path d="M32 60V10" />
          <path d="M32 20c-8-2-12-8-12-14 8 2 12 8 12 14zM32 20c8-2 12-8 12-14-8 2-12 8-12 14zM32 34c-9-2-14-9-14-16 9 2 14 9 14 16zM32 34c9-2 14-9 14-16-9 2-14 9-14 16zM32 48c-9-2-14-9-14-16 9 2 14 9 14 16zM32 48c9-2 14-9 14-16-9 2-14 9-14 16z" />
        </svg>
        <p className={styles.standTitle}>{stand.title}</p>
        <p className={styles.standSubtitle}>{stand.subtitle}</p>
        <div className={styles.arch}>
          <div className={styles.tile}>
            <ArtworkQr color="#1f2b45" className={styles.standQr} />
          </div>
        </div>
        <div className={styles.icons}>
          <span><LineIcon name="menu" />{stand.icons.menu}</span>
          <span><LineIcon name="star" />{stand.icons.reviews}</span>
          <span><LineIcon name="wifi" />{stand.icons.wifi}</span>
          <span><LineIcon name="ig" />{stand.icons.instagram}</span>
        </div>
        <p className={styles.thanks}>{stand.thanks}</p>
        <p className={`${styles.powered} ${styles.standPowered}`}>{copy.powered}</p>
      </div>
    </div>
  );
}

/** Square sticker (#C). */
export function StickerArtwork() {
  const { sticker } = copy;
  return (
    <div className={`${styles.root} ${styles.sticker} ${fonts}`}>
      <div className={styles.stickerLayout}>
        <p className={styles.stickerTitle}>{sticker.title}</p>
        <p className={styles.stickerSubtitle}>{sticker.subtitle}</p>
        <div className={styles.stickerCode}>
          <ArtworkQr color="#161616" className={styles.stickerQr} />
        </div>
        <p className={`${styles.powered} ${styles.stickerPowered}`}>{copy.powered}</p>
        <p className={styles.band}>
          {sticker.band} <span aria-hidden="true">★★★★★</span>
        </p>
      </div>
    </div>
  );
}

/** Square window film (#D), white background. The menu is on the table, so no "Pogledajte meni". */
export function FilmArtwork() {
  const { film } = copy;
  return (
    <div className={`${styles.root} ${styles.film} ${fonts}`}>
      <div className={styles.filmLayout}>
        <p className={styles.filmWelcome}>{film.welcome}</p>
        <p className={styles.filmTitle}>{film.title}</p>
        <div className={styles.filmCode}>
          <i /><i /><i /><i />
          <ArtworkQr color="#242424" className={styles.filmQr} />
        </div>
        <p className={styles.hours}>
          <b>{film.hoursLabel}</b> · {film.hours}
        </p>
        <p className={styles.powered}>{copy.powered}</p>
      </div>
    </div>
  );
}
