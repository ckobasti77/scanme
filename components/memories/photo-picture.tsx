import type { PhotoImage } from "./memories-view";

// TASK-17 — the one way a processed Memories photo reaches a screen: <picture>
// with the AVIF source first and the WebP <img> fallback (RFC-001 §2.4 C.8 —
// old iPhones are the audience, not the exception). Explicit width/height so
// the browser reserves the box before the bytes arrive — no layout shift.

export function PhotoPicture({
  image,
  alt,
  className,
}: {
  image: PhotoImage;
  alt: string;
  className?: string;
}) {
  return (
    <picture>
      <source type="image/avif" srcSet={image.avifUrl} />
      {/* The AVIF/WebP variants are pre-encoded by the pipeline and served
          from signed storage URLs; next/image can neither allow the host nor
          pick the format — <picture> is the delivery mechanism (§2.4 C.8). */}
      <img
        src={image.webpUrl}
        width={image.width}
        height={image.height}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

// Grid thumbnail: the 512px square WebP variant, sized by the pipeline for
// 3-column phone grids at 3× DPR. The square crop means every grid cell is a
// fixed 1:1 box — thumbnails swapping in can never shift the layout.
export function PhotoThumb({
  image,
  alt,
  className,
}: {
  image: PhotoImage;
  alt: string;
  className?: string;
}) {
  return (
    // Pre-encoded 512px WebP thumb from signed storage; see PhotoPicture.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.thumbUrl}
      width={image.thumbWidth}
      height={image.thumbHeight}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
