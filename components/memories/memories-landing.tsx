"use client";

// TASK-17 — the guest landing (/m/[code]): the screen behind the card.
//
// The reader of this screen is a guest at a table in a dark room, one hand on
// a drink, ten seconds of patience. Every branch below exists to make the next
// thing obvious without instruction: the only bright warm object on the screen
// is the one control there is, and every other state replaces it with one
// plain sentence.
//
// HONESTY CONTRACT (rule 2 of the brief): "Sačuvano" renders exclusively for
// items whose TASK-16 queue state is `ready`, and the queue (lib/memories-
// client/queue.ts) reaches `ready` only from the server's own word — a 200
// from POST /m/[code]/process (the Convex commit transaction) or an
// `alreadyReady` answer from renewUploadUrl. No optimistic path exists there,
// and none is added here: this file maps states to words, it never invents
// them. The saved grid below renders from myPhotosView, which only returns
// committed rows.
//
// NO NEW UPLOAD LOGIC (rule 3): the queue, backend, retry, release, and
// lifecycle kicks are consumed exactly as TASK-16 shipped them — this
// component instantiates MemoriesUploadQueue with createUploadBackend and
// renders its snapshots, the same wiring as the dev harness.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Camera, Check, ChevronRight, Image as ImageGlyph } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  createUploadBackend,
  MemoriesUploadQueue,
  type QueueSnapshot,
  type UploadItemSnapshot,
} from "@/lib/memories-client";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import { consentSr } from "@/lib/i18n/sr/consent";
import { formatBelgradeDate, formatBelgradeTime } from "@/lib/venue-calendar";
import type { GuestSpaceView, MyPhotosView } from "./memories-view";
import {
  MemoriesFooterBrand,
  MemoriesMasthead,
  MemoriesShell,
  MemoriesStateHero,
} from "./memories-chrome";
import { GuestPhotoGrid } from "./guest-photo-grid";
import styles from "./memories.module.css";

const MIRROR_PREFIX = "scanme_guest_mirror_";

// -----------------------------------------------------------------------------
// Identity mirror (RFC §2.6): the HttpOnly cookie is the identity; localStorage
// keeps a recovery copy because a re-scan of the table card OVERWRITES the
// cookie with a freshly minted guest. On load, an older mirrored identity wins:
// it is the one whose photos and quota belong to this device's person. One
// restore attempt per page load — success refreshes the server render.
// -----------------------------------------------------------------------------
function useGuestIdentityMirror(code: string, cookieValue: string | null) {
  const router = useRouter();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    const key = MIRROR_PREFIX + code;
    let mirror: string | null = null;
    try {
      mirror = window.localStorage.getItem(key);
    } catch {
      return; // No storage — the cookie identity (or none) stands as-is.
    }

    if (cookieValue && (!mirror || mirror === cookieValue)) {
      try {
        window.localStorage.setItem(key, cookieValue);
      } catch {
        // Mirror unwritable: recovery is lost, the session still works.
      }
      return;
    }
    if (!mirror) return;

    // Either no cookie survived, or the cookie is a newer identity than the
    // mirror (a re-scan) — restore the mirrored one.
    attemptedRef.current = true;
    let cancelled = false;
    fetch(`/api/m/${encodeURIComponent(code)}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: mirror }),
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          router.refresh();
        } else if (cookieValue) {
          // The mirror is stale garbage; the current cookie becomes the mirror.
          try {
            window.localStorage.setItem(key, cookieValue);
          } catch {}
        } else {
          try {
            window.localStorage.removeItem(key);
          } catch {}
        }
      })
      .catch(() => {
        // Offline: leave both as they are; the next load reconciles.
      });
    return () => {
      cancelled = true;
    };
  }, [code, cookieValue, router]);
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useOnline() {
  // Server snapshot is `true`: the offline banner appears only once the
  // browser itself says the radio is down.
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

// Client clock for the one_off window POSITION only — pure UX. Admission is
// enforced by reserveUpload on the server regardless of what this renders.
// Seeded with the server render's clock so hydration matches; the interval
// (and a resume kick — a phone unlocked hours later must not show a stale
// "not started yet") move it forward.
function useTicker(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

type LandingState =
  | "notActivated"
  | "paused"
  | "closed"
  | "before"
  | "noIdentity"
  | "open";

function deriveState(
  view: GuestSpaceView,
  hasIdentity: boolean,
  now: number,
): LandingState {
  if (!view.entitled) return "notActivated";
  if (view.status === "paused") return "paused";
  if (view.status !== "active") return "closed"; // closed | archived
  if (view.mode === "one_off") {
    if (view.windowStartAt !== null && now < view.windowStartAt) {
      return "before";
    }
    if (view.windowEndAt !== null && now > view.windowEndAt) return "closed";
    if (!view.session) return "before"; // activation pending
    if (view.session.status === "closed") return "closed";
  }
  if (!hasIdentity) return "noIdentity";
  return "open";
}

function pluralLine(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const category = srPluralCategory(count);
  const template = category === "one" ? one : category === "few" ? few : many;
  return fmt(template, { count });
}

// -----------------------------------------------------------------------------
// Consent (RFC §2.10, rule 1 of the brief): above the upload control, on the
// first screen, always rendered — never a link, footer, or dismissable modal.
// The full text is a disclosure directly underneath for whoever wants it.
// -----------------------------------------------------------------------------
function ConsentNotice({ retentionDays }: { retentionDays: number }) {
  return (
    <section className={styles.consent}>
      <p className={styles.consentText}>
        {consentSr.inlineWho} {consentSr.inlineArchive}{" "}
        {fmt(consentSr.inlineRetention, { days: retentionDays })}{" "}
        <strong>{consentSr.inlineAct}</strong>
      </p>
      <details className={styles.consentMore}>
        <summary>{consentSr.moreLabel}</summary>
        <div className={styles.consentFull}>
          <p>{consentSr.fullWho}</p>
          <p>{consentSr.fullVisibility}</p>
          <p>{consentSr.fullArchive}</p>
          <p>{fmt(consentSr.fullRetention, { days: retentionDays })}</p>
          <p>{consentSr.fullDelete}</p>
          <p>{consentSr.fullCookie}</p>
        </div>
      </details>
    </section>
  );
}

// -----------------------------------------------------------------------------
// One queue item, rendered honestly from the TASK-16 machine. The state line
// is a pure mapping of (state, phase) — there is no code path from any
// non-`ready` state to the word "Sačuvano".
// -----------------------------------------------------------------------------
function itemStateLine(item: UploadItemSnapshot, online: boolean): string {
  if (item.phase === "waiting_retry") {
    return online ? dict.itemRetrying : dict.itemWaitingNetwork;
  }
  switch (item.state) {
    case "queued":
      return dict.itemQueued;
    case "uploading":
      return item.phase === "putting"
        ? fmt(dict.itemUploading, {
            percent: Math.round(item.progress * 100),
          })
        : dict.itemPreparing;
    case "processing":
      return dict.itemProcessing;
    case "ready":
      return dict.itemSaved;
    case "failed":
      return item.errorMessage ?? dict.uploadFailed;
  }
}

function QueueItemRow({
  item,
  previewUrl,
  online,
  onRetry,
  onRemove,
}: {
  item: UploadItemSnapshot;
  previewUrl: string | null;
  online: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const [previewBroken, setPreviewBroken] = useState(false);
  const active = item.state === "uploading" || item.state === "processing";
  const stateClass =
    item.state === "ready"
      ? `${styles.itemState} ${styles.itemStateSaved}`
      : item.state === "failed"
        ? `${styles.itemState} ${styles.itemStateError}`
        : styles.itemState;

  return (
    <li className={styles.item}>
      {previewUrl && !previewBroken ? (
        // Local object URL of the picked file; next/image cannot read blobs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.itemThumb}
          src={previewUrl}
          alt={dict.itemPreviewAlt}
          onError={() => setPreviewBroken(true)}
        />
      ) : (
        <span className={styles.itemThumbFallback} aria-hidden="true">
          <ImageGlyph size={22} strokeWidth={1.75} />
        </span>
      )}
      <div className={styles.itemBody}>
        <p className={stateClass}>
          {item.state === "ready" ? (
            <span className={styles.savedTick} aria-hidden="true">
              <Check size={16} strokeWidth={3} />
            </span>
          ) : null}
          {itemStateLine(item, online)}
        </p>
      </div>
      <div className={styles.itemActions}>
        {item.state === "failed" && item.canRetry ? (
          <button
            type="button"
            className={`${styles.itemButton} ${styles.itemButtonPrimary}`}
            onClick={onRetry}
          >
            {dict.itemRetryAction}
          </button>
        ) : null}
        {item.state !== "ready" ? (
          <button type="button" className={styles.itemButton} onClick={onRemove}>
            {dict.itemRemoveAction}
          </button>
        ) : null}
      </div>
      {active ? (
        <div className={styles.itemProgressTrack} aria-hidden="true">
          <div
            className={styles.itemProgressFill}
            style={{ width: `${Math.round(item.progress * 100)}%` }}
          />
        </div>
      ) : null}
    </li>
  );
}

// -----------------------------------------------------------------------------
// The landing itself.
// -----------------------------------------------------------------------------
export function MemoriesLanding({
  code,
  guestKey,
  cookieValue,
  initialView,
  convexUrl,
  serverNow,
}: {
  code: string;
  guestKey: string | null;
  cookieValue: string | null;
  initialView: GuestSpaceView;
  convexUrl: string;
  serverNow: number;
}) {
  useGuestIdentityMirror(code, cookieValue);
  const online = useOnline();
  const now = useTicker(serverNow);

  const live = useQuery(
    api.memories.guestSpaceView,
    guestKey ? { code, guestKey } : { code },
  );
  const view = live ?? initialView;
  const photosQuery = useQuery(
    api.memories.myPhotosView,
    guestKey ? { code, guestKey } : "skip",
  );
  const photos: MyPhotosView = useMemo(
    () => photosQuery ?? [],
    [photosQuery],
  );

  // ---- The TASK-16 queue, consumed unchanged (same wiring as the harness).
  const [snapshot, setSnapshot] = useState<QueueSnapshot>({
    items: [],
    quota: null,
    hasPendingWork: false,
  });
  const queueRef = useRef<MemoriesUploadQueue | null>(null);
  useEffect(() => {
    if (!guestKey || !convexUrl) return;
    const queue = new MemoriesUploadQueue({
      backend: createUploadBackend({ code, guestKey, convexUrl }),
    });
    queueRef.current = queue;
    const unsubscribe = queue.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      queue.dispose();
      queueRef.current = null;
    };
  }, [code, guestKey, convexUrl]);

  // Local previews of picked files, so the guest sees WHICH photo each row is
  // the moment it enters the queue. State (written only in the pick handler)
  // drives rendering; the ref mirror exists solely so unmount can revoke the
  // object URLs. A night's handful of previews is not worth per-item revoking.
  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const previewsRef = useRef<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    return () => {
      for (const url of previewsRef.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const onPick = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const queue = queueRef.current;
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (!queue || files.length === 0) return;
    const added = queue.enqueue(files);
    const next = new Map(previewsRef.current);
    added.forEach((item, index) => {
      const file = files[index];
      if (!file) return;
      try {
        next.set(item.id, URL.createObjectURL(file));
      } catch {
        // No preview — the row still renders with a placeholder glyph.
      }
    });
    previewsRef.current = next;
    setPreviews(next);
    event.target.value = "";
  }, []);

  const state = deriveState(view, guestKey !== null, now);
  const remaining = view.guest?.remaining ?? 0;
  const tonightCount = view.session?.photoCount ?? 0;
  const session = view.session;
  const tonightPhotos = useMemo(
    () =>
      session && session.status === "open"
        ? photos.filter((photo) => photo.sessionId === session.id)
        : [],
    [photos, session],
  );

  // Rows whose committed photo already renders in the saved grid disappear
  // from the queue list — one honest representation per photo at any moment.
  const savedIds = useMemo(
    () => new Set(photos.map((photo) => photo.photoId as string)),
    [photos],
  );
  const queueRows = snapshot.items.filter(
    (item) =>
      !(item.state === "ready" && item.photoId && savedIds.has(item.photoId)),
  );

  const socialProof =
    tonightCount === 0
      ? dict.socialProofZero
      : pluralLine(
          tonightCount,
          dict.socialProofOne,
          dict.socialProofFew,
          dict.socialProofMany,
        );

  const quotaLine =
    remaining > 0
      ? pluralLine(
          remaining,
          dict.quotaRemainingOne,
          dict.quotaRemainingFew,
          dict.quotaRemainingMany,
        )
      : null;

  const navLinks = (
    <nav className={styles.footerNav}>
      {guestKey && state !== "noIdentity" ? (
        <Link className={styles.navLink} href={`/m/${code}/moje`}>
          {dict.myPhotosLink}
          <ChevronRight
            className={styles.navLinkArrow}
            size={20}
            aria-hidden="true"
          />
        </Link>
      ) : null}
      {view.publicGalleryEnabled ? (
        <Link className={styles.navLink} href={`/m/${code}/galerija`}>
          {dict.galleryLink}
          <ChevronRight
            className={styles.navLinkArrow}
            size={20}
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </nav>
  );

  // ---- The five sentence-states: one plain headline each, never a dead end.
  if (state !== "open") {
    const hero =
      state === "notActivated" ? (
        <MemoriesStateHero
          title={dict.stateNotActivatedTitle}
          body={dict.stateNotActivatedBody}
        />
      ) : state === "paused" ? (
        <MemoriesStateHero
          title={dict.statePausedTitle}
          body={dict.statePausedBody}
        />
      ) : state === "closed" ? (
        <MemoriesStateHero
          title={dict.stateClosedTitle}
          body={dict.stateClosedBody}
        />
      ) : state === "before" ? (
        <MemoriesStateHero
          title={dict.stateBeforeTitle}
          body={
            view.windowStartAt !== null
              ? fmt(dict.stateBeforeBody, {
                  date: formatBelgradeDate(view.windowStartAt),
                  time: formatBelgradeTime(view.windowStartAt),
                })
              : dict.stateBeforeBodyNoDate
          }
        />
      ) : (
        <MemoriesStateHero
          title={dict.stateNoIdentityTitle}
          body={dict.stateNoIdentityBody}
        />
      );

    const showPhotos =
      guestKey !== null &&
      photos.length > 0 &&
      (state === "paused" || state === "closed");

    return (
      <MemoriesShell>
        <MemoriesMasthead
          spaceName={view.spaceName}
          businessName={view.businessName}
          logoUrl={view.businessLogoUrl}
        />
        {hero}
        {showPhotos && guestKey ? (
          <>
            <h2 className={styles.sectionHeading}>{dict.myPhotosTitle}</h2>
            <GuestPhotoGrid
              code={code}
              guestKey={guestKey}
              photos={photos}
              canChooseVisibility={view.guestVisibilityChoice}
            />
          </>
        ) : null}
        {navLinks}
        <MemoriesFooterBrand />
      </MemoriesShell>
    );
  }

  // ---- Open (and its quota-exhausted variant).
  const quotaExhausted = view.guest !== null && remaining === 0;

  return (
    <MemoriesShell>
      {!online ? (
        <div className={styles.offlineBanner} role="status">
          <span className={styles.offlineDot} aria-hidden="true" />
          {dict.offlineBanner}
        </div>
      ) : null}
      <MemoriesMasthead
        spaceName={view.spaceName}
        businessName={view.businessName}
        logoUrl={view.businessLogoUrl}
      />
      {quotaExhausted ? (
        <MemoriesStateHero
          title={dict.stateQuotaTitle}
          body={dict.stateQuotaBody}
        />
      ) : (
        <p className={styles.tagline}>{dict.heroTagline}</p>
      )}
      <p className={styles.socialProof}>{socialProof}</p>

      {!quotaExhausted ? (
        <>
          <ConsentNotice retentionDays={view.retentionDays ?? 30} />
          <div className={styles.shutterWrap}>
            <span className={styles.shutterGlow} aria-hidden="true" />
            <button
              type="button"
              className={styles.shutter}
              onClick={() => inputRef.current?.click()}
            >
              <Camera
                className={styles.shutterIcon}
                strokeWidth={2}
                aria-hidden="true"
              />
              {remaining === 1 ? dict.addPhotoActionOne : dict.addPhotosAction}
            </button>
            <input
              ref={inputRef}
              className={styles.hiddenInput}
              type="file"
              accept="image/*"
              multiple
              onChange={onPick}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
          {quotaLine ? <p className={styles.quotaLine}>{quotaLine}</p> : null}
        </>
      ) : null}

      {queueRows.length > 0 ? (
        <ul className={`${styles.itemList} ${styles.itemListSpaced}`}>
          {queueRows.map((item) => (
            <QueueItemRow
              key={item.id}
              item={item}
              previewUrl={previews.get(item.id) ?? null}
              online={online}
              onRetry={() => queueRef.current?.retry(item.id)}
              onRemove={() => queueRef.current?.remove(item.id)}
            />
          ))}
        </ul>
      ) : null}

      {guestKey && tonightPhotos.length > 0 ? (
        <>
          <h2 className={styles.sectionHeading}>{dict.tonightHeading}</h2>
          <GuestPhotoGrid
            code={code}
            guestKey={guestKey}
            photos={tonightPhotos}
            canChooseVisibility={view.guestVisibilityChoice}
          />
        </>
      ) : null}

      {navLinks}
      <MemoriesFooterBrand />
    </MemoriesShell>
  );
}
