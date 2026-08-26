"use client";

// TASK-17 — /m/[code]/galerija: the shared gallery of tonight's photos that
// guests chose to show everyone. Reached only when the host opted the space in
// (the page 404s otherwise). No attribution of any kind — the server never
// sends whose photo is whose. Live: new photos appear as they commit.

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import type { PublicGalleryView } from "./memories-view";
import {
  MemoriesFooterBrand,
  MemoriesMasthead,
  MemoriesShell,
} from "./memories-chrome";
import { PhotoSheet } from "./photo-sheet";
import { PhotoThumb } from "./photo-picture";
import styles from "./memories.module.css";

export function MemoriesGallery({
  code,
  initialGallery,
}: {
  code: string;
  initialGallery: PublicGalleryView;
}) {
  const live = useQuery(api.memories.publicGalleryView, { code });
  // A host flipping the gallery off mid-night turns the live value null; the
  // page then simply shows the empty state until the next full load 404s.
  const gallery = live === undefined ? initialGallery : (live ?? initialGallery);
  const photos = live === null ? [] : gallery.photos;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = photos.find((photo) => photo.photoId === openId) ?? null;

  const count = photos.length;
  const countLine =
    count === 0
      ? dict.galleryEmpty
      : fmt(
          srPluralCategory(count) === "one"
            ? dict.socialProofOne
            : srPluralCategory(count) === "few"
              ? dict.socialProofFew
              : dict.socialProofMany,
          { count },
        );

  return (
    <MemoriesShell>
      <MemoriesMasthead
        spaceName={gallery.spaceName}
        businessName={gallery.businessName}
        logoUrl={gallery.businessLogoUrl}
      />
      <h2 className={styles.pageTitle}>{dict.galleryTitle}</h2>
      <p className={styles.socialProof}>{countLine}</p>
      {count > 0 ? (
        <ul className={styles.photoGrid}>
          {photos.map((photo, index) => (
            <li key={photo.photoId} className={styles.photoCell}>
              <button
                type="button"
                className={styles.photoButton}
                onClick={() => setOpenId(photo.photoId)}
                aria-label={fmt(dict.photoAlt, { index: index + 1 })}
              >
                <PhotoThumb
                  image={photo.image}
                  alt=""
                  className={styles.photoThumb}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <PhotoSheet
          image={open.image}
          alt={fmt(dict.photoAlt, { index: photos.indexOf(open) + 1 })}
          canChooseVisibility={false}
          onClose={() => setOpenId(null)}
        />
      ) : null}
      <nav className={styles.footerNav}>
        <Link className={styles.navLink} href={`/m/${code}`}>
          {dict.backToUploadLink}
          <ChevronRight
            className={styles.navLinkArrow}
            size={20}
            aria-hidden="true"
          />
        </Link>
      </nav>
      <MemoriesFooterBrand />
    </MemoriesShell>
  );
}
