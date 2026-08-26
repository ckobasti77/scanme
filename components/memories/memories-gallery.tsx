"use client";

// TASK-17 / TASK-20 STEP 0 — /m/[code]/galerija: the shared gallery of a night's
// photos that guests chose to show everyone. Reached only when the host opted
// the space in (the page 404s otherwise). No attribution of any kind — the
// server never sends whose photo is whose.
//
// STEP 0: the grid is now a REAL cursor-paginated read (usePaginatedQuery over
// publicGalleryPage), so a night with hundreds of `everyone` photos is fully
// reachable via "load more", not silently truncated at 150. Visibility is
// resolved by the index server-side, so host_only photos never arrive here.

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import type { PublicGalleryMeta } from "./memories-view";
import {
  MemoriesFooterBrand,
  MemoriesMasthead,
  MemoriesShell,
} from "./memories-chrome";
import { PhotoSheet } from "./photo-sheet";
import { PhotoThumb } from "./photo-picture";
import styles from "./memories.module.css";

// Page size for the grid — a generous first screen, then "load more".
const PAGE_SIZE = 60;

export function MemoriesGallery({
  code,
  meta,
}: {
  code: string;
  meta: PublicGalleryMeta;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.memories.publicGalleryPage,
    { code },
    { initialNumItems: PAGE_SIZE },
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const open = results.find((photo) => photo.photoId === openId) ?? null;

  const count = results.length;
  const loadingFirst = status === "LoadingFirstPage";
  // With pagination the total is not known up front; the line reports what has
  // loaded so far (never whose), and reads naturally as more arrive.
  const countLine = loadingFirst
    ? dict.galleryLoading
    : count === 0
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
        spaceName={meta.spaceName}
        businessName={meta.businessName}
        logoUrl={meta.businessLogoUrl}
      />
      <h2 className={styles.pageTitle}>{dict.galleryTitle}</h2>
      <p className={styles.socialProof}>{countLine}</p>
      {count > 0 ? (
        <ul className={styles.photoGrid}>
          {results.map((photo, index) => (
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
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className={styles.galleryLoadMoreWrap}>
          <button
            type="button"
            className={styles.galleryLoadMore}
            onClick={() => loadMore(PAGE_SIZE)}
            disabled={status === "LoadingMore"}
          >
            {status === "LoadingMore" ? (
              <LoaderCircle
                className={styles.galleryLoadMoreSpinner}
                size={18}
                aria-hidden="true"
              />
            ) : null}
            {dict.galleryLoadMore}
          </button>
        </div>
      ) : null}
      {open ? (
        <PhotoSheet
          image={open.image}
          alt={fmt(dict.photoAlt, { index: results.indexOf(open) + 1 })}
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
