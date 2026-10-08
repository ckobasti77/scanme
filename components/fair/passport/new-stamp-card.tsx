"use client";

import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { fmt } from "@/lib/i18n/format";
import { fairPassportSr } from "@/lib/i18n/sr/fair-passport";
import type { FairPassportDict } from "@/lib/i18n/types";
import styles from "./new-stamp-card.module.css";

/** Delay after the model page settles before the card springs in (prototype). */
const ENTRANCE_DELAY_MS = 700;

/**
 * "Nov pečat" nudge. `overlay` (passport dev preview) is absolutely positioned
 * inside a hero; `strip` (model page v2) is a slim in-flow row between the
 * hero and the key specs, never over the photo.
 */
export function NewStampCard({
  brandName,
  brandSlug,
  modelSlug,
  eventSlug,
  onDismiss,
  layout = "overlay",
  dict = fairPassportSr,
}: {
  brandName: string;
  brandSlug: string;
  modelSlug: string;
  eventSlug: string;
  onDismiss: () => void;
  layout?: "overlay" | "strip";
  dict?: FairPassportDict;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const leavingRef = useRef(false);
  const brand = brandName.replace(/^TEST\s+/i, "").trim();
  const href = `/sajam/${eventSlug}/pasosi/${brandSlug}?focus=${encodeURIComponent(modelSlug)}`;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      root.style.opacity = "1";
      return;
    }
    const timer = window.setTimeout(() => {
      fairHaptic(12);
      root.animate(
        [
          { opacity: 0, transform: "translateY(26px) scale(.97)" },
          { opacity: 1, transform: "translateY(-3px) scale(1.005)", offset: 0.62 },
          { opacity: 1, transform: "translateY(1px) scale(1)", offset: 0.84 },
          { opacity: 1, transform: "none" },
        ],
        { duration: 560, easing: "cubic-bezier(.2,.9,.25,1)", fill: "forwards" },
      );
    }, ENTRANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    const root = rootRef.current;
    if (!root || leavingRef.current) return;
    leavingRef.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDismiss();
      return;
    }
    root.getAnimations().forEach((animation) => animation.cancel());
    root.style.opacity = "1";
    root.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(14px) scale(.98)" }], {
      duration: 220,
      easing: "ease-in",
      fill: "forwards",
    }).onfinish = () => onDismiss();
  }

  return (
    <div ref={rootRef} className={layout === "strip" ? `${styles.card} ${styles.strip}` : styles.card}>
      <Link prefetch={false} href={href} className={styles.link} aria-label={fmt(dict.newStampAria, { brand })}>
        <span className={styles.tile} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <i />
        </span>
        <span className={styles.copy}>
          <span className={styles.eyebrow}>{dict.newStampEyebrow}</span>
          <span className={styles.title}>{fmt(dict.newStampTitle, { brand })}</span>
        </span>
        <span className={styles.action} aria-hidden="true">
          {dict.newStampAction}
          <ChevronRight />
        </span>
      </Link>
      <button type="button" className={styles.dismiss} onClick={dismiss} aria-label={dict.newStampDismiss}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
