"use client";

// TASK-17 — /m/[code]/moje: every photo this guest has added to the space,
// grouped by the night it belongs to, with the same two per-photo decisions
// (visibility, delete) as the landing. The guest's photos remain theirs to see
// whatever state the space is in — this page has no upload window logic at all.

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import { formatBelgradeDate } from "@/lib/venue-calendar";
import type { MyPhotosView } from "./memories-view";
import {
  MemoriesFooterBrand,
  MemoriesMasthead,
  MemoriesShell,
} from "./memories-chrome";
import { GuestPhotoGrid } from "./guest-photo-grid";
import styles from "./memories.module.css";

export function MemoriesMyPhotos({
  code,
  guestKey,
  initialPhotos,
  spaceName,
  businessName,
  logoUrl,
  canChooseVisibility,
}: {
  code: string;
  guestKey: string;
  initialPhotos: MyPhotosView;
  spaceName: string;
  businessName: string;
  logoUrl: string | null;
  canChooseVisibility: boolean;
}) {
  const photos =
    useQuery(api.memories.myPhotosView, { code, guestKey }) ?? initialPhotos;

  // Newest first from the server; group into nights by Belgrade date.
  const groups = useMemo(() => {
    const byDate = new Map<string, MyPhotosView>();
    for (const photo of photos) {
      const key = formatBelgradeDate(photo.createdAt);
      const bucket = byDate.get(key);
      if (bucket) bucket.push(photo);
      else byDate.set(key, [photo]);
    }
    return Array.from(byDate.entries());
  }, [photos]);

  return (
    <MemoriesShell>
      <MemoriesMasthead
        spaceName={spaceName}
        businessName={businessName}
        logoUrl={logoUrl}
      />
      <h2 className={styles.pageTitle}>{dict.myPhotosTitle}</h2>
      {photos.length === 0 ? (
        <p className={styles.gridEmpty}>{dict.myPhotosEmpty}</p>
      ) : (
        groups.map(([date, groupPhotos]) => (
          <section key={date}>
            <h3 className={styles.dateHeading}>{date}</h3>
            <GuestPhotoGrid
              code={code}
              guestKey={guestKey}
              photos={groupPhotos}
              canChooseVisibility={canChooseVisibility}
            />
          </section>
        ))
      )}
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
