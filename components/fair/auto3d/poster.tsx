// Poster kao LCP (A03 §5.5): art direction za telefon (4:5) i desktop (16:9), AVIF pa WebP.
// Fajlovi su već optimizovani, pa `unoptimized`. Preload po Next 16 dokumentaciji: `preload` iz
// next/image bi učitao samo desktop izvor i na telefonu, pa se za glavni poster prave dva
// `<link rel="preload">` sa `media` i `type` (ReactDOM.preload), po jedan za svaki raspored.
// Rasklopljen poster (rezerva bez canvasa) je lenj i bez preload-a.

import { preload } from "react-dom";
import { getImageProps } from "next/image";
import type { ManifestPoster } from "@/lib/auto3d/manifest";
import styles from "./auto3d.module.css";

export const PHONE_MEDIA = "(max-width: 767px)";
const DESKTOP_MEDIA = "(min-width: 768px)";

function preloadPoster(p: ManifestPoster, media: string) {
  const src = p.avif ?? p.webp;
  if (!src) return;
  preload(src, { as: "image", type: p.avif ? "image/avif" : "image/webp", media, fetchPriority: "high" });
}

export function Poster({
  desktop,
  telefon,
  alt,
  priority = true,
}: {
  desktop: ManifestPoster;
  telefon: ManifestPoster;
  alt: string;
  priority?: boolean;
}) {
  if (priority) {
    preloadPoster(telefon, PHONE_MEDIA);
    preloadPoster(desktop, DESKTOP_MEDIA);
  }
  const { props } = getImageProps({
    src: desktop.webp ?? desktop.avif ?? "",
    width: desktop.width,
    height: desktop.height,
    alt,
    unoptimized: true,
    ...(priority ? { fetchPriority: "high" as const, loading: "eager" as const } : { loading: "lazy" as const }),
  });
  return (
    <picture className={styles.poster}>
      {telefon.avif ? <source media={PHONE_MEDIA} type="image/avif" srcSet={telefon.avif} /> : null}
      {telefon.webp ? <source media={PHONE_MEDIA} type="image/webp" srcSet={telefon.webp} /> : null}
      {desktop.avif ? <source type="image/avif" srcSet={desktop.avif} /> : null}
      <img {...props} alt={alt} decoding="async" />
    </picture>
  );
}
