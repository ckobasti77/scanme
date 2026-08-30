"use client";

// Gallery grid + lightbox leaf. The lightbox is a Radix Dialog, which supplies
// the a11y contract the task demands: focus is trapped inside the dialog,
// Escape closes it, and focus returns to the tile that opened it. Arrow keys
// page between photos while open.

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import type { GalleryProps } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

export type GalleryItem = {
  id: string;
  url: string;
  alt: string;
  caption?: string;
  aspect: string;
};

type Labels = {
  openAria: string;
  countLabel: string;
  close: string;
  prev: string;
  next: string;
};

export function GalleryClient({
  layout,
  columns,
  gap,
  lightbox,
  items,
  sizes,
  labels,
}: {
  layout: GalleryProps["layout"];
  columns: number;
  gap: number;
  lightbox: boolean;
  items: GalleryItem[];
  sizes: string;
  labels: Labels;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // The tile that opened the lightbox: the grid uses controlled state (no
  // Dialog.Trigger), so focus restoration on close is explicit.
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((current) =>
        current === null
          ? current
          : (current + delta + items.length) % items.length,
      );
    },
    [items.length],
  );

  const containerClass =
    layout === "masonry"
      ? styles.galleryMasonry
      : layout === "carousel"
        ? styles.galleryCarousel
        : styles.galleryGrid;

  const containerStyle = {
    "--venue-gallery-columns": String(columns),
    "--venue-gallery-gap": `${gap}px`,
  } as React.CSSProperties;

  const active = openIndex === null ? null : items[openIndex];

  return (
    <div>
      <div className={containerClass} style={containerStyle}>
        {items.map((item, index) => {
          const image = (
            <Image
              src={item.url}
              alt={item.alt}
              fill
              sizes={sizes}
              loading={index < 3 ? "eager" : "lazy"}
            />
          );
          return lightbox ? (
            <button
              key={item.id}
              type="button"
              className={styles.galleryItem}
              style={{ "--venue-gallery-aspect": item.aspect } as React.CSSProperties}
              aria-label={fmt(labels.openAria, { index: index + 1 })}
              onClick={(event) => {
                openerRef.current = event.currentTarget;
                setOpenIndex(index);
              }}
            >
              {image}
            </button>
          ) : (
            <div
              key={item.id}
              className={styles.galleryItem}
              style={
                {
                  "--venue-gallery-aspect": item.aspect,
                  cursor: "default",
                } as React.CSSProperties
              }
            >
              {image}
            </div>
          );
        })}
      </div>

      {lightbox ? (
        <Dialog.Root
          open={openIndex !== null}
          onOpenChange={(open) => {
            if (!open) setOpenIndex(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className={styles.lightboxOverlay} />
            <Dialog.Content
              className={styles.lightboxContent}
              aria-describedby={undefined}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") step(-1);
                if (event.key === "ArrowRight") step(1);
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                openerRef.current?.focus();
              }}
            >
              <Dialog.Title className={styles.srOnly}>
                {active?.alt ?? ""}
              </Dialog.Title>
              {active ? (
                <>
                  <div className={styles.lightboxStage}>
                    <Image
                      key={active.id}
                      src={active.url}
                      alt={active.alt}
                      fill
                      sizes="92vw"
                      priority
                    />
                  </div>
                  {active.caption ? (
                    <p className={styles.lightboxCaption}>{active.caption}</p>
                  ) : null}
                  <p className={styles.lightboxCount}>
                    {fmt(labels.countLabel, {
                      index: (openIndex ?? 0) + 1,
                      count: items.length,
                    })}
                  </p>
                </>
              ) : null}
              {items.length > 1 ? (
                <>
                  <button
                    type="button"
                    className={`${styles.lightboxNav} ${styles.lightboxPrev}`}
                    aria-label={labels.prev}
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.lightboxNav} ${styles.lightboxNext}`}
                    aria-label={labels.next}
                    onClick={() => step(1)}
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                </>
              ) : null}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className={styles.lightboxClose}
                  aria-label={labels.close}
                >
                  <X aria-hidden="true" />
                </button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </div>
  );
}
