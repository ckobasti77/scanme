"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fairPassportSr } from "@/lib/i18n/sr/fair-passport";
import { FairEventShell } from "./event-shell";
import { knownFairShell } from "./event-shell-memory";
import styles from "./event-shell-loading.module.css";

// Instant Mapa / Pasoši / Garaža switch (31 Oct 2026): the routes' loading.tsx
// shows the event shell with the target tab already active, plus a skeleton,
// while the dynamic page streams in. The shell's event id and name are the ones
// the last rendered shell had on this device; a cold load shows the shell
// without the garage count until the page arrives.

export function FairRouteLoading({ current, children }: { current: "map" | "passports" | "garage"; children?: ReactNode }) {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const known = knownFairShell(eventSlug);
  return (
    <div className={`fair-event ${fairEventThemeClass(eventSlug)}`} data-reveal="off">
      <FairEventShell
        eventId={known?.eventId ?? ""}
        eventSlug={eventSlug}
        eventTitle={fairPassportSr.umbrellaTitle}
        eventName={known?.eventName ?? ""}
        dict={fairModelSr}
        current={current}
      />
      <main aria-busy="true">{children}</main>
    </div>
  );
}

/** Passports and garage: a heading line and three cards in the page rhythm. */
export function FairListSkeleton({ label }: { label: string }) {
  return (
    <div className={styles.list}>
      <span className={styles.srOnly} role="status">{label}</span>
      <span className={styles.line} aria-hidden="true" />
      <span className={styles.lineShort} aria-hidden="true" />
      <span className={styles.card} aria-hidden="true" />
      <span className={styles.card} aria-hidden="true" />
      <span className={styles.card} aria-hidden="true" />
    </div>
  );
}
