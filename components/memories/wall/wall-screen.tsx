"use client";

// TASK-22 — the live wall engine (/zid/[code]). Furniture that runs unattended
// for six hours while hundreds of photos land. The design brief, and how each
// line here serves it:
//
//   • MEMORY MUST NOT GROW. The reactive feed is a bounded newest-first window
//     (the server caps it at WALL_WINDOW); this component renders only a bounded
//     subset — one hero photo plus MOSAIC_COUNT ambient tiles — and drops what
//     scrolled past. React unmounts dropped tiles (keyed by photoId), so their
//     decoded bitmaps are freed. Steady-state image count is the same at 02:00
//     with 400 photos as at 20:00 with four.
//
//   • THE NEW-UPLOAD MOMENT IS THE PRODUCT. A photo that arrives AFTER mount is
//     staged as the centrepiece — a warm gold spotlight ring and "Nova uspomena"
//     — for a held beat before it recedes into the rotation. The guest looks up
//     and sees their photo caught. Photos present at mount are the existing wall,
//     never re-announced.
//
//   • A DROPPED CONNECTION IS SILENT. Convex's reactive query keeps returning its
//     last value while offline; this component additionally holds the last good
//     window in a ref, so a reconnect (or a mid-night wallEnabled flip) never
//     blanks the room or shows an error — it keeps showing what it has.
//
//   • NO CHROME, NO CURSOR, NO MOTION SICKNESS. Full-bleed and opaque over the
//     app's global toggle/toaster; cursor hidden; prefers-reduced-motion drops
//     every scale/drift for plain opacity cross-fades.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { memoriesWallSr as dict } from "@/lib/i18n/sr/memories-wall";
import { PhotoPicture } from "../photo-picture";
import type { PhotoImage } from "../memories-view";
import { WallQr } from "./wall-qr";
import styles from "./wall.module.css";

export type WallFeed = FunctionReturnType<typeof api.memoriesWall.wallFeed>;
type WallPhoto = WallFeed["photos"][number];

export type WallMeta = NonNullable<
  FunctionReturnType<typeof api.memoriesWall.wallView>
>;

// The ambient wallpaper tile count. Bounded render → bounded decoded memory.
const MOSAIC_COUNT = 12;
// How long a just-uploaded photo holds the stage, and how long an idle spotlight
// photo dwells before the next. Slow, ambient — nothing that flickers on a 65".
const ARRIVAL_MS = 7000;
const SPOTLIGHT_MS = 6500;
// Poll cadence for the stage machine while the wall is empty (so the first
// photo of the night appears promptly, not after a full dwell).
const EMPTY_RECHECK_MS = 2000;
// A reconnect after a long outage can surface many "new" photos at once; only
// the most recent few get the staged moment — the rest join the mosaic quietly.
const MAX_ARRIVAL_QUEUE = 4;
// The incoming stage photo fades in over the outgoing one; the outgoing is then
// removed. Cleanup is a setTimeout (NOT an animation-frame callback), so it
// fires even if the tab is ever backgrounded and requestAnimationFrame pauses —
// the stage can therefore never accumulate more than two cards over six hours.
const STAGE_FADE_MS = 900;

type StagePick = { photo: WallPhoto; isNew: boolean; key: number };

// The Convex-connected wall: subscribe to the reactive feed and hand it to the
// canvas. Thin on purpose — all windowing/staging/memory logic lives in
// WallCanvas, which the dev harness (app/dev/wall) drives with a synthetic feed
// to run the duration/memory test against the exact same rendering code.
//
// Convex's useQuery returns `undefined` only on the very first load; once it has
// a value it keeps returning that value through a dropped WebSocket and silently
// updates on reconnect — so "never blank the room on a dropped connection" is a
// property of the data layer, not something this component has to reconstruct.
export function WallScreen({
  code,
  meta,
  joinUrl,
}: {
  code: string;
  meta: WallMeta;
  joinUrl: string;
}) {
  const feed = useQuery(api.memoriesWall.wallFeed, { code });
  return <WallCanvas feed={feed} meta={meta} joinUrl={joinUrl} />;
}

export function WallCanvas({
  feed,
  meta,
  joinUrl,
}: {
  feed: WallFeed | undefined;
  meta: WallMeta;
  joinUrl: string;
}) {
  const reduceMotion = useReducedMotion();

  // --- the bounded window, derived straight from the feed ------------------
  // No copy into state: the feed IS the newest-first window (server-capped at
  // WALL_WINDOW), so the mosaic and count read from it directly. React unmounts
  // tiles for photoIds that scroll out of the window; their bitmaps are freed.
  const pool = feed?.photos ?? [];
  const count = feed?.count ?? 0;
  const mosaic = pool.slice(0, MOSAIC_COUNT);

  // Mirror the window and detect arrivals for the stage machine — refs only, so
  // this never triggers a render of its own (the feed already did).
  const poolRef = useRef<WallPhoto[]>([]);
  const arrivalsRef = useRef<WallPhoto[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const sessionRef = useRef<string | null>(null);
  const initedRef = useRef(false);

  useEffect(() => {
    if (feed === undefined) return;
    const photos = feed.photos;
    poolRef.current = photos;
    const firstLoad = !initedRef.current;
    const rollover = feed.sessionId !== sessionRef.current;
    if (firstLoad || rollover) {
      // First paint, or the night rolled over at the cutoff (handled without a
      // reload): adopt the window as the existing wall, announce none of it.
      initedRef.current = true;
      sessionRef.current = feed.sessionId;
      seenRef.current = new Set(photos.map((p) => p.photoId));
      arrivalsRef.current = [];
      return;
    }
    const fresh = photos.filter((p) => !seenRef.current.has(p.photoId));
    photos.forEach((p) => seenRef.current.add(p.photoId));
    if (fresh.length > 0) {
      // newest-first; keep only the most recent arrivals if a burst floods in
      // (e.g. many photos committed during a Wi-Fi outage, all seen on reconnect).
      arrivalsRef.current = [...fresh, ...arrivalsRef.current].slice(
        0,
        MAX_ARRIVAL_QUEUE,
      );
    }
  }, [feed]);

  // --- the single-hero stage machine ---------------------------------------
  // Up to two layers: the outgoing photo and the incoming one that fades in over
  // it. Trimmed back to one by a setTimeout, so the count is hard-bounded.
  const [layers, setLayers] = useState<StagePick[]>([]);
  const spotlightRef = useRef(0);
  const stageKeyRef = useRef(0);

  const showPick = useCallback((pick: StagePick | null) => {
    if (!pick) {
      setLayers([]);
      return;
    }
    setLayers((prev) => [...prev, pick].slice(-2));
    // Drop the outgoing layer once the cross-fade is done — timer-driven, so it
    // runs regardless of the animation-frame clock.
    setTimeout(() => {
      setLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev));
    }, STAGE_FADE_MS);
  }, []);

  const pickNext = useCallback((): StagePick | null => {
    if (arrivalsRef.current.length > 0) {
      const head = arrivalsRef.current.shift() as WallPhoto;
      stageKeyRef.current += 1;
      return { photo: head, isNew: true, key: stageKeyRef.current };
    }
    const current = poolRef.current;
    if (current.length > 0) {
      const idx = spotlightRef.current % current.length;
      spotlightRef.current += 1;
      stageKeyRef.current += 1;
      return { photo: current[idx], isNew: false, key: stageKeyRef.current };
    }
    return null;
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const next = pickNext();
      showPick(next);
      const dwell = next
        ? next.isNew
          ? ARRIVAL_MS
          : SPOTLIGHT_MS
        : EMPTY_RECHECK_MS;
      timer = setTimeout(tick, dwell);
    };
    // First tick is scheduled (not synchronous) so the stage is driven entirely
    // from timer callbacks, never a synchronous setState in the effect body.
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [pickNext, showPick]);

  // --- keep the screen awake (Wake Lock API) -------------------------------
  useWakeLock();

  const top = layers.length > 0 ? layers[layers.length - 1] : null;
  const hasContent = top !== null;
  const countLine = fmt(
    srPluralCategory(count) === "one"
      ? dict.countOne
      : srPluralCategory(count) === "few"
        ? dict.countFew
        : dict.countMany,
    { count },
  );

  return (
    <main className={styles.wall} aria-label={meta.spaceName}>
      {/* Ambient wallpaper: the recent window, dimmed. Dims further while a new
          arrival holds the stage, to spotlight it. */}
      <div
        className={`${styles.mosaic} ${top?.isNew ? styles.mosaicDim : ""}`}
        aria-hidden="true"
        data-wall-mosaic=""
      >
        {mosaic.map((photo) => (
          <MosaicCell
            key={photo.photoId}
            image={photo.image}
            reduceMotion={!!reduceMotion}
          />
        ))}
      </div>
      <div className={styles.vignette} aria-hidden="true" />

      {/* The stage: one photo at a time. Both layers share the centered grid
          cell (grid-area 1/1) so the incoming fades in over the outgoing. */}
      {hasContent ? (
        <div className={styles.stage} data-wall-stage="">
          {layers.map((layer) => (
            <StageCard
              key={layer.key}
              pick={layer}
              isTop={layer.key === top.key}
              reduceMotion={!!reduceMotion}
            />
          ))}
        </div>
      ) : (
        <div className={styles.waiting}>
          <h2 className={styles.waitingTitle}>{dict.waitingTitle}</h2>
          <p className={styles.waitingBody}>
            {meta.requiresApproval
              ? dict.waitingApprovalBody
              : dict.waitingBody}
          </p>
        </div>
      )}

      {/* Masthead: the space name + a live count, readable across the room. */}
      <header className={styles.masthead}>
        <h1 className={styles.spaceName}>{meta.spaceName}</h1>
        <div>
          <span className={styles.live}>
            <span className={styles.liveDot} aria-hidden="true" />
            {dict.liveLabel}
          </span>
          {count > 0 ? <div className={styles.count}>{countLine}</div> : null}
        </div>
      </header>

      {/* The recruit: the space's QR, small and persistent, so anyone watching
          can join without asking. The URL is resolved server-side, so the code
          is scannable on the very first paint. */}
      {joinUrl ? (
        <aside className={styles.qrCorner}>
          <WallQr url={joinUrl} title={dict.joinLine} />
          <p className={styles.qrLine}>{dict.joinLine}</p>
        </aside>
      ) : null}
    </main>
  );
}

// --- a single stage photo (arrival or spotlight) ---------------------------

function StageCard({
  pick,
  isTop,
  reduceMotion,
}: {
  pick: StagePick;
  isTop: boolean;
  reduceMotion: boolean;
}) {
  // The outgoing layer sits static at full opacity beneath the incoming one; the
  // incoming fades in over it (the cross-fade), then the outgoing is removed.
  if (!isTop) {
    return (
      <div className={styles.stageCard}>
        <Frame image={pick.photo.image} alt={dict.photoAlt} />
      </div>
    );
  }
  const enter = reduceMotion
    ? { opacity: 1 }
    : { opacity: 1, scale: 1, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const } };
  const initial = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: pick.isNew ? 0.86 : 1.02 };
  return (
    <motion.div className={styles.stageCard} initial={initial} animate={enter}>
      <Frame image={pick.photo.image} alt={dict.photoAlt} />
      {pick.isNew ? (
        <>
          <motion.div
            className={styles.stageRing}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: [0, 1, 1, 0.7], transition: { duration: ARRIVAL_MS / 1000, times: [0, 0.12, 0.8, 1] } }
            }
          />
          <motion.div
            className={styles.newBadge}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? undefined : { delay: 0.25, duration: 0.5 }}
          >
            <span className={styles.newBadgeDot} aria-hidden="true" />
            {dict.newMoment}
          </motion.div>
        </>
      ) : null}
    </motion.div>
  );
}

// --- the frame: the orientation solution (blurred fill + contained photo) ---
// Portrait phones on a landscape screen: the sharp photo is CONTAINED so a face
// is never cropped and nothing is distorted; a blurred, over-scaled copy of the
// same photo fills the letterbox so the frame still reads as full-bleed.

function Frame({ image, alt }: { image: PhotoImage; alt: string }) {
  return (
    <div className={styles.frame}>
      {/* The blurred fill: a cover-scaled copy of the same photo, so the frame
          reads full-bleed while the sharp photo below stays contained. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.webpUrl}
        alt=""
        aria-hidden="true"
        className={styles.frameFill}
        decoding="async"
      />
      {/* Contained (never cropped, never distorted). The <picture> wrapper is
          inline; the absolutely-positioned <img> resolves against .frame. */}
      <PhotoPicture image={image} alt={alt} className={styles.framePhoto} />
    </div>
  );
}

function MosaicCell({
  image,
  reduceMotion,
}: {
  image: PhotoImage;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      className={styles.mosaicCell}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? undefined : { duration: 1.1 }}
    >
      {/* The mosaic uses the full contained photo (not the square thumb) so no
          ambient tile ever crops a face either. Bounded to MOSAIC_COUNT. */}
      <Frame image={image} alt="" />
    </motion.div>
  );
}

// --- Wake Lock: keep the projector awake all night --------------------------
// The Screen Wake Lock API holds the display on while the wall is visible, and
// is re-acquired whenever the tab becomes visible again (a lock is released on
// tab hide). Where it is unavailable (older Safari, some kiosk browsers) there
// is no web API to force it — the operator must disable the OS sleep timer;
// this is documented in docs/perf/memories-wall.md.

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

function useWakeLock() {
  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      const nav = navigator as WakeLockNavigator;
      if (!nav.wakeLock) return;
      try {
        const next = await nav.wakeLock.request("screen");
        if (cancelled) {
          void next.release();
          return;
        }
        sentinel = next;
      } catch {
        // A wake lock can be refused (battery saver, permissions); the wall
        // still runs, it just cannot force the screen awake here.
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, []);
}
