"use client";

import gsap from "gsap";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CarFront,
  Check,
  ChevronRight,
  GitCompareArrows,
  MapPin,
  RotateCcw,
  Trash2,
  WifiOff,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  FairPassportProgress,
  FairPassportState,
  FairSponsoredActionKind,
  FairSponsoredModelCard,
} from "@/lib/fair-contract";
import {
  FAIR_GARAGE_CHANGE_EVENT,
  FAIR_GARAGE_MODEL_CHANGE_EVENT,
  addFairGarageModel,
  createEmptyFairGarageDocument,
  getFairGaragePassportBadges,
  readFairGarage,
  removeFairGarageModel,
  saveFairGaragePassportBadge,
  updateFairGarageModelSnapshot,
  writeFairGarage,
  type FairGarageDocument,
  type FairGarageReadResult,
} from "@/lib/fair-client/garage-store";
import {
  fairGarageEventId,
  fairGarageEventTitle,
  fairGarageItemsForEvent,
  fairGarageModelView,
  fetchFairGarageModels,
  type FairGarageEventView,
  type FairGarageModelView,
} from "@/lib/fair-client/garage-view";
import { getFairRotationItem } from "@/lib/fair-client/rotation-slot";
import { fmt } from "@/lib/i18n/format";
import type { FairGarageDict } from "@/lib/i18n/types";
import styles from "./fair-garage.module.css";

type RefreshState = "idle" | "loading" | "ready" | "error";
type PassportLoad = { state: "loading" | "error" | "ready"; value: FairPassportState | null };

function emitGarageChange() {
  window.dispatchEvent(new Event(FAIR_GARAGE_MODEL_CHANGE_EVENT));
  window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
}

function eventContainsModel(document: FairGarageDocument, modelId: string) {
  return Object.values(document.events).some((items) => items.some((item) => item.modelId === modelId));
}

function removeModelEverywhere(document: FairGarageDocument, modelId: string) {
  let next = document;
  for (const eventId of Object.keys(document.events)) {
    next = removeFairGarageModel(next, eventId, modelId);
  }
  return next;
}

function subscribeGarage(onChange: (result: FairGarageReadResult) => void) {
  const refresh = () => onChange(readFairGarage(window.localStorage));
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === "scanme:fair-garage") refresh();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(FAIR_GARAGE_CHANGE_EVENT, refresh);
  window.addEventListener(FAIR_GARAGE_MODEL_CHANGE_EVENT, refresh);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(FAIR_GARAGE_CHANGE_EVENT, refresh);
    window.removeEventListener(FAIR_GARAGE_MODEL_CHANGE_EVENT, refresh);
  };
}

function GarageHeader({
  event,
  count,
  dict,
}: {
  event: FairGarageEventView;
  count: number;
  dict: FairGarageDict;
}) {
  return (
    <header className="fair-shell">
      <div className="fair-shell__inner">
        <div className="fair-event-lockup" aria-label={`${dict.umbrellaTitle}, ${fairGarageEventTitle(event)}`}>
          <span className="fair-event-lockup__mark" aria-hidden="true" />
          <span>
            <strong>{dict.umbrellaTitle}</strong>
            <small>{fairGarageEventTitle(event)}</small>
          </span>
        </div>
        <nav className="fair-shell__nav" aria-label={dict.umbrellaTitle}>
          <Link prefetch={false} href={`/sajam/${event.publicSlug}`}>
            <MapPin aria-hidden="true" />
            <span>{dict.mapNav}</span>
          </Link>
          <Link prefetch={false} href="/sajam/garaza" className="fair-garage-link" aria-current="page">
            <span className="fair-garage-icon">
              <CarFront aria-hidden="true" />
              <span className="fair-garage-badge" aria-label={fmt(dict.garageCountAria, { count })}>
                <span key={count} className="fair-garage-badge__value" aria-hidden="true">{count}</span>
              </span>
            </span>
            <span>{dict.garageNav}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function ModelVisual({ model, alt, priority = false }: { model: FairGarageModelView; alt: string; priority?: boolean }) {
  return (
    <div className={styles.modelVisual}>
      {model.photoUrl ? (
        <Image
          fill
          sizes="(max-width: 640px) 132px, 220px"
          src={model.photoUrl}
          alt={alt}
          priority={priority}
          className={styles.modelImage}
        />
      ) : (
        <div className={styles.modelPlaceholder} aria-hidden="true">
          <span>{model.brandName.slice(0, 1).toUpperCase()}</span>
          <CarFront />
        </div>
      )}
    </div>
  );
}

function GarageModelCard({
  model,
  selected,
  selectionDisabled,
  stale,
  dict,
  onSelect,
  onRemove,
  priority,
}: {
  model: FairGarageModelView;
  selected: boolean;
  selectionDisabled: boolean;
  stale: boolean;
  dict: FairGarageDict;
  onSelect: () => void;
  onRemove: () => void;
  priority?: boolean;
}) {
  const [removing, setRemoving] = useState(false);

  function remove() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return onRemove();
    setRemoving(true);
    window.setTimeout(onRemove, 220);
  }

  return (
    <article className={`${styles.modelCard}${selected ? ` ${styles.modelCardSelected}` : ""}${removing ? ` ${styles.modelCardRemoving}` : ""}`}>
      <ModelVisual model={model} priority={priority} alt={fmt(dict.modelPhotoAlt, { brand: model.brandName, model: model.displayName })} />
      <div className={styles.modelContent}>
        <div className={styles.modelTopline}>
          <span>{model.brandName}</span>
          {stale ? <small>{dict.savedSnapshot}</small> : null}
        </div>
        <h2>{model.displayName}</h2>
        {model.variant ? <p className={styles.variant}>{model.variant}</p> : null}
        <p className={styles.price}>{model.priceText}</p>
        <div className={styles.modelActions}>
          <button
            type="button"
            className={styles.compareToggle}
            aria-pressed={selected}
            disabled={!selected && selectionDisabled}
            onClick={onSelect}
          >
            <span className={styles.compareMark} aria-hidden="true">{selected ? <Check /> : null}</span>
            <span>{selected ? dict.compareSelected : dict.compareSelect}</span>
          </button>
          <Link prefetch={false} href={`/sajam/${model.eventSlug}/model/${model.modelSlug}`} className={styles.viewLink}>
            {dict.viewModel}
            <ChevronRight aria-hidden="true" />
          </Link>
          <button type="button" className={styles.removeButton} onClick={remove} aria-label={fmt(dict.removeModelAria, { model: model.displayName })}>
            <Trash2 aria-hidden="true" />
            <span>{dict.removeModel}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function PassportSection({
  event,
  load,
  document,
  dict,
  onDocument,
  onPassport,
}: {
  event: FairGarageEventView;
  load: PassportLoad;
  document: FairGarageDocument;
  dict: FairGarageDict;
  onDocument: (next: FairGarageDocument) => boolean;
  onPassport: (next: FairPassportState) => void;
}) {
  const catalog = load.value?.catalog ?? event.passportCatalog;
  const progress = load.value?.progress ?? [];
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ passportId: string; kind: "success" | "error"; text: string } | null>(null);

  if (catalog.length === 0) return null;

  async function chooseFavorite(passportId: string, eventModelId: string) {
    setPending(passportId);
    setMessage(null);
    try {
      const response = await fetch("/api/fair/passport/favorite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passportId, eventModelId }),
      });
      const body = (await response.json()) as { ok: boolean; value?: FairPassportProgress };
      if (!response.ok || !body.ok || !body.value) throw new Error("favorite_failed");
      const base = load.value ?? {
        eventId: fairGarageEventId(event),
        catalog,
        progress,
      };
      onPassport({
        ...base,
        progress: [...base.progress.filter((item) => item.passportId !== passportId), body.value],
      });
      setMessage({ passportId, kind: "success", text: dict.passportFavoriteSaved });
    } catch {
      setMessage({ passportId, kind: "error", text: dict.passportFavoriteError });
    } finally {
      setPending(null);
    }
  }

  function saveBadge(passportId: string, brandId: string, brandName: string, brandLogoUrl: string | undefined, favoriteModelId: string, savedAt: number) {
    const next = saveFairGaragePassportBadge(document, {
      eventId: fairGarageEventId(event),
      brandId,
      brandName,
      ...(brandLogoUrl ? { brandLogoUrl } : {}),
      favoriteModelId,
      savedAt,
    });
    const ok = onDocument(next);
    setMessage({
      passportId,
      kind: ok ? "success" : "error",
      text: ok ? dict.passportBadgeSaved : dict.passportBadgeError,
    });
  }

  return (
    <section className={styles.passports} aria-labelledby="fair-garage-passports">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="fair-garage-passports">{dict.passportsTitle}</h2>
          <p>{dict.passportsBody}</p>
        </div>
      </div>
      {load.state === "error" ? <p className={styles.inlineNotice}>{dict.refreshError}</p> : null}
      <div className={styles.passportGrid}>
        {catalog.map((passport) => {
          const own = progress.find((item) => item.passportId === passport.passportId);
          const stamped = own?.stampedCount ?? 0;
          const required = own?.requiredCount ?? passport.models.length;
          const completed = own?.completed ?? false;
          const favorite = own?.favoriteModelId;
          const savedBadge = getFairGaragePassportBadges(document).find(
            (badge) => badge.eventId === fairGarageEventId(event) && badge.brandId === passport.brandId,
          );
          return (
            <article className={`${styles.passportCard}${completed ? ` ${styles.passportComplete}` : ""}`} key={passport.passportId}>
              <div className={styles.passportHeader}>
                <div className={styles.brandMark}>
                  {passport.brandLogoUrl ? <Image fill sizes="44px" src={passport.brandLogoUrl} alt="" /> : <span>{passport.brandName.slice(0, 1)}</span>}
                </div>
                <div>
                  <h3>{passport.brandName}</h3>
                  <p>{fmt(dict.passportProgress, { stamped, required })}</p>
                </div>
                {completed ? <BadgeCheck aria-label={dict.passportComplete} /> : null}
              </div>
              <div className={styles.stamps} aria-label={fmt(dict.passportProgress, { stamped, required })}>
                {passport.models.map((model) => {
                  const hasStamp = own?.stampedModelIds.includes(model.eventModelId) ?? false;
                  return (
                    <span className={hasStamp ? styles.stampEarned : undefined} key={model.eventModelId} title={model.displayName}>
                      <CarFront aria-hidden="true" />
                      <span>{model.displayName}</span>
                    </span>
                  );
                })}
              </div>
              <p className={styles.passportStatus}>{completed ? dict.passportComplete : fmt(dict.passportMissing, { count: Math.max(0, required - stamped) })}</p>
              {completed ? (
                <fieldset className={styles.favoriteFieldset}>
                  <legend>{dict.passportFavoriteTitle}</legend>
                  <div>
                    {passport.models.map((model) => (
                      <button
                        type="button"
                        key={model.eventModelId}
                        aria-pressed={favorite === model.eventModelId}
                        disabled={pending === passport.passportId}
                        onClick={() => chooseFavorite(passport.passportId, model.eventModelId)}
                      >
                        {model.displayName}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {favorite ? (
                <button
                  type="button"
                  className={styles.badgeButton}
                  disabled={savedBadge?.favoriteModelId === favorite}
                  onClick={(event) => saveBadge(passport.passportId, passport.brandId, passport.brandName, passport.brandLogoUrl, favorite, Math.round(performance.timeOrigin + event.timeStamp))}
                >
                  <BadgeCheck aria-hidden="true" />
                  {savedBadge?.favoriteModelId === favorite ? dict.passportBadgeSaved : dict.passportSaveBadge}
                </button>
              ) : null}
              {pending === passport.passportId ? <p className={styles.passportMessage}>{dict.passportSaving}</p> : null}
              {message?.passportId === passport.passportId ? <p className={message.kind === "error" ? styles.errorText : styles.passportMessage} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SponsoredStrip({
  event,
  document,
  dict,
  onDocument,
}: {
  event: FairGarageEventView;
  document: FairGarageDocument;
  dict: FairGarageDict;
  onDocument: (next: FairGarageDocument) => boolean;
}) {
  const rotation = event.sponsoredRotation;
  const [now, setNow] = useState(() => Date.now());
  const [paused, setPaused] = useState(false);
  const [frozenIndex, setFrozenIndex] = useState<number | null>(null);
  const [storageError, setStorageError] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const slot = rotation
    ? getFairRotationItem(rotation.items, { epochMs: rotation.epochMs, nowMs: now, intervalMs: rotation.intervalMs })
    : null;
  const index = frozenIndex ?? slot?.slot.index ?? 0;
  const item = rotation?.items[index];
  const nextSlotAt = slot?.slot.nextSlotAt;
  const itemId = item?.eventModelId;
  const hasItem = item !== undefined;

  useEffect(() => {
    if (!rotation || paused || nextSlotAt === undefined) return;
    const delay = Math.max(80, nextSlotAt - Date.now() + 20);
    const timeout = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timeout);
  }, [nextSlotAt, paused, rotation]);

  useLayoutEffect(() => {
    if (!cardRef.current || !hasItem || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(cardRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" });
    return () => {
      tween.kill();
    };
  }, [hasItem, itemId]);

  if (!rotation || rotation.items.length === 0 || !item) return null;

  function pause() {
    setFrozenIndex(index);
    setPaused(true);
  }

  function resume() {
    setPaused(false);
    setFrozenIndex(null);
    setNow(Date.now());
  }

  function record(kind: FairSponsoredActionKind, model: FairSponsoredModelCard) {
    const requestId = crypto.randomUUID();
    void fetch("/api/fair/sponsored-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventModelId: model.eventModelId, surface: "garage", kind, requestId }),
      keepalive: true,
    }).catch(() => undefined);
  }

  function add(model: FairSponsoredModelCard) {
    pause();
    const next = addFairGarageModel(document, {
      eventId: model.eventId,
      modelId: model.eventModelId,
      lastKnown: {
        eventSlug: event.publicSlug,
        modelSlug: model.slug,
        brandName: model.brandName,
        displayName: model.displayName,
        priceText: model.priceText,
        ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}),
      },
    });
    const ok = onDocument(next);
    setStorageError(!ok);
    if (ok) record("garage_add", model);
    window.setTimeout(resume, 650);
  }

  const saved = eventContainsModel(document, item.eventModelId);
  return (
    <aside className={styles.sponsoredDock} aria-label={dict.sponsoredLabel} onPointerEnter={pause} onPointerLeave={resume} onFocusCapture={pause} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) resume(); }}>
      <div className={styles.sponsoredCard} ref={cardRef} key={item.eventModelId}>
        <div className={styles.sponsoredVisual}>
          {item.photoUrl ? <Image fill priority sizes="76px" src={item.photoUrl} alt={fmt(dict.sponsoredPhotoAlt, { brand: item.brandName, model: item.displayName })} /> : item.brandLogoUrl ? <Image fill priority sizes="76px" src={item.brandLogoUrl} alt="" className={styles.sponsoredLogo} /> : <CarFront aria-hidden="true" />}
        </div>
        <div className={styles.sponsoredCopy}>
          <span>{dict.sponsoredLabel}</span>
          <strong>{item.brandName} {item.displayName}</strong>
          <small>{item.priceText}</small>
        </div>
        <div className={styles.sponsoredActions}>
          <Link prefetch={false} href={`/sajam/${event.publicSlug}/model/${item.slug}`} onClick={() => record("open_model", item)}>
            {dict.sponsoredView}
          </Link>
          <button type="button" disabled={saved} onClick={() => add(item)}>
            {saved ? dict.sponsoredAdded : dict.sponsoredAdd}
          </button>
        </div>
      </div>
      {storageError ? <p role="alert">{dict.sponsoredAddError}</p> : null}
    </aside>
  );
}

export function FairGarage({ events, dict }: { events: FairGarageEventView[]; dict: FairGarageDict }) {
  const router = useRouter();
  const [document, setDocument] = useState<FairGarageDocument>(() => createEmptyFairGarageDocument());
  const [storageState, setStorageState] = useState<FairGarageReadResult["status"]>("empty");
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState(true);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [liveModels, setLiveModels] = useState<Map<string, FairGarageModelView["live"]>>(new Map());
  const [activeSlug, setActiveSlug] = useState(events[0]?.publicSlug ?? "auto-moto-fest-2026");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [passports, setPassports] = useState<Record<string, PassportLoad>>({});
  const requestedPassports = useRef(new Set<string>());

  const activeEvent = events.find((event) => event.publicSlug === activeSlug) ?? events[0];
  const activeItems = useMemo(() => activeEvent ? fairGarageItemsForEvent(document, activeEvent) : [], [activeEvent, document]);
  const activeModels = useMemo(() => activeEvent ? activeItems.map((item) => fairGarageModelView(item, liveModels.get(item.modelId), activeEvent.publicSlug)).filter((item): item is FairGarageModelView => item !== null) : [], [activeEvent, activeItems, liveModels]);

  const writeDocument = useCallback((next: FairGarageDocument) => {
    const result = writeFairGarage(window.localStorage, next);
    if (!result.ok) {
      setStorageState("unavailable");
      return false;
    }
    setDocument(next);
    setStorageState("ok");
    emitGarageChange();
    return true;
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const first = readFairGarage(window.localStorage);
      setDocument(first.document);
      setStorageState(first.status);
      setMounted(true);
      if (first.status === "ok" && writeFairGarage(window.localStorage, first.document).ok) {
        // Persists an in-memory V1 -> V2 migration without changing the storage key.
      }
    }, 0);
    const unsubscribe = subscribeGarage((next) => {
      setDocument(next.document);
      setStorageState(next.status);
    });
    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const ids = [...new Set(Object.values(document.events).flat().map((item) => item.modelId))];
    if (ids.length === 0) {
      return;
    }
    let cancelled = false;
    fetchFairGarageModels(ids)
      .then((models) => {
        if (cancelled) return;
        setLiveModels(new Map(models.map((model) => [model.id, model])));
        setRefreshState("ready");
        let next = document;
        for (const model of models) {
          const event = events.find((candidate) => candidate.dataSlug === model.eventSlug || fairGarageEventId(candidate) === model.eventId);
          next = updateFairGarageModelSnapshot(next, model.id, {
            eventSlug: event?.publicSlug ?? model.eventSlug,
            modelSlug: model.slug,
            brandName: model.brandName,
            displayName: model.displayName,
            priceText: model.priceText,
            ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}),
          });
        }
        if (next !== document) writeDocument(next);
      })
      .catch(() => {
        if (!cancelled) setRefreshState("error");
      });
    return () => { cancelled = true; };
  }, [document, events, mounted, refreshNonce, writeDocument]);

  useEffect(() => {
    if (!activeEvent || requestedPassports.current.has(activeEvent.publicSlug)) return;
    const key = activeEvent.publicSlug;
    requestedPassports.current.add(key);
    fetch("/api/fair/passport", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventSlug: activeEvent.dataSlug }),
    })
      .then(async (response) => {
        const body = (await response.json()) as { ok: boolean; value?: FairPassportState | null };
        if (!response.ok || !body.ok) throw new Error("passport_failed");
        setPassports((current) => ({ ...current, [key]: { state: "ready", value: body.value ?? null } }));
      })
      .catch(() => setPassports((current) => ({ ...current, [key]: { state: "error", value: null } })));
  }, [activeEvent]);

  if (!activeEvent) return null;

  const hasSponsored = Boolean(activeEvent.sponsoredRotation?.items.length);
  const passportLoad = passports[activeEvent.publicSlug] ?? { state: "loading" as const, value: null };
  const compareHref = `/sajam/garaza/poredjenje?${new URLSearchParams([["event", activeEvent.publicSlug], ...selected.map((id) => ["model", id])]).toString()}`;

  function changeEvent(slug: string) {
    setActiveSlug(slug);
    setSelected([]);
    setSelectionMessage(null);
  }

  function toggleSelected(modelId: string) {
    setSelectionMessage(null);
    setSelected((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      if (current.length >= 2) {
        setSelectionMessage(dict.compareLimit);
        return current;
      }
      return [...current, modelId];
    });
  }

  function removeModel(modelId: string) {
    setSelected((current) => current.filter((id) => id !== modelId));
    writeDocument(removeModelEverywhere(document, modelId));
  }

  return (
    <div className={`fair-event ${styles.page}${hasSponsored ? ` ${styles.pageWithDock}` : ""}`} data-reveal="off">
      <GarageHeader event={activeEvent} count={activeModels.length} dict={dict} />
      <main className={styles.main}>
        <section className={styles.intro}>
          <div>
            <h1>{dict.pageTitle}</h1>
            <p>{dict.pageBody}</p>
          </div>
          <div className={styles.savedCount}><CarFront aria-hidden="true" /><span>{fmt(dict.savedCount, { count: activeModels.length })}</span></div>
        </section>

        <div className={styles.tabs} role="tablist" aria-label={dict.eventTabsAria}>
          {events.map((event) => {
            const count = fairGarageItemsForEvent(document, event).length;
            const active = event.publicSlug === activeEvent.publicSlug;
            return (
              <button type="button" role="tab" aria-selected={active} className={active ? styles.tabActive : undefined} onClick={() => changeEvent(event.publicSlug)} key={event.publicSlug}>
                <span>{fairGarageEventTitle(event)}</span>
                <small>{event.fallbackDates}</small>
                <b>{count}</b>
              </button>
            );
          })}
        </div>

        {!online || refreshState === "error" ? (
          <div className={styles.networkNotice} role="status">
            <WifiOff aria-hidden="true" />
            <p>{online ? dict.refreshError : dict.offlineNotice}</p>
            {online ? <button type="button" onClick={() => setRefreshNonce((value) => value + 1)}><RotateCcw aria-hidden="true" />{dict.retry}</button> : null}
          </div>
        ) : null}
        {storageState === "unavailable" || storageState === "invalid" ? <p className={styles.storageError} role="alert">{dict.storageUnavailable}</p> : null}

        {activeModels.length > 0 ? (
          <section className={styles.models} aria-label={dict.pageTitle}>
            <div className={styles.compareBar}>
              <span><GitCompareArrows aria-hidden="true" />{fmt(dict.compareCount, { count: selected.length })}</span>
              {selected.length === 2 ? <button type="button" onClick={() => router.push(compareHref)}>{dict.compareAction}<ChevronRight aria-hidden="true" /></button> : <span className={styles.compareHint}>{dict.compareSelect}</span>}
            </div>
            {selectionMessage ? <p className={styles.selectionMessage} role="status">{selectionMessage}</p> : null}
            <div className={styles.modelList}>
              {activeModels.map((model, index) => (
                <GarageModelCard
                  key={model.id}
                  model={model}
                  selected={selected.includes(model.id)}
                  selectionDisabled={selected.length >= 2}
                  stale={!model.live && (refreshState === "error" || !online)}
                  dict={dict}
                  onSelect={() => toggleSelected(model.id)}
                  onRemove={() => removeModel(model.id)}
                  priority={index === 0}
                />
              ))}
            </div>
          </section>
        ) : mounted ? (
          <section className={styles.emptyState}>
            <div className={styles.emptyVisual} aria-hidden="true"><CarFront /></div>
            <h2>{dict.emptyTitle}</h2>
            <p>{dict.emptyBody}</p>
            <Link href={`/sajam/${activeEvent.publicSlug}`}><MapPin aria-hidden="true" />{dict.emptyAction}</Link>
          </section>
        ) : (
          <div className={styles.loadingState} aria-hidden="true"><span /><span /><span /></div>
        )}

        <PassportSection
          event={activeEvent}
          load={passportLoad}
          document={document}
          dict={dict}
          onDocument={writeDocument}
          onPassport={(next) => setPassports((current) => ({ ...current, [activeEvent.publicSlug]: { state: "ready", value: next } }))}
        />

        {getFairGaragePassportBadges(document, fairGarageEventId(activeEvent)).length > 0 ? (
          <section className={styles.savedBadges}>
            <h2>{dict.savedBadgesTitle}</h2>
            <div>
              {getFairGaragePassportBadges(document, fairGarageEventId(activeEvent)).map((badge) => {
                const passport = passportLoad.value?.catalog.find((item) => item.brandId === badge.brandId) ?? activeEvent.passportCatalog.find((item) => item.brandId === badge.brandId);
                const favorite = passport?.models.find((model) => model.eventModelId === badge.favoriteModelId)?.displayName ?? badge.favoriteModelId;
                return <article key={`${badge.eventId}:${badge.brandId}`}><BadgeCheck aria-hidden="true" /><strong>{badge.brandName}</strong><span>{fmt(dict.favoriteLabel, { model: favorite })}</span></article>;
              })}
            </div>
          </section>
        ) : null}

        <p className={styles.storageNotice}>{dict.storageNotice}</p>
      </main>
      <footer className="fair-footer"><span>{dict.poweredBy}</span><Link href="?dev=1" className="fair-dev-entry">{dict.devLink}</Link></footer>
      <SponsoredStrip event={activeEvent} document={document} dict={dict} onDocument={writeDocument} />
    </div>
  );
}
