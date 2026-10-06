"use client";

import Image from "next/image";
import Link from "next/link";
import { CarFront, MapPin } from "lucide-react";
import { useCallback, useSyncExternalStore, type CSSProperties } from "react";
import { getFairRotationSlot } from "@/lib/fair-client/rotation-slot";
import type { FairSponsoredRotationView } from "@/lib/fair-contract";
import { fairMapRotationAt, fairMapRotationSlotNumber, type FairMapRotationState } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import styles from "./fair-event-map.module.css";

// M2 — 12 s Advanced rotation on the map and fair displays (MASTER §10.1).
// The active model comes only from Kodeks's rotation-slot.ts over the B5
// projection (server first state, kept live by fair-map-live-rotation.ts — K2);
// the clock wakes up at the next slot boundary
// (no backend polling). Nothing here votes or writes: a passive view is never
// recorded (map/display have no sponsored write at all).

/** Active rotation item from the device clock; null on the server and without a snapshot. */
export function useFairMapRotation(rotation: FairSponsoredRotationView | null): FairMapRotationState | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!rotation?.items.length) return () => {};
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        const now = Date.now();
        const slot = getFairRotationSlot({ epochMs: rotation.epochMs, nowMs: now, intervalMs: rotation.intervalMs, itemCount: rotation.items.length });
        timer = setTimeout(
          () => {
            onChange();
            schedule();
          },
          slot ? Math.max(slot.nextSlotAt - now, 0) + 25 : rotation.intervalMs,
        );
      };
      schedule();
      return () => clearTimeout(timer);
    },
    [rotation],
  );
  const slotNumber = useSyncExternalStore(subscribe, () => fairMapRotationSlotNumber(rotation, Date.now()), () => -1);
  if (!rotation || slotNumber < 0) return null;
  // The slot's own start keeps the item stable for the whole slot.
  return fairMapRotationAt(rotation, rotation.epochMs + slotNumber * rotation.intervalMs);
}

export function FairMapRotationCard({
  state,
  locationText,
  onShowStand,
  display,
}: {
  state: FairMapRotationState | null;
  locationText: string;
  onShowStand: (() => void) | null;
  display: boolean;
}) {
  if (!state) {
    // Server render / first paint: keep the card's space so nothing jumps.
    return <section className={`${styles.card} ${styles.rotation}`} aria-hidden="true" data-rotation-pending="true" />;
  }
  const { item, slotNumber } = state;
  const audience = item.audienceResult;
  const percentages = audience?.result.state === "public" ? new Map(audience.result.options.map((row) => [row.optionId, row.percentage])) : null;

  return (
    <section
      className={`${styles.card} ${styles.rotation}`}
      aria-label={dict.rotationAria}
      data-rotation-slot={slotNumber}
      data-rotation-model={item.eventModelId}
    >
      <div key={slotNumber} className={styles.rotationBody}>
        <div className={styles.rotationHead}>
          <div className={styles.rotationVisual}>
            {item.visual === "photo" && item.photoUrl ? (
              <Image src={item.photoUrl} alt={item.displayName} fill unoptimized sizes="96px" className={styles.rotationPhoto} />
            ) : item.visual === "brand_logo" && item.brandLogoUrl ? (
              <Image src={item.brandLogoUrl} alt={item.brandName} fill unoptimized sizes="96px" className={styles.rotationLogo} />
            ) : (
              <CarFront aria-hidden="true" />
            )}
          </div>
          <div className={styles.rotationIdentity}>
            <p className={styles.rotationEyebrow}>{dict.rotationLabel}</p>
            <h2 className={styles.rotationTitle}>{item.displayName}</h2>
            <p className={styles.rotationMeta}>
              {item.brandName}
              {item.variant ? ` · ${item.variant}` : null}
            </p>
          </div>
        </div>

        {audience ? (
          <div className={styles.rotationQuestion}>
            <p className={styles.rotationPrompt}>{audience.prompt}</p>
            {percentages ? (
              <ul className={styles.rotationOptions}>
                {audience.options.map((option) => {
                  const percent = percentages.get(option.id) ?? 0;
                  return (
                    <li key={option.id} className={styles.rotationOption} style={{ "--fair-map-share": percent / 100 } as CSSProperties}>
                      <span className={styles.rotationFill} aria-hidden="true" />
                      <span>{option.label}</span>
                      <strong>{fmt(dict.rotationPercent, { percent })}</strong>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.rotationWaiting}>{dict.rotationWaiting}</p>
            )}
          </div>
        ) : null}

        <div className={styles.rotationStand}>
          <span className={styles.rotationStandText}>
            <MapPin aria-hidden="true" />
            {locationText}
          </span>
          {display ? null : (
            <span className={styles.rotationActions}>
              {onShowStand ? (
                <button type="button" className={styles.retry} onClick={onShowStand}>
                  {dict.rotationShowStand}
                </button>
              ) : null}
              <Link prefetch={false} className={styles.retry} href={`/sajam/${item.eventSlug}/model/${item.slug}`}>
                {dict.rotationOpenModel}
              </Link>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
