"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CarFront, Check, LockKeyhole, MapPin, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  FairPassportCatalogEntry,
  FairPassportProgress,
  FairPassportState,
  FairPublicModel,
} from "@/lib/fair-contract";
import { fairHaptic } from "@/lib/fair-client/haptics";
import {
  FAIR_PASSPORT_VISIT_CHANGE_EVENT,
  forgetPassportModelsSeen,
  markPassportModelsSeen,
  unreadPassportModelIds,
} from "@/lib/fair-client/passport-visit-store";
import { fairLocalPhotoUrl } from "@/lib/fair-client/photo-url";
import {
  applyDevPassportStamps,
  devPassportProgressWithStamp,
  writeDevPassportStampIds,
} from "@/lib/fair-client/passport-dev-store";
import {
  devFavoriteResult,
  favoriteLeaders,
  focusCardId,
  passportDotCounts,
} from "@/lib/fair-client/passport-unlock";
import { fairPassportBrandSlug, fairPassportDisplayName } from "@/lib/fair-passport";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fmt } from "@/lib/i18n/format";
import type { FairPassportDict } from "@/lib/i18n/types";
import { FairBrandMark } from "../garage/fair-brand-mark";
import styles from "./fair-passport.module.css";
import { NewStampCard } from "./new-stamp-card";
import { PassportFinale } from "./passport-finale";
import { PassportSeal, passportBrandSealTexts, passportEventSealTexts } from "./passport-seal";
import { PassportUnlockCard } from "./passport-unlock-card";

type EventView = {
  id: string;
  publicSlug: string;
  dataSlug: string;
  title: string;
};

type LoadState = "loading" | "ready" | "error";

type DevFavoriteThreshold = "public" | "below";

const passportStateCache = new Map<string, FairPassportState>();

function passportCacheKey(event: EventView) {
  return `${event.id}:${event.dataSlug}`;
}

function readCachedPassportState(event: EventView) {
  if (typeof window === "undefined") return undefined;
  return passportStateCache.get(passportCacheKey(event));
}

function cachePassportState(cacheKey: string, state: FairPassportState) {
  if (typeof window !== "undefined") passportStateCache.set(cacheKey, state);
  return state;
}

const REVIEW_PHOTOS: Record<string, string> = {
  "bmw i4": "/fair/fixtures/bmw-i4.webp",
  "byd dolphin": "/fair/fixtures/byd-dolphin.webp",
  "byd dolphin surf": "/fair/elektromobilnost-2026/byd-dolphin-surf.png",
  "byd sealion 7": "/fair/elektromobilnost-2026/byd-sealion-7.jpg",
  "geely starray": "/fair/fixtures/geely-starray.webp",
  "jmev ev3": "/fair/elektromobilnost-2026/jmev-ev3-event.jpg",
  "jmev elight": "/fair/elektromobilnost-2026/jmev-elight-event.jpg",
  "jmev ewind": "/fair/elektromobilnost-2026/jmev-ewind-event.jpg",
  "toyota urban ev": "/fair/fixtures/toyota-urban-cruiser.webp",
  "toyota urban cruiser": "/fair/fixtures/toyota-urban-cruiser.webp",
};

const REVIEW_BRAND_PRESENTATIONS: Record<string, { backdropUrl?: string; logoUrl?: string; variant: "photo" | "graphic" }> = {
  byd: { variant: "graphic" },
  jmev: {
    backdropUrl: "/fair/elektromobilnost-2026/jmev-showroom-backdrop.jpg",
    logoUrl: "/fair/elektromobilnost-2026/jmev-brand-logo.png",
    variant: "photo",
  },
};

const EASE_OUT = "cubic-bezier(.2,.9,.2,1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cleanLabel(value: string) {
  return value.replace(/^TEST\s+/i, "").trim();
}

function brandPresentation(brandName: string) {
  return REVIEW_BRAND_PRESENTATIONS[cleanLabel(brandName).toLocaleLowerCase("sr-Latn")];
}

function modelPhoto(model: FairPublicModel | undefined, brandName: string, displayName: string) {
  if (model?.photoUrl) return fairLocalPhotoUrl(model.photoUrl);
  if (process.env.NODE_ENV === "production") return undefined;
  const modelName = fairPassportDisplayName(brandName, displayName);
  return REVIEW_PHOTOS[`${cleanLabel(brandName)} ${modelName}`.toLocaleLowerCase("sr-Latn")];
}

function BrandLogo({
  passport,
  large = false,
  onBackdrop = false,
}: {
  passport: FairPassportCatalogEntry;
  large?: boolean;
  onBackdrop?: boolean;
}) {
  const presentation = brandPresentation(passport.brandName);
  const usesPresentationLogo = Boolean(presentation?.logoUrl && (onBackdrop || large));
  const logoUrl = usesPresentationLogo ? presentation?.logoUrl : passport.brandLogoUrl;
  const brand = cleanLabel(passport.brandName);
  return (
    <span className={`${styles.brandLogo}${large ? ` ${styles.brandLogoLarge}` : ""}${onBackdrop ? ` ${styles.brandLogoOnBackdrop}` : ""}${large && usesPresentationLogo && !onBackdrop ? ` ${styles.brandLogoPresentation}` : ""}`}>
      {logoUrl ? (
        <Image fill sizes={large ? "112px" : "110px"} src={logoUrl} alt="" />
      ) : onBackdrop && brand.toLocaleLowerCase("sr-Latn") === "byd" ? (
        <strong className={styles.brandWordmark}>BYD</strong>
      ) : (
        <FairBrandMark brandName={brand} className={styles.brandLogoFallback} />
      )}
    </span>
  );
}

function ProgressDots({
  count,
  filled,
  pending = 0,
  label,
}: {
  count: number;
  filled: number;
  /** Stamped but still waiting for the hold: a quiet breathing ring. */
  pending?: number;
  label: string;
}) {
  return (
    <span className={styles.progressDots} role="img" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          data-dot={index}
          className={
            index < filled
              ? styles.progressDotFilled
              : index < filled + pending
                ? styles.progressDotPending
                : undefined
          }
        />
      ))}
    </span>
  );
}

function progressFor(state: FairPassportState, passport: FairPassportCatalogEntry) {
  return state.progress.find((row) => row.passportId === passport.passportId) ?? {
    passportId: passport.passportId,
    stampedModelIds: [],
    stampedCount: 0,
    requiredCount: passport.models.length,
    completed: false,
  } satisfies FairPassportProgress;
}

function dotsLabel(dict: FairPassportDict, brand: string, required: number, filled: number, pending: number) {
  return pending > 0
    ? fmt(dict.progressPendingAria, { brand, stamped: filled, required, pending })
    : fmt(dict.progressAria, { brand, stamped: filled, required });
}

function Overview({
  event,
  state,
  unread,
  dict,
}: {
  event: EventView;
  state: FairPassportState;
  unread: Record<string, string[]>;
  dict: FairPassportDict;
}) {
  const themeClass = fairEventThemeClass(event.publicSlug);
  const seal = passportEventSealTexts(themeClass, event.title, dict);
  return (
    <main className={styles.main}>
      <section className={styles.overviewHeading}>
        <div>
          <h1>{dict.passportsNav}</h1>
          <span>{dict.overviewIntro}</span>
        </div>
        <PassportSeal
          {...seal}
          className={styles.eventSeal}
          label={themeClass === "fair-event--electromobility" ? dict.sealEventAria : `${seal.top} ${seal.center}`}
        />
      </section>

      {state.catalog.length === 0 ? (
        <section className={styles.empty}>
          <h2>{dict.emptyTitle}</h2>
          <p>{dict.emptyBody}</p>
        </section>
      ) : (
        <section className={styles.passportGrid} aria-label={dict.overviewTitle}>
          {state.catalog.map((passport, index) => {
            const progress = progressFor(state, passport);
            const brand = cleanLabel(passport.brandName);
            const presentation = brandPresentation(passport.brandName);
            const dots = passportDotCounts(progress.stampedModelIds, unread[passport.passportId] ?? []);
            return (
              <Link
                key={passport.passportId}
                prefetch={false}
                className={`${styles.passportCard} ${presentation?.variant === "photo" ? styles.passportCardPhoto : styles.passportCardGraphic}`}
                href={`/sajam/${event.publicSlug}/pasosi/${fairPassportBrandSlug(passport.brandName)}`}
                aria-label={fmt(dict.openPassport, { brand })}
              >
                {presentation?.backdropUrl ? (
                  <Image
                    className={styles.passportCardBackdrop}
                    fill
                    priority={index === 0}
                    sizes="(max-width: 560px) calc(100vw - 32px), 528px"
                    src={presentation.backdropUrl}
                    alt=""
                  />
                ) : null}
                <span className={styles.passportCardShade} aria-hidden="true" />
                <span className={styles.passportCardTop}>
                  <BrandLogo passport={passport} onBackdrop />
                  {dots.pending > 0 ? <span className={styles.newBadge}>{dict.newStamp}</span> : null}
                </span>
                <strong>{brand}</strong>
                <ProgressDots
                  count={progress.requiredCount}
                  filled={dots.filled}
                  pending={dots.pending}
                  label={dotsLabel(dict, brand, progress.requiredCount, dots.filled, dots.pending)}
                />
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}

function FavoritePicker({
  passport,
  progress,
  modelById,
  dict,
  onProgress,
  devTools,
  devThreshold,
}: {
  passport: FairPassportCatalogEntry;
  progress: FairPassportProgress;
  modelById: Map<string, FairPublicModel>;
  dict: FairPassportDict;
  onProgress: (next: FairPassportProgress) => void;
  devTools: boolean;
  devThreshold: DevFavoriteThreshold;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<"saved" | "error" | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<Record<string, number>>({});
  const result = progress.favoriteModelId ? progress.favoriteResult : undefined;
  const publicResult = result?.state === "public" ? result : undefined;
  const leaders = favoriteLeaders(publicResult);
  const percentFor = (eventModelId: string) =>
    publicResult?.options.find((option) => option.eventModelId === eventModelId)?.percentage ?? 0;

  // Same rhythm as Glas publike: bars and counters run from the last shown value.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !publicResult) {
      shownRef.current = {};
      return;
    }
    const reduced = prefersReducedMotion();
    const rows = Array.from(grid.querySelectorAll<HTMLElement>("[data-result-for]"));
    const runs: Array<{ counter: HTMLElement; from: number; to: number }> = [];
    const next: Record<string, number> = {};
    for (const row of rows) {
      const id = row.dataset.resultFor ?? "";
      const fill = row.querySelector<HTMLElement>("[data-result-fill]");
      const counter = row.querySelector<HTMLElement>("[data-result-count]");
      if (!fill || !counter) continue;
      const to = publicResult.options.find((option) => option.eventModelId === id)?.percentage ?? 0;
      const from = shownRef.current[id] ?? 0;
      next[id] = to;
      fill.getAnimations().forEach((animation) => animation.cancel());
      fill.style.transform = `scaleX(${to / 100})`;
      counter.textContent = `${to}%`;
      if (reduced || from === to) continue;
      fill.animate([{ transform: `scaleX(${from / 100})` }, { transform: `scaleX(${to / 100})` }], {
        duration: 750,
        easing: "cubic-bezier(.22,1,.36,1)",
      });
      counter.textContent = `${from}%`;
      runs.push({ counter, from, to });
    }
    shownRef.current = next;
    if (runs.length === 0) return;
    const started = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const k = Math.min(1, (now - started) / 750);
      const eased = 1 - Math.pow(1 - k, 3);
      for (const run of runs) run.counter.textContent = `${Math.round(run.from + (run.to - run.from) * eased)}%`;
      if (k < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [publicResult]);

  async function choose(eventModelId: string) {
    if (pending) return;
    setPending(eventModelId);
    setMessage(null);
    if (devTools) {
      onProgress({
        ...progress,
        favoriteModelId: eventModelId,
        favoriteResult: devFavoriteResult(passport.models.map((model) => model.eventModelId), eventModelId, devThreshold),
      });
      setMessage("saved");
      setPending(null);
      return;
    }
    try {
      const response = await fetch("/api/fair/passport/favorite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passportId: passport.passportId, eventModelId }),
      });
      const body = (await response.json()) as { ok: boolean; value?: FairPassportProgress };
      if (!response.ok || !body.ok || !body.value) throw new Error("favorite_failed");
      onProgress(body.value);
      setMessage("saved");
    } catch {
      setMessage("error");
    } finally {
      setPending(null);
    }
  }

  return (
    <section id="passport-favorite" className={styles.favoriteSection}>
      <span className={styles.completionPill}><Check aria-hidden="true" />{dict.completedTitle}</span>
      <h2>{dict.favoriteTitle}</h2>
      <p>{dict.favoriteIntro}</p>
      <div ref={gridRef} className={styles.favoriteGrid}>
        {passport.models.map((passportModel) => {
          const model = modelById.get(passportModel.eventModelId);
          const photo = modelPhoto(model, passport.brandName, passportModel.displayName);
          const selected = progress.favoriteModelId === passportModel.eventModelId;
          const modelName = fairPassportDisplayName(passport.brandName, passportModel.displayName);
          const percent = percentFor(passportModel.eventModelId);
          const label = fmt(dict.favoriteSelectAria, { model: modelName });
          return (
            <button
              type="button"
              key={passportModel.eventModelId}
              aria-pressed={selected}
              aria-label={publicResult ? `${label}. ${fmt(dict.favoritePercentAria, { model: modelName, percent })}` : label}
              disabled={pending !== null}
              onClick={() => void choose(passportModel.eventModelId)}
            >
              <span className={styles.favoriteVisual}>
                {photo ? <Image fill sizes="160px" src={photo} alt="" /> : <CarFront aria-hidden="true" />}
                {leaders.includes(passportModel.eventModelId) ? <span className={styles.crowdPick}>{dict.favoriteCrowdPick}</span> : null}
              </span>
              <span className={styles.favoriteName}>{modelName}</span>
              {publicResult ? (
                <span className={styles.favoriteResult} data-result-for={passportModel.eventModelId} aria-hidden="true">
                  <span className={styles.favoriteResultTrack}><span data-result-fill className={styles.favoriteResultFill} /></span>
                  <strong data-result-count>{percent}%</strong>
                </span>
              ) : null}
              {selected ? <Check aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {message ? <p className={message === "error" ? styles.errorText : styles.savedText} role={message === "error" ? "alert" : "status"}>{message === "error" ? dict.favoriteError : dict.favoriteSaved}</p> : null}
      {result?.state === "waiting_for_minimum" ? <p className={styles.resultsSoon} role="status">{dict.favoriteResultsSoon}</p> : null}
    </section>
  );
}

function PassportDetail({
  event,
  passport,
  state,
  modelById,
  unreadIds,
  dict,
  onProgress,
  onUnlocked,
  devTools,
  devThreshold,
  focusModelSlug,
  loaded,
}: {
  event: EventView;
  passport: FairPassportCatalogEntry;
  state: FairPassportState;
  modelById: Map<string, FairPublicModel>;
  unreadIds: string[];
  dict: FairPassportDict;
  onProgress: (next: FairPassportProgress) => void;
  onUnlocked: (modelId: string) => void;
  devTools: boolean;
  devThreshold: DevFavoriteThreshold;
  focusModelSlug?: string;
  loaded: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const timersRef = useRef<number[]>([]);
  const progress = progressFor(state, passport);
  const brand = cleanLabel(passport.brandName);
  const themeClass = fairEventThemeClass(event.publicSlug);
  const stamped = useMemo(() => new Set(progress.stampedModelIds), [progress.stampedModelIds]);
  const readyIds = useMemo(() => new Set(unreadIds.filter((id) => stamped.has(id))), [unreadIds, stamped]);
  // Cards unlocked in this view keep their unlock component so the finishing
  // animation ("Otključano" label, accent) plays out after they settle.
  const [sessionUnlocked, setSessionUnlocked] = useState<ReadonlySet<string>>(() => new Set());
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [finaleOpen, setFinaleOpen] = useState(false);
  const [liveText, setLiveText] = useState("");
  const activeId = focusCardId(passport.models, readyIds, focusModelSlug, preferredId);
  const dots = passportDotCounts(progress.stampedModelIds, [...readyIds]);
  const previousFilledRef = useRef(dots.filled);
  const focusHandledRef = useRef(false);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // The header dot of a freshly unlocked stamp fills and pops.
  useEffect(() => {
    const previous = previousFilledRef.current;
    previousFilledRef.current = dots.filled;
    if (dots.filled <= previous || prefersReducedMotion()) return;
    const dot = rootRef.current?.querySelector<HTMLElement>(`[data-passport-header] [data-dot="${dots.filled - 1}"]`);
    if (!dot) return;
    dot.animate([{ transform: "scale(.4)" }, { transform: "scale(1.55)", offset: 0.45 }, { transform: "scale(1)" }], { duration: 620, easing: EASE_OUT });
    const ring = document.createElement("span");
    ring.className = styles.dotRing;
    dot.appendChild(ring);
    ring.animate([{ opacity: 0.9, transform: "scale(1)" }, { opacity: 0, transform: "scale(2.6)" }], { duration: 620, easing: "ease-out" }).onfinish = () => ring.remove();
  }, [dots.filled]);

  // ?focus=<modelSlug>: bring that card into view and mark it briefly.
  useEffect(() => {
    if (!loaded || !focusModelSlug || focusHandledRef.current) return;
    const target = passport.models.find((model) => model.slug === focusModelSlug);
    const card = target
      ? rootRef.current?.querySelector<HTMLElement>(`[data-passport-model="${CSS.escape(target.eventModelId)}"]`)
      : null;
    if (!card) return;
    focusHandledRef.current = true;
    const reduced = prefersReducedMotion();
    card.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    if (!reduced) {
      card.animate(
        [{ transform: "scale(.96)", opacity: 0.6 }, { transform: "scale(1.015)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }],
        { duration: 650, delay: 200, easing: EASE_OUT },
      );
      card.querySelector<HTMLElement>("[data-card-flash]")?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1400, delay: 200, easing: "ease-out" });
    }
    let fired = false;
    const timer = window.setTimeout(() => {
      fired = true;
      card.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      if (!fired) focusHandledRef.current = false;
    };
  }, [loaded, focusModelSlug, passport.models]);

  const runFinale = useCallback(() => {
    const reduced = prefersReducedMotion();
    fairHaptic([25, 70, 25, 70, 25, 70]);
    if (reduced) {
      setFinaleOpen(true);
      return;
    }
    const root = rootRef.current;
    root?.querySelectorAll<HTMLElement>("[data-passport-model]").forEach((card, index) => {
      card.querySelector<HTMLElement>("[data-card-flash]")?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 700, delay: index * 140, easing: "ease-out" });
      card.querySelector<HTMLElement>("[data-card-sweep]")?.animate(
        [{ opacity: 1, transform: "translateX(-110%)" }, { opacity: 1, transform: "translateX(110%)" }],
        { duration: 700, delay: index * 140, easing: "cubic-bezier(.5,0,.2,1)" },
      );
    });
    root?.querySelector<HTMLElement>("[data-head-sweep]")?.animate(
      [{ opacity: 1, transform: "translateX(-100%)" }, { opacity: 1, transform: "translateX(100%)" }],
      { duration: 900, delay: 300, easing: "cubic-bezier(.5,0,.2,1)" },
    );
    timersRef.current.push(window.setTimeout(() => setFinaleOpen(true), 900));
  }, []);

  const handleUnlocked = useCallback((modelId: string) => {
    const model = passport.models.find((entry) => entry.eventModelId === modelId);
    setSessionUnlocked((current) => new Set([...current, modelId]));
    setPreferredId(null);
    onUnlocked(modelId);
    if (model) setLiveText(fmt(dict.unlockedStatus, { brand, model: fairPassportDisplayName(passport.brandName, model.displayName) }));
    const remaining = [...readyIds].filter((id) => id !== modelId);
    if (progress.completed && remaining.length === 0) {
      timersRef.current.push(window.setTimeout(runFinale, prefersReducedMotion() ? 200 : 450));
    }
  }, [brand, dict, onUnlocked, passport.brandName, passport.models, progress.completed, readyIds, runFinale]);

  const pickFavorite = useCallback(() => {
    setFinaleOpen(false);
    window.requestAnimationFrame(() => {
      const section = document.getElementById("passport-favorite");
      section?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      section?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
  }, []);

  const closeFinale = useCallback(() => setFinaleOpen(false), []);

  const mapLocation = passport.standMapLocationIds[0];
  const mapHref = mapLocation
    ? `/sajam/${event.publicSlug}?stand=${encodeURIComponent(mapLocation)}`
    : `/sajam/${event.publicSlug}`;
  const presentation = brandPresentation(passport.brandName);
  const thumbs = passport.models.map((passportModel) => ({
    id: passportModel.eventModelId,
    name: fairPassportDisplayName(passport.brandName, passportModel.displayName),
    photo: modelPhoto(modelById.get(passportModel.eventModelId), passport.brandName, passportModel.displayName),
  }));

  return (
    <main className={styles.detailMain} ref={rootRef}>
      <section data-passport-header className={`${styles.detailHeading}${presentation?.backdropUrl ? ` ${styles.detailHeadingPhoto}` : ""}`}>
        {presentation?.backdropUrl ? (
          <Image
            className={styles.detailHeadingBackdrop}
            fill
            sizes="(max-width: 620px) 100vw, 560px"
            src={presentation.backdropUrl}
            alt=""
            preload
          />
        ) : null}
        {presentation?.backdropUrl ? <span className={styles.detailHeadingShade} aria-hidden="true" /> : null}
        <span data-head-sweep className={styles.headSweep} aria-hidden="true" />
        <Link prefetch={false} href={`/sajam/${event.publicSlug}/pasosi`} aria-label={dict.backToPassports} className={styles.backButton}>
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className={styles.brandIdentity}>
          <BrandLogo passport={passport} large onBackdrop={Boolean(presentation?.backdropUrl)} />
          <h1>{brand}</h1>
          <ProgressDots
            count={progress.requiredCount}
            filled={dots.filled}
            pending={dots.pending}
            label={dotsLabel(dict, brand, progress.requiredCount, dots.filled, dots.pending)}
          />
        </div>
      </section>

      <section
        className={styles.modelStack}
        data-spotlight={readyIds.size > 0 ? "" : undefined}
        aria-label={fmt(dict.brandPassportTitle, { brand })}
      >
        {passport.models.map((passportModel, index) => {
          const model = modelById.get(passportModel.eventModelId);
          const photo = modelPhoto(model, passport.brandName, passportModel.displayName);
          const collected = stamped.has(passportModel.eventModelId);
          const modelName = fairPassportDisplayName(passport.brandName, passportModel.displayName);
          if (collected && (readyIds.has(passportModel.eventModelId) || sessionUnlocked.has(passportModel.eventModelId))) {
            return (
              <PassportUnlockCard
                key={passportModel.eventModelId}
                modelId={passportModel.eventModelId}
                modelName={modelName}
                brand={brand}
                photo={photo}
                preload={index === 0}
                active={activeId === passportModel.eventModelId}
                dict={dict}
                onActivate={setPreferredId}
                onUnlocked={handleUnlocked}
              />
            );
          }
          const content = (
            <>
              <span className={styles.modelMedia}>
                {photo ? (
                  <Image
                    fill
                    sizes="(max-width: 620px) 100vw, 560px"
                    src={photo}
                    alt=""
                    preload={index === 0}
                    className={styles.modelPhoto}
                  />
                ) : (
                  <CarFront className={styles.modelFallback} aria-hidden="true" />
                )}
              </span>
              <span className={styles.modelTextGradient} aria-hidden="true" />
              {!collected ? <span className={styles.lockedShade} aria-hidden="true" /> : null}
              <span data-card-sweep className={styles.cardSweep} aria-hidden="true" />
              <span data-card-flash className={styles.cardFlash} aria-hidden="true" />
              <span className={styles.modelAccent} aria-hidden="true" />
              <strong>{modelName}</strong>
              {!collected ? (
                <span className={styles.lockState}><LockKeyhole aria-hidden="true" /></span>
              ) : null}
              {!collected ? <span className={styles.mapHint}><MapPin aria-hidden="true" />{dict.findOnMap}</span> : null}
            </>
          );
          return collected ? (
            <article
              key={passportModel.eventModelId}
              className={`${styles.modelCard} ${styles.modelCardCollected}`}
              data-passport-model={passportModel.eventModelId}
              aria-label={fmt(dict.modelUnlockedAria, { model: modelName })}
            >
              {content}
            </article>
          ) : (
            <Link
              key={passportModel.eventModelId}
              prefetch={false}
              href={mapHref}
              className={`${styles.modelCard} ${styles.modelCardLocked}`}
              data-passport-model={passportModel.eventModelId}
              aria-label={fmt(dict.modelLockedAria, { model: modelName })}
            >
              {content}
            </Link>
          );
        })}
      </section>

      {readyIds.size > 0 ? <p className={styles.holdHelper}>{dict.holdHelper}</p> : null}
      <span className={styles.srOnly} aria-live="polite">{liveText}</span>
      {progress.completed && readyIds.size === 0 ? (
        <FavoritePicker
          passport={passport}
          progress={progress}
          modelById={modelById}
          dict={dict}
          onProgress={onProgress}
          devTools={devTools}
          devThreshold={devThreshold}
        />
      ) : null}
      {finaleOpen ? (
        <PassportFinale
          brand={brand}
          seal={passportBrandSealTexts(themeClass, brand, dict)}
          sealLabel={fmt(dict.finaleSealAria, { brand, event: cleanLabel(event.title) })}
          thumbs={thumbs}
          dict={dict}
          onPickFavorite={pickFavorite}
          onLater={closeFinale}
        />
      ) : null}
    </main>
  );
}

function NewStampPreview({
  event,
  passport,
  modelById,
  dict,
  run,
}: {
  event: EventView;
  passport: FairPassportCatalogEntry;
  modelById: Map<string, FairPublicModel>;
  dict: FairPassportDict;
  run: number;
}) {
  const [dismissedRun, setDismissedRun] = useState(0);
  const first = passport.models[0];
  if (!first || run === 0) return null;
  const model = modelById.get(first.eventModelId);
  const photo = modelPhoto(model, passport.brandName, first.displayName);
  // Mirrors the real Advanced model hero at 390×844 (366×287, chat-head 58 px
  // at 13/13) with the model page's own global classes, outside the DEV
  // panel's button styles.
  return (
    <div className={styles.devPreviewFrame}>
      <section className="fair-model-hero" data-new-stamp-preview style={{ height: 287 }}>
        {photo ? <Image src={photo} alt="" fill sizes="366px" className="fair-model-hero__image" /> : null}
        <div className="fair-model-hero__scrim" aria-hidden="true" />
        <div className="fair-model-identity">
          <span>{cleanLabel(passport.brandName)}</span>
          <h1>{fairPassportDisplayName(passport.brandName, first.displayName)}</h1>
          <p>{model?.priceText ?? ""}</p>
        </div>
        <span
          aria-hidden="true"
          style={{ position: "absolute", top: 13, right: 13, width: 58, height: 58, borderRadius: "50%", background: "var(--fair-ink)", boxShadow: "0 10px 24px rgb(0 0 0 / .32), 0 0 0 3px rgb(255 255 255 / .9)" }}
        />
        {dismissedRun === run ? null : (
          <NewStampCard
            key={run}
            brandName={passport.brandName}
            brandSlug={fairPassportBrandSlug(passport.brandName)}
            modelSlug={first.slug}
            eventSlug={event.publicSlug}
            onDismiss={() => setDismissedRun(run)}
            dict={dict}
          />
        )}
      </section>
    </div>
  );
}

function PassportDevPanel({
  event,
  passport,
  progress,
  modelById,
  dict,
  favoriteThreshold,
  onStamp,
  onFavoriteThreshold,
}: {
  event: EventView;
  passport: FairPassportCatalogEntry;
  progress: FairPassportProgress;
  modelById: Map<string, FairPublicModel>;
  dict: FairPassportDict;
  favoriteThreshold: DevFavoriteThreshold;
  onStamp: (eventModelId: string, collected: boolean) => void;
  onFavoriteThreshold: (threshold: DevFavoriteThreshold) => void;
}) {
  const stamped = new Set(progress.stampedModelIds);
  const [previewRun, setPreviewRun] = useState(0);
  return (
    <aside id="fair-dev" className="fair-dev-panel" aria-label={dict.devPanelTitle}>
      <h2>{dict.devPanelTitle}</h2>
      <div className="fair-dev-panel__group">
        <strong>{dict.devStampGroup}</strong>
        <div>
          {passport.models.map((model) => {
            const collected = stamped.has(model.eventModelId);
            const modelName = fairPassportDisplayName(passport.brandName, model.displayName);
            return (
              <button
                type="button"
                key={model.eventModelId}
                aria-pressed={collected}
                onClick={() => onStamp(model.eventModelId, !collected)}
              >
                {fmt(collected ? dict.devRemoveStamp : dict.devAddStamp, { model: modelName })}
              </button>
            );
          })}
        </div>
      </div>
      <div className="fair-dev-panel__group">
        <strong>{dict.devFavoriteResults}</strong>
        <div>
          {(["below", "public"] as const).map((threshold) => (
            <button
              type="button"
              key={threshold}
              aria-pressed={favoriteThreshold === threshold}
              onClick={() => onFavoriteThreshold(threshold)}
            >
              {threshold === "below" ? dict.devFavoriteBelow : dict.devFavoritePublic}
            </button>
          ))}
        </div>
      </div>
      <div className="fair-dev-panel__group">
        <strong>{dict.devNewStampPreview}</strong>
        <div>
          <button type="button" onClick={() => setPreviewRun((value) => value + 1)}>
            {dict.devNewStampReplay}
          </button>
        </div>
      </div>
      <NewStampPreview event={event} passport={passport} modelById={modelById} dict={dict} run={previewRun} />
    </aside>
  );
}

export function FairPassportExperience({
  event,
  catalog,
  models,
  selectedPassportId,
  focusModelSlug,
  dict,
  devTools = false,
  showDevEntry = false,
}: {
  event: EventView;
  catalog: FairPassportCatalogEntry[];
  models: FairPublicModel[];
  selectedPassportId?: string;
  /** `?focus=<modelSlug>` deep link from the new-stamp card. */
  focusModelSlug?: string;
  dict: FairPassportDict;
  devTools?: boolean;
  showDevEntry?: boolean;
}) {
  const stateCacheKey = passportCacheKey(event);
  const cachedState = readCachedPassportState(event);
  const [state, setState] = useState<FairPassportState>(
    () => cachedState ?? { eventId: event.id, catalog, progress: [] },
  );
  const [loadState, setLoadState] = useState<LoadState>(cachedState ? "ready" : "loading");
  const [retryKey, setRetryKey] = useState(0);
  const [unread, setUnread] = useState<Record<string, string[]>>({});
  const [devThreshold, setDevThreshold] = useState<DevFavoriteThreshold>("public");
  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fair/passport", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventSlug: event.dataSlug }),
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as { ok: boolean; value?: FairPassportState | null };
        if (!response.ok || !body.ok || !body.value) throw new Error("passport_failed");
        if (cancelled) return;
        const nextState = showDevEntry
          ? applyDevPassportStamps(window.localStorage, body.value)
          : body.value;
        const nextUnread: Record<string, string[]> = {};
        for (const progress of nextState.progress) {
          nextUnread[progress.passportId] = unreadPassportModelIds(
            window.localStorage,
            nextState.eventId,
            progress.passportId,
            progress.stampedModelIds,
          );
        }
        setState(cachePassportState(stateCacheKey, nextState));
        setUnread(nextUnread);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => { cancelled = true; };
  }, [event.dataSlug, retryKey, showDevEntry, stateCacheKey]);

  function updateProgress(next: FairPassportProgress) {
    setState((current) => cachePassportState(stateCacheKey, {
      ...current,
      progress: [...current.progress.filter((row) => row.passportId !== next.passportId), next],
    }));
  }

  // A stamp counts as seen only after its hold-to-unlock finished.
  function markUnlocked(passportId: string, modelId: string) {
    markPassportModelsSeen(window.localStorage, event.id, passportId, [modelId]);
    window.dispatchEvent(new Event(FAIR_PASSPORT_VISIT_CHANGE_EVENT));
    setUnread((current) => ({
      ...current,
      [passportId]: (current[passportId] ?? []).filter((id) => id !== modelId),
    }));
  }

  function updateDevStamp(passport: FairPassportCatalogEntry, eventModelId: string, collected: boolean) {
    const current = progressFor(state, passport);
    const next = devPassportProgressWithStamp(current, eventModelId, collected);
    if (!writeDevPassportStampIds(window.localStorage, event.id, passport.passportId, next.stampedModelIds)) return;
    forgetPassportModelsSeen(window.localStorage, event.id, passport.passportId, [eventModelId]);
    updateProgress(next);
    setUnread((value) => ({
      ...value,
      [passport.passportId]: collected
        ? [...new Set([...(value[passport.passportId] ?? []), eventModelId])]
        : (value[passport.passportId] ?? []).filter((modelId) => modelId !== eventModelId),
    }));
  }

  function updateDevThreshold(passport: FairPassportCatalogEntry, threshold: DevFavoriteThreshold) {
    setDevThreshold(threshold);
    const current = progressFor(state, passport);
    if (!current.favoriteModelId) return;
    updateProgress({
      ...current,
      favoriteResult: devFavoriteResult(passport.models.map((model) => model.eventModelId), current.favoriteModelId, threshold),
    });
  }

  const selected = selectedPassportId
    ? state.catalog.find((passport) => passport.passportId === selectedPassportId)
    : undefined;

  return (
    <div className={styles.page} data-passport-load={loadState}>
      {loadState === "error" ? (
        <div className={styles.errorBanner} role="status">
          <span>{dict.loadError}</span>
          <button type="button" onClick={() => { setLoadState("loading"); setRetryKey((value) => value + 1); }}>
            <RotateCcw aria-hidden="true" />{dict.retry}
          </button>
        </div>
      ) : null}
      {loadState === "loading" ? <div className={styles.loadingLine} aria-label={dict.loading} /> : null}
      {selected ? (
        <PassportDetail
          key={`${selected.passportId}:${progressFor(state, selected).stampedModelIds.join("|")}`}
          event={event}
          passport={selected}
          state={state}
          modelById={modelById}
          unreadIds={unread[selected.passportId] ?? []}
          dict={dict}
          onProgress={updateProgress}
          onUnlocked={(modelId) => markUnlocked(selected.passportId, modelId)}
          devTools={devTools}
          devThreshold={devThreshold}
          focusModelSlug={focusModelSlug}
          loaded={loadState === "ready"}
        />
      ) : (
        <Overview event={event} state={state} unread={unread} dict={dict} />
      )}
      {showDevEntry ? (
        <footer className="fair-footer">
          <span>{dict.poweredBy}</span>
          <Link
            href={devTools ? `/sajam/${event.publicSlug}/pasosi${selected ? `/${fairPassportBrandSlug(selected.brandName)}` : ""}` : `?dev=1#fair-dev`}
            scroll={false}
            className="fair-dev-entry"
          >
            {dict.devLink}
          </Link>
        </footer>
      ) : null}
      {devTools && selected ? (
        <PassportDevPanel
          event={event}
          passport={selected}
          progress={progressFor(state, selected)}
          modelById={modelById}
          dict={dict}
          favoriteThreshold={devThreshold}
          onStamp={(eventModelId, collected) => updateDevStamp(selected, eventModelId, collected)}
          onFavoriteThreshold={(threshold) => updateDevThreshold(selected, threshold)}
        />
      ) : null}
    </div>
  );
}
