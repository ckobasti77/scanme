"use client";

// TASK-17 — /m/[code]/moje: every photo this guest has added to the space,
// grouped by the night it belongs to, with the same two per-photo decisions
// (visibility, delete) as the landing. The guest's photos remain theirs to see
// whatever state the space is in — this page has no upload window logic at all.

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, LoaderCircle, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmt } from "@/lib/i18n/format";
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
  retentionDays,
}: {
  code: string;
  guestKey: string;
  initialPhotos: MyPhotosView;
  spaceName: string;
  businessName: string;
  logoUrl: string | null;
  canChooseVisibility: boolean;
  retentionDays: number | null;
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

      {/* STEP 4 — the retention window, in plain words and not buried; STEP 5 —
          the policy link; STEP 3 — the guest's own "delete everything". */}
      <p className={styles.retentionNote}>
        {retentionDays !== null
          ? `${fmt(dict.retentionNoteMy, { days: retentionDays })} `
          : ""}
        <Link href={`/m/${code}/privatnost`}>{dict.privacyLink}</Link>
      </p>
      {photos.length > 0 ? (
        <WipeAllControl code={code} guestKey={guestKey} />
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

// STEP 3 — "obriši sve moje slike". Destructive, so a two-step inline confirm
// that spells out the reach (all views, the server, and the event archive) —
// no silent one-click erasure. On confirm the server tombstones everything and
// schedules an immediate purge; the reactive myPhotosView empties on its own.
function WipeAllControl({
  code,
  guestKey,
}: {
  code: string;
  guestKey: string;
}) {
  const wipe = useMutation(api.memories.wipeMyPhotos);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    try {
      await wipe({ code, guestKey });
      setDone(true);
      setConfirming(false);
    } catch {
      setError(dict.wipeError);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p className={styles.retentionNote} role="status">
        {dict.wipeSuccess}
      </p>
    );
  }

  return (
    <section className={styles.wipeSection}>
      {!confirming ? (
        <button
          type="button"
          className={styles.wipeButton}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={17} aria-hidden="true" />
          {dict.wipeAllAction}
        </button>
      ) : (
        <div className={styles.retentionNote} role="group">
          <p style={{ marginBottom: 12 }}>
            <strong>{dict.wipeDialogTitle}</strong>
            <br />
            {dict.wipeDialogBody}
          </p>
          {error ? (
            <p role="alert" style={{ color: "var(--mem-danger)" }}>
              {error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.wipeButton}
              onClick={() => void run()}
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle
                  className={styles.galleryLoadMoreSpinner}
                  size={17}
                  aria-hidden="true"
                />
              ) : (
                <Trash2 size={17} aria-hidden="true" />
              )}
              {dict.wipeConfirm}
            </button>
            <button
              type="button"
              className={styles.galleryLoadMore}
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {dict.wipeCancel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
