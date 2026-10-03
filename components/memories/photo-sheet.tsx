"use client";

// TASK-17 — the photo overlay: tap a thumbnail, see the photo big, and (for
// the guest's own photos) manage it with two large controls — the per-photo
// visibility choice and delete. Deliberately NOT a settings screen: one photo,
// at most three decisions, every target ≥ 44px. Deleting is destructive, so it
// arms first ("Obrisati ovu sliku?") and confirms in place — never a second
// dialog on top of the sheet.

import { useEffect, useRef, useState } from "react";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import type { PhotoImage } from "./memories-view";
import { PhotoPicture } from "./photo-picture";
import styles from "./memories.module.css";

export type PhotoVisibility = "everyone" | "host_only";

export function PhotoSheet({
  image,
  alt,
  visibility,
  canChooseVisibility,
  onSetVisibility,
  onDelete,
  onClose,
}: {
  image: PhotoImage;
  alt: string;
  /** Current visibility; undefined hides the control (public gallery view). */
  visibility?: PhotoVisibility;
  canChooseVisibility: boolean;
  onSetVisibility?: (visibility: PhotoVisibility) => Promise<void>;
  /** Resolves when the photo is gone; undefined hides the delete control. */
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Focus in on open, restore on close, lock the page scroll, close on
  // Escape, and confine Tab to the sheet — aria-modal tells AT the page
  // behind is gone, so the keyboard must not be able to reach it either.
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusables = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)"),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      // Focus can legally sit OUTSIDE the sheet's focusables (a button was
      // disabled mid-mutation, a confirm pair unmounted, a tap on the photo
      // parked it on <body>). From there default tabbing would reach the page
      // behind the aria-modal dialog — pull it back in instead.
      if (
        !(active instanceof HTMLElement) ||
        !focusables.includes(active)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  // Arming delete unmounts the focused "Obriši" button; without this, focus
  // falls to <body> and a keyboard user loses their place mid-decision.
  useEffect(() => {
    if (deleteArmed) confirmRef.current?.focus();
  }, [deleteArmed]);

  const setVisibility = async (next: PhotoVisibility) => {
    if (!onSetVisibility || busy || next === visibility) return;
    setBusy(true);
    setError(null);
    try {
      await onSetVisibility(next);
    } catch {
      setError(dict.actionError);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!onDelete || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch {
      setError(dict.deleteError);
      setBusy(false);
      setDeleteArmed(false);
    }
  };

  return (
    <div
      ref={sheetRef}
      className={styles.sheetBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={dict.sheetAria}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.sheetImageWrap}>
        <PhotoPicture image={image} alt={alt} className={styles.sheetPicture} />
      </div>
      <div className={styles.sheetActions}>
        {visibility !== undefined && canChooseVisibility && onSetVisibility ? (
          <div
            className={styles.segment}
            role="group"
            aria-label={dict.visibilityToggleAria}
          >
            <button
              type="button"
              className={styles.segmentButton}
              aria-pressed={visibility === "everyone"}
              disabled={busy}
              onClick={() => void setVisibility("everyone")}
            >
              {dict.visibilityEveryone}
            </button>
            <button
              type="button"
              className={styles.segmentButton}
              aria-pressed={visibility === "host_only"}
              disabled={busy}
              onClick={() => void setVisibility("host_only")}
            >
              {dict.visibilityHostOnly}
            </button>
          </div>
        ) : null}
        {onDelete && !deleteArmed ? (
          <button
            type="button"
            className={`${styles.sheetButton} ${styles.sheetButtonDanger}`}
            disabled={busy}
            onClick={() => setDeleteArmed(true)}
          >
            {dict.itemDeleteAction}
          </button>
        ) : null}
        {onDelete && deleteArmed ? (
          <>
            <p className={styles.stateBody}>
              <strong>{dict.deleteDialogTitle}</strong> {dict.deleteDialogBody}
            </p>
            <button
              type="button"
              ref={confirmRef}
              className={`${styles.sheetButton} ${styles.sheetButtonDanger}`}
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {dict.deleteConfirm}
            </button>
            <button
              type="button"
              className={styles.sheetButton}
              disabled={busy}
              onClick={() => setDeleteArmed(false)}
            >
              {dict.deleteCancel}
            </button>
          </>
        ) : null}
        {error ? (
          <p className={styles.sheetError} role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          ref={closeRef}
          className={styles.sheetButton}
          onClick={onClose}
        >
          {dict.sheetClose}
        </button>
      </div>
    </div>
  );
}
