"use client";

// TASK-17 — the guest's own photos as a 3-column grid of square thumbnails.
// Tapping a photo opens the PhotoSheet with the two per-photo decisions
// (visibility, delete). The grid cells are fixed 1:1 boxes, so a thumbnail
// arriving can never shift the layout. A photo the host allows everyone to
// see carries no badge; one only the guest and host see carries a small
// eye-off mark.

import { useState } from "react";
import { EyeOff } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmt } from "@/lib/i18n/format";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import type { MyPhotosView } from "./memories-view";
import { PhotoSheet, type PhotoVisibility } from "./photo-sheet";
import { PhotoThumb } from "./photo-picture";
import styles from "./memories.module.css";

export function GuestPhotoGrid({
  code,
  guestKey,
  photos,
  canChooseVisibility,
  emptyText,
}: {
  code: string;
  guestKey: string;
  photos: MyPhotosView;
  canChooseVisibility: boolean;
  emptyText?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const setVisibility = useMutation(api.memories.setMyPhotoVisibility);
  const deletePhoto = useMutation(api.memories.deleteMyPhoto);

  const open = photos.find((photo) => photo.photoId === openId) ?? null;

  if (photos.length === 0) {
    return emptyText ? <p className={styles.gridEmpty}>{emptyText}</p> : null;
  }

  return (
    <>
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
            {photo.visibility === "host_only" ? (
              <span className={styles.photoBadge} aria-hidden="true">
                <EyeOff size={13} strokeWidth={2.25} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {open ? (
        <PhotoSheet
          image={open.image}
          alt={fmt(dict.photoAlt, {
            index: photos.indexOf(open) + 1,
          })}
          visibility={open.visibility}
          canChooseVisibility={canChooseVisibility}
          onSetVisibility={async (visibility: PhotoVisibility) => {
            await setVisibility({
              code,
              guestKey,
              photoId: open.photoId,
              visibility,
            });
          }}
          onDelete={async () => {
            await deletePhoto({ code, guestKey, photoId: open.photoId });
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
