"use client";

import gsap from "gsap";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CarFront, Check, LockKeyhole, MapPin, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  FairPassportCatalogEntry,
  FairPassportProgress,
  FairPassportState,
  FairPublicModel,
} from "@/lib/fair-contract";
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
import { fairPassportBrandSlug, fairPassportDisplayName } from "@/lib/fair-passport";
import { fmt } from "@/lib/i18n/format";
import type { FairPassportDict } from "@/lib/i18n/types";
import { FairBrandMark } from "../garage/fair-brand-mark";
import styles from "./fair-passport.module.css";

type EventView = {
  id: string;
  publicSlug: string;
  dataSlug: string;
  title: string;
};

type LoadState = "loading" | "ready" | "error";

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

function EventSeal({ title }: { title: string }) {
  const cleaned = cleanLabel(title).replace(/2026/gi, "").trim();
  return (
    <div className={styles.eventSeal} aria-label={`${cleaned} 2026`}>
      <span className={styles.eventSealIcon} aria-hidden="true">↯</span>
      <span>{cleaned}</span>
      <strong>2026</strong>
    </div>
  );
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
  label,
}: {
  count: number;
  filled: number;
  label: string;
}) {
  return (
    <span className={styles.progressDots} role="img" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={index < filled ? styles.progressDotFilled : undefined} />
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
  return (
    <main className={styles.main}>
      <section className={styles.overviewHeading}>
        <div>
          <h1>{dict.passportsNav}</h1>
          <span>{dict.overviewIntro}</span>
        </div>
        <EventSeal title={event.title} />
      </section>

      {state.catalog.length === 0 ? (
        <section className={styles.empty}>
          <Sparkles aria-hidden="true" />
          <h2>{dict.emptyTitle}</h2>
          <p>{dict.emptyBody}</p>
        </section>
      ) : (
        <section className={styles.passportGrid} aria-label={dict.overviewTitle}>
          {state.catalog.map((passport, index) => {
            const progress = progressFor(state, passport);
            const brand = cleanLabel(passport.brandName);
            const presentation = brandPresentation(passport.brandName);
            const hasNew = (unread[passport.passportId]?.length ?? 0) > 0;
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
                  {hasNew ? <span className={styles.newBadge}>{dict.newStamp}</span> : null}
                </span>
                <strong>{brand}</strong>
                <ProgressDots
                  count={progress.requiredCount}
                  filled={progress.stampedCount}
                  label={fmt(dict.progressAria, {
                    brand,
                    stamped: progress.stampedCount,
                    required: progress.requiredCount,
                  })}
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
}: {
  passport: FairPassportCatalogEntry;
  progress: FairPassportProgress;
  modelById: Map<string, FairPublicModel>;
  dict: FairPassportDict;
  onProgress: (next: FairPassportProgress) => void;
  devTools: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<"saved" | "error" | null>(null);

  async function choose(eventModelId: string) {
    if (pending) return;
    setPending(eventModelId);
    setMessage(null);
    if (devTools) {
      onProgress({ ...progress, favoriteModelId: eventModelId });
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
    <section className={styles.favoriteSection}>
      <span className={styles.completionPill}><Check aria-hidden="true" />{dict.completedTitle}</span>
      <h2>{dict.favoriteTitle}</h2>
      <p>{dict.favoriteIntro}</p>
      <div className={styles.favoriteGrid}>
        {passport.models.map((passportModel) => {
          const model = modelById.get(passportModel.eventModelId);
          const photo = modelPhoto(model, passport.brandName, passportModel.displayName);
          const selected = progress.favoriteModelId === passportModel.eventModelId;
          const modelName = fairPassportDisplayName(passport.brandName, passportModel.displayName);
          return (
            <button
              type="button"
              key={passportModel.eventModelId}
              aria-pressed={selected}
              aria-label={fmt(dict.favoriteSelectAria, { model: modelName })}
              disabled={pending !== null}
              onClick={() => void choose(passportModel.eventModelId)}
            >
              <span className={styles.favoriteVisual}>
                {photo ? <Image fill sizes="160px" src={photo} alt="" /> : <CarFront aria-hidden="true" />}
              </span>
              <span>{modelName}</span>
              {selected ? <Check aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {message ? <p className={message === "error" ? styles.errorText : styles.savedText} role={message === "error" ? "alert" : "status"}>{message === "error" ? dict.favoriteError : dict.favoriteSaved}</p> : null}
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
  onRevealComplete,
  devTools,
}: {
  event: EventView;
  passport: FairPassportCatalogEntry;
  state: FairPassportState;
  modelById: Map<string, FairPublicModel>;
  unreadIds: string[];
  dict: FairPassportDict;
  onProgress: (next: FairPassportProgress) => void;
  onRevealComplete: (ids: string[]) => void;
  devTools: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const revealCompleteRef = useRef(onRevealComplete);
  const progress = progressFor(state, passport);
  const stamped = useMemo(() => new Set(progress.stampedModelIds), [progress.stampedModelIds]);
  const pendingReveal = useMemo(() => new Set(unreadIds), [unreadIds]);

  useEffect(() => {
    revealCompleteRef.current = onRevealComplete;
  }, [onRevealComplete]);

  useLayoutEffect(() => {
    if (unreadIds.length === 0 || !rootRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      revealCompleteRef.current(unreadIds);
      return;
    }
    navigator.vibrate?.([20, 34, 32]);
    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => revealCompleteRef.current(unreadIds),
      });
      unreadIds.forEach((modelId, index) => {
        const card = rootRef.current?.querySelector<HTMLElement>(`[data-passport-model="${CSS.escape(modelId)}"]`);
        if (!card) return;
        const shade = card.querySelector<HTMLElement>(`[data-passport-shade]`);
        const lock = card.querySelector<HTMLElement>(`[data-passport-lock]`);
        const image = card.querySelector<HTMLElement>(`[data-passport-image]`);
        const accent = card.querySelector<HTMLElement>(`[data-passport-accent]`);
        const at = index * 0.34;
        timeline
          .fromTo(card, { scale: 1 }, { scale: 1.014, duration: 0.2, yoyo: true, repeat: 1 }, at)
          .to(lock, { autoAlpha: 0, y: -20, rotate: -16, scale: 0.72, duration: 0.34 }, at + 0.05)
          .to(shade, { autoAlpha: 0, clipPath: "inset(0 0 0 100%)", duration: 0.72, ease: "power2.inOut" }, at + 0.08)
          .to(image, { filter: "grayscale(0%) brightness(1)", duration: 0.72 }, at + 0.08)
          .fromTo(accent, { scaleY: 0.05 }, { scaleY: 1, duration: 0.5 }, at + 0.16);
      });
    }, rootRef);
    return () => context.revert();
  }, [unreadIds]);

  const mapLocation = passport.standMapLocationIds[0];
  const mapHref = mapLocation
    ? `/sajam/${event.publicSlug}?stand=${encodeURIComponent(mapLocation)}`
    : `/sajam/${event.publicSlug}`;
  const presentation = brandPresentation(passport.brandName);

  return (
    <main className={styles.detailMain} ref={rootRef}>
      <section className={`${styles.detailHeading}${presentation?.backdropUrl ? ` ${styles.detailHeadingPhoto}` : ""}`}>
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
        <Link prefetch={false} href={`/sajam/${event.publicSlug}/pasosi`} aria-label={dict.backToPassports} className={styles.backButton}>
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className={styles.brandIdentity}>
          <BrandLogo passport={passport} large onBackdrop={Boolean(presentation?.backdropUrl)} />
          <h1>{cleanLabel(passport.brandName)}</h1>
          <ProgressDots
            count={progress.requiredCount}
            filled={progress.stampedCount}
            label={fmt(dict.progressAria, {
              brand: cleanLabel(passport.brandName),
              stamped: progress.stampedCount,
              required: progress.requiredCount,
            })}
          />
        </div>
      </section>

      <section className={styles.modelStack} aria-label={fmt(dict.brandPassportTitle, { brand: cleanLabel(passport.brandName) })}>
        {passport.models.map((passportModel, index) => {
          const model = modelById.get(passportModel.eventModelId);
          const photo = modelPhoto(model, passport.brandName, passportModel.displayName);
          const collected = stamped.has(passportModel.eventModelId);
          const revealing = collected && pendingReveal.has(passportModel.eventModelId);
          const modelName = fairPassportDisplayName(passport.brandName, passportModel.displayName);
          const content = (
            <>
              <span className={styles.modelMedia}>
                {photo ? (
                  <Image
                    data-passport-image
                    fill
                    sizes="(max-width: 620px) 100vw, 560px"
                    src={photo}
                    alt=""
                    preload={index === 0}
                    className={styles.modelPhoto}
                  />
                ) : (
                  <CarFront data-passport-image className={styles.modelFallback} aria-hidden="true" />
                )}
              </span>
              <span className={styles.modelTextGradient} aria-hidden="true" />
              {!collected || revealing ? <span data-passport-shade className={styles.lockedShade} aria-hidden="true" /> : null}
              <span data-passport-accent className={styles.modelAccent} aria-hidden="true" />
              <strong>{modelName}</strong>
              {!collected || revealing ? (
                <span data-passport-lock className={styles.lockState}><LockKeyhole aria-hidden="true" /></span>
              ) : null}
              {!collected ? <span className={styles.mapHint}><MapPin aria-hidden="true" />{dict.findOnMap}</span> : null}
            </>
          );
          return collected ? (
            <article
              key={passportModel.eventModelId}
              className={`${styles.modelCard} ${styles.modelCardCollected}${revealing ? ` ${styles.modelCardRevealing}` : ""}`}
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

      <span className={styles.srOnly} aria-live="polite">{unreadIds.length === 0 ? "" : dict.revealStatus}</span>
      {progress.completed ? (
        <FavoritePicker passport={passport} progress={progress} modelById={modelById} dict={dict} onProgress={onProgress} devTools={devTools} />
      ) : null}
    </main>
  );
}

function PassportDevPanel({
  passport,
  progress,
  dict,
  onStamp,
}: {
  passport: FairPassportCatalogEntry;
  progress: FairPassportProgress;
  dict: FairPassportDict;
  onStamp: (eventModelId: string, collected: boolean) => void;
}) {
  const stamped = new Set(progress.stampedModelIds);
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
    </aside>
  );
}

export function FairPassportExperience({
  event,
  catalog,
  models,
  selectedPassportId,
  dict,
  devTools = false,
  showDevEntry = false,
}: {
  event: EventView;
  catalog: FairPassportCatalogEntry[];
  models: FairPublicModel[];
  selectedPassportId?: string;
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

  function completeReveal(passportId: string, modelIds: string[]) {
    if (modelIds.length === 0) return;
    markPassportModelsSeen(window.localStorage, event.id, passportId, modelIds);
    window.dispatchEvent(new Event(FAIR_PASSPORT_VISIT_CHANGE_EVENT));
    setUnread((current) => ({ ...current, [passportId]: [] }));
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
          onRevealComplete={(ids) => completeReveal(selected.passportId, ids)}
          devTools={devTools}
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
          passport={selected}
          progress={progressFor(state, selected)}
          dict={dict}
          onStamp={(eventModelId, collected) => updateDevStamp(selected, eventModelId, collected)}
        />
      ) : null}
    </div>
  );
}
