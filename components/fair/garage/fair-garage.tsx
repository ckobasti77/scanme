"use client";

import * as Dialog from "@radix-ui/react-dialog";
import gsap from "gsap";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CarFront,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  GitCompareArrows,
  MapPin,
  MessageCircleMore,
  PhoneCall,
  RotateCcw,
  Share2,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  FairPassportProgress,
  FairPassportState,
  FairShareChannel,
  FairSponsoredActionKind,
  FairSponsoredModelCard,
} from "@/lib/fair-contract";
import { FAIR_PRIVACY_PATH } from "@/lib/fair-contract";
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
  writeFairGarageActiveEvent,
  type FairGarageDocument,
  type FairGarageReadResult,
} from "@/lib/fair-client/garage-store";
import { fairLocalPhotoUrl } from "@/lib/fair-client/photo-url";
import {
  fairGarageEventId,
  fairGarageEventTitle,
  fairGarageItemsForEvent,
  fairGarageModelView,
  fetchFairGarageModels,
  type FairGarageEventView,
  type FairGarageModelView,
} from "@/lib/fair-client/garage-view";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { useFairHistoryLayer } from "@/lib/fair-client/history-layer";
import { getFairRotationItem } from "@/lib/fair-client/rotation-slot";
import { fairPublicEventSlug } from "@/lib/fair-public-event";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fmt } from "@/lib/i18n/format";
import type { FairGarageDict, FairModelDict } from "@/lib/i18n/types";
import { FairEventShell } from "../event-shell";
import { FairBrandMark } from "./fair-brand-mark";
import styles from "./fair-garage.module.css";

type RefreshState = "idle" | "loading" | "ready" | "error";
type PassportLoad = { state: "loading" | "error" | "ready"; value: FairPassportState | null };
type ShareDraft = {
  models: FairGarageModelView[];
  title: string;
  text: string;
  url: string;
  shareCollectionId?: string;
};

const SPONSORED_INTERVAL_MS = 12_000;
const LONG_PRESS_MS = 430;
const LONG_PRESS_DRIFT_PX = 9;
const MAX_SELECTED_MODELS = 5;
const AUTO_MOTO_FEST_STARTS_AT = Date.parse("2026-10-30T10:00:00+01:00");

function eventIsLocked(event: FairGarageEventView, now: number) {
  // Future-event locking is a production rule. In development we must be able
  // to enter both garages and exercise their fixtures before either fair opens.
  if (process.env.NODE_ENV !== "production") return false;
  if (event.publicSlug !== "auto-moto-fest-2026") return false;
  return now < (event.event?.startsAt ?? AUTO_MOTO_FEST_STARTS_AT);
}

function createClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return `garage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  Object.assign(field.style, { position: "fixed", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy_failed");
}

const REVIEW_PHOTOS: Record<string, string> = {
  "bmw i4": "/fair/fixtures/bmw-i4.webp",
  "toyota urban ev": "/fair/fixtures/toyota-urban-cruiser.webp",
  "toyota urban cruiser": "/fair/fixtures/toyota-urban-cruiser.webp",
  "byd dolphin": "/fair/fixtures/byd-dolphin.webp",
  "byd dolphin surf": "/fair/elektromobilnost-2026/byd-dolphin-surf.png",
  "byd sealion 7": "/fair/elektromobilnost-2026/byd-sealion-7.jpg",
  "byd dolphin demo": "/fair/fixtures/byd-dolphin.webp",
  "geely starray demo": "/fair/fixtures/geely-starray.webp",
  "jmev ev3": "/fair/elektromobilnost-2026/jmev-ev3-event.jpg",
  "jmev elight": "/fair/elektromobilnost-2026/jmev-elight-event.jpg",
  "jmev ewind": "/fair/elektromobilnost-2026/jmev-ewind-event.jpg",
};

function cleanTestLabel(value: string) {
  return value.replace(/^TEST\s+/i, "").trim();
}

function displayModelName(brandName: string, displayName: string) {
  const brand = cleanTestLabel(brandName);
  const model = cleanTestLabel(displayName);
  return model.toLocaleLowerCase("sr-Latn").startsWith(`${brand.toLocaleLowerCase("sr-Latn")} `)
    ? model.slice(brand.length).trim()
    : model;
}

function reviewPhoto(brandName: string, displayName: string, photoUrl?: string) {
  if (photoUrl || process.env.NODE_ENV === "production") return fairLocalPhotoUrl(photoUrl);
  return REVIEW_PHOTOS[`${cleanTestLabel(brandName)} ${displayModelName(brandName, displayName)}`.trim().toLocaleLowerCase("sr-Latn")];
}

function emitGarageChange() {
  window.dispatchEvent(new Event(FAIR_GARAGE_MODEL_CHANGE_EVENT));
  window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
}

function eventContainsModel(document: FairGarageDocument, modelId: string) {
  return Object.values(document.events).some((items) => items.some((item) => item.modelId === modelId));
}

function removeModelEverywhere(document: FairGarageDocument, modelId: string) {
  let next = document;
  for (const eventId of Object.keys(document.events)) next = removeFairGarageModel(next, eventId, modelId);
  return next;
}

function subscribeGarage(onChange: (result: FairGarageReadResult) => void) {
  const refresh = () => onChange(readFairGarage(window.localStorage));
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === "scanme:fair-garage") refresh();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(FAIR_GARAGE_CHANGE_EVENT, refresh);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(FAIR_GARAGE_CHANGE_EVENT, refresh);
  };
}

function subscribeBrowserCapability() {
  return () => undefined;
}

function ModelVisual({ model, alt, preload = false }: { model: FairGarageModelView; alt: string; preload?: boolean }) {
  const photoUrl = reviewPhoto(model.brandName, model.displayName, model.photoUrl);
  return (
    <div className={styles.modelVisual}>
      {photoUrl ? (
        <Image fill sizes="(max-width: 720px) 100vw, 520px" src={photoUrl} alt={alt} preload={preload} draggable={false} className={styles.modelImage} />
      ) : (
        <div className={styles.modelPlaceholder} aria-hidden="true">
          <FairBrandMark brandName={cleanTestLabel(model.brandName)} />
          <CarFront />
        </div>
      )}
    </div>
  );
}

function RemoveDialog({ model, dict, onConfirm }: { model: FairGarageModelView; dict: FairGarageDict; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const requestClose = useFairHistoryLayer(open, () => setOpen(false), "garage-remove");
  return (
    <Dialog.Root open={open} onOpenChange={(next) => next ? setOpen(true) : requestClose()}>
      <Dialog.Trigger asChild>
        <button type="button" className={styles.removeButton} aria-label={fmt(dict.removeModelAria, { model: model.displayName })}>
          <Trash2 aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={styles.confirmDialog}>
          <div className={styles.dialogHandle} aria-hidden="true" />
          <CircleAlert aria-hidden="true" className={styles.confirmIcon} />
          <Dialog.Title>{dict.removeConfirmTitle}</Dialog.Title>
          <Dialog.Description>{fmt(dict.removeConfirmBody, { model: model.displayName })}</Dialog.Description>
          <div className={styles.confirmActions}>
            <button type="button" onClick={() => requestClose()}>{dict.cancel}</button>
            <button type="button" className={styles.confirmRemove} onClick={() => requestClose(onConfirm)}>{dict.confirmRemove}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SelectionRemoveDialog({ count, dict, onConfirm }: { count: number; dict: FairGarageDict; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const requestClose = useFairHistoryLayer(open, () => setOpen(false), "garage-selection-remove");
  return (
    <Dialog.Root open={open} onOpenChange={(next) => next ? setOpen(true) : requestClose()}>
      <Dialog.Trigger asChild>
        <button type="button" disabled={count === 0} aria-label={dict.selectionRemove}>
          <Trash2 aria-hidden="true" />
          <span>{dict.selectionRemove}</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={styles.confirmDialog}>
          <div className={styles.dialogHandle} aria-hidden="true" />
          <CircleAlert aria-hidden="true" className={styles.confirmIcon} />
          <Dialog.Title>{dict.selectionRemoveTitle}</Dialog.Title>
          <Dialog.Description>{fmt(dict.selectionRemoveBody, { count })}</Dialog.Description>
          <div className={styles.confirmActions}>
            <button type="button" onClick={() => requestClose()}>{dict.cancel}</button>
            <button type="button" className={styles.confirmRemove} onClick={() => requestClose(onConfirm)}>{dict.selectionRemoveConfirm}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ShareDialog({
  draft,
  dict,
  onClose,
  onNativeShare,
  onChannel,
}: {
  draft: ShareDraft | null;
  dict: FairGarageDict;
  onClose: () => void;
  onNativeShare: () => Promise<boolean>;
  onChannel: (channel: Exclude<FairShareChannel, "native">) => Promise<boolean>;
}) {
  const hasNativeShare = useSyncExternalStore(
    subscribeBrowserCapability,
    () => typeof navigator.share === "function",
    () => false,
  );
  const requestClose = useFairHistoryLayer(draft !== null, onClose, "garage-share");

  if (!draft) return null;

  const message = `${draft.text}\n${draft.url}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const viberUrl = `viber://forward?text=${encodeURIComponent(message)}`;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={styles.shareDialog}>
          <div className={styles.dialogHandle} aria-hidden="true" />
          <button type="button" className={styles.dialogClose} aria-label={dict.cancel} onClick={() => requestClose()}><X aria-hidden="true" /></button>
          <Dialog.Title>{dict.shareSheetTitle}</Dialog.Title>
          <Dialog.Description>{draft.title}</Dialog.Description>
          <div className={styles.shareOptions}>
            {hasNativeShare ? (
              <button type="button" onClick={() => void onNativeShare().then((shared) => { if (shared) requestClose(); })}>
                <Share2 aria-hidden="true" />
                <span>{dict.shareSystem}</span>
              </button>
            ) : null}
            <a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={() => { void onChannel("whatsapp").then((shared) => { if (shared) requestClose(); }); }}>
              <MessageCircleMore aria-hidden="true" />
              <span>{dict.shareWhatsApp}</span>
            </a>
            <a href={viberUrl} onClick={() => { void onChannel("viber").then((shared) => { if (shared) requestClose(); }); }}>
              <PhoneCall aria-hidden="true" />
              <span>{dict.shareViber}</span>
            </a>
            <button type="button" onClick={() => void onChannel("copy").then((shared) => { if (shared) requestClose(); })}>
              <Copy aria-hidden="true" />
              <span>{dict.shareCopy}</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GarageModelCard({
  model,
  selected,
  selectionMode,
  selectionDisabled,
  stale,
  dict,
  onSelect,
  onEnterSelection,
  onShare,
  onRemove,
  preload,
  bay,
}: {
  model: FairGarageModelView;
  selected: boolean;
  selectionMode: boolean;
  selectionDisabled: boolean;
  stale: boolean;
  dict: FairGarageDict;
  onSelect: () => void;
  onEnterSelection: () => void;
  onShare: () => void;
  onRemove: () => void;
  preload?: boolean;
  /** Parking bay number in the list: "MESTO 01". */
  bay: number;
}) {
  const [removing, setRemoving] = useState(false);
  const longPress = useRef<{ pointerId: number; x: number; y: number; timeout: number } | null>(null);
  const suppressClick = useRef(false);
  const suppressReset = useRef<number | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPress.current) window.clearTimeout(longPress.current.timeout);
    longPress.current = null;
  }, []);

  useEffect(() => () => {
    clearLongPress();
    if (suppressReset.current !== null) window.clearTimeout(suppressReset.current);
  }, [clearLongPress]);

  function startLongPress(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" || (event.target as HTMLElement).closest("a, button")) return;
    clearLongPress();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by automated checks do not own a native pointer.
    }
    longPress.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timeout: window.setTimeout(() => {
        longPress.current = null;
        suppressClick.current = true;
        if (!selectionDisabled || selected) {
          navigator.vibrate?.(12);
          onEnterSelection();
        }
      }, LONG_PRESS_MS),
    };
  }

  function moveLongPress(event: React.PointerEvent<HTMLElement>) {
    const active = longPress.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > LONG_PRESS_DRIFT_PX) clearLongPress();
  }

  function finishLongPress(event: React.PointerEvent<HTMLElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may have already released the pointer after a touch gesture.
    }
    clearLongPress();
    if (suppressClick.current) {
      if (suppressReset.current !== null) window.clearTimeout(suppressReset.current);
      // Consume only the synthetic click produced by this long press. Some
      // mobile browsers omit that click, so clear the guard before a real tap.
      suppressReset.current = window.setTimeout(() => {
        suppressClick.current = false;
        suppressReset.current = null;
      }, 80);
    }
  }

  function remove() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onRemove();
    setRemoving(true);
    window.setTimeout(onRemove, 250);
  }

  return (
    <article
      data-garage-model-id={model.id}
      className={`${styles.modelCard}${selectionMode ? ` ${styles.modelCardSelectionMode}` : ""}${selected ? ` ${styles.modelCardSelected}` : ""}${removing ? ` ${styles.modelCardRemoving}` : ""}`}
      role={selectionMode ? "option" : undefined}
      aria-selected={selectionMode ? selected : undefined}
      tabIndex={selectionMode ? 0 : undefined}
      onPointerDown={startLongPress}
      onPointerMove={moveLongPress}
      onPointerUp={finishLongPress}
      onPointerCancel={finishLongPress}
      onContextMenu={(event) => {
        if (!(event.target as HTMLElement).closest("a, button")) event.preventDefault();
      }}
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!selectionMode) return;
        event.preventDefault();
        event.stopPropagation();
        if (suppressClick.current) {
          suppressClick.current = false;
          if (suppressReset.current !== null) window.clearTimeout(suppressReset.current);
          suppressReset.current = null;
          return;
        }
        if (!selectionDisabled || selected) onSelect();
      }}
      onKeyDown={(event) => {
        if (!selectionMode || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        if (!selectionDisabled || selected) onSelect();
      }}
    >
      <div className={styles.modelMedia} data-garage-photo>
        <ModelVisual model={model} preload={preload} alt={fmt(dict.modelPhotoAlt, { brand: model.brandName, model: model.displayName })} />
        <span className={styles.bay}>{fmt(dict.bayLabel, { n: String(bay).padStart(2, "0") })}</span>
        <button
          type="button"
          className={styles.compareToggle}
          aria-label={selected ? dict.compareSelected : dict.compareSelect}
          aria-pressed={selected}
          disabled={!selected && selectionDisabled}
          onClick={selectionMode ? onSelect : onEnterSelection}
        >
          {selected ? <Check aria-hidden="true" /> : <GitCompareArrows aria-hidden="true" />}
        </button>
      </div>
      <div className={styles.modelContent}>
        <div className={styles.modelTopline}>
          <span>{cleanTestLabel(model.brandName)}</span>
          {stale ? <small>{dict.savedSnapshot}</small> : null}
        </div>
        <h2>{displayModelName(model.brandName, model.displayName)}</h2>
        <div className={styles.modelMeta}>
          <p>{model.variant || model.priceText}</p>
          {model.variant ? <strong>{model.priceText}</strong> : null}
        </div>
        <div className={styles.modelActions}>
          <Link prefetch={false} href={`/sajam/${model.eventSlug}/model/${model.modelSlug}`} className={styles.viewLink}>
            {dict.viewModel}<ChevronRight aria-hidden="true" />
          </Link>
          <button type="button" className={styles.shareButton} aria-label={fmt(dict.shareModelAria, { model: model.displayName })} onClick={onShare}>
            <Share2 aria-hidden="true" />
          </button>
          <RemoveDialog model={model} dict={dict} onConfirm={remove} />
        </div>
      </div>
    </article>
  );
}

export function LegacyGaragePassportSection({
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
  const [openPassport, setOpenPassport] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ passportId: string; kind: "success" | "error"; text: string } | null>(null);
  const requestPassportClose = useFairHistoryLayer(
    openPassport !== null,
    () => setOpenPassport(null),
    "garage-passport",
  );

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
      const base = load.value ?? { eventId: fairGarageEventId(event), catalog, progress };
      onPassport({ ...base, progress: [...base.progress.filter((item) => item.passportId !== passportId), body.value] });
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
    setMessage({ passportId, kind: ok ? "success" : "error", text: ok ? dict.passportBadgeSaved : dict.passportBadgeError });
  }

  return (
    <section className={styles.passportRail} aria-labelledby="fair-garage-passports">
      <div className={styles.passportRailHeading}>
        <h2 id="fair-garage-passports">{dict.passportsTitle}</h2>
        <span>{catalog.length}</span>
      </div>
      <div className={styles.passportRailList}>
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
            <Dialog.Root
              key={passport.passportId}
              open={openPassport === passport.passportId}
              onOpenChange={(open) => open ? setOpenPassport(passport.passportId) : requestPassportClose()}
            >
              <Dialog.Trigger asChild>
                <button type="button" className={`${styles.passportChip}${completed ? ` ${styles.passportChipComplete}` : ""}`} aria-label={fmt(dict.passportsOpen, { brand: cleanTestLabel(passport.brandName) })}>
                  <span className={styles.brandMark}>
                    {passport.brandLogoUrl ? <Image fill sizes="38px" src={passport.brandLogoUrl} alt="" /> : <FairBrandMark brandName={cleanTestLabel(passport.brandName)} className={styles.brandIcon} />}
                  </span>
                  <span><strong>{cleanTestLabel(passport.brandName)}</strong><small>{stamped}/{required}</small></span>
                  <span className={`${styles.passportProgressRing}${stamped === 0 ? ` ${styles.passportProgressRingEmpty}` : ""}`} style={{ "--passport-progress": `${required > 0 ? (stamped / required) * 360 : 0}deg` } as React.CSSProperties} aria-hidden="true">
                    {completed ? <Check /> : null}
                  </span>
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className={styles.dialogOverlay} />
                <Dialog.Content className={styles.passportDialog}>
                  <div className={styles.dialogHandle} aria-hidden="true" />
                  <button type="button" className={styles.dialogClose} aria-label={dict.cancel} onClick={() => requestPassportClose()}><X aria-hidden="true" /></button>
                  <div className={styles.passportDialogHeader}>
                    <span className={styles.brandMark}>{passport.brandLogoUrl ? <Image fill sizes="52px" src={passport.brandLogoUrl} alt="" /> : <FairBrandMark brandName={cleanTestLabel(passport.brandName)} className={styles.brandIcon} />}</span>
                    <div><Dialog.Title>{cleanTestLabel(passport.brandName)}</Dialog.Title><Dialog.Description>{fmt(dict.passportProgress, { stamped, required })}</Dialog.Description></div>
                    {completed ? <BadgeCheck aria-label={dict.passportComplete} /> : null}
                  </div>
                  <div className={styles.stamps} aria-label={fmt(dict.passportProgress, { stamped, required })}>
                    {passport.models.map((model) => {
                      const hasStamp = own?.stampedModelIds.includes(model.eventModelId) ?? false;
                      return <span className={hasStamp ? styles.stampEarned : undefined} key={model.eventModelId}><CarFront aria-hidden="true" /><span>{displayModelName(passport.brandName, model.displayName)}</span></span>;
                    })}
                  </div>
                  <p className={styles.passportStatus}>{completed ? dict.passportComplete : fmt(dict.passportMissing, { count: Math.max(0, required - stamped) })}</p>
                  {completed ? (
                    <fieldset className={styles.favoriteFieldset}>
                      <legend>{dict.passportFavoriteTitle}</legend>
                      <div>{passport.models.map((model) => <button type="button" key={model.eventModelId} aria-pressed={favorite === model.eventModelId} disabled={pending === passport.passportId} onClick={() => chooseFavorite(passport.passportId, model.eventModelId)}>{displayModelName(passport.brandName, model.displayName)}</button>)}</div>
                    </fieldset>
                  ) : null}
                  {favorite ? <button type="button" className={styles.badgeButton} disabled={savedBadge?.favoriteModelId === favorite} onClick={(clickEvent) => saveBadge(passport.passportId, passport.brandId, passport.brandName, passport.brandLogoUrl, favorite, Math.round(performance.timeOrigin + clickEvent.timeStamp))}><BadgeCheck aria-hidden="true" />{savedBadge?.favoriteModelId === favorite ? dict.passportBadgeSaved : dict.passportSaveBadge}</button> : null}
                  {pending === passport.passportId ? <p className={styles.passportMessage}>{dict.passportSaving}</p> : null}
                  {message?.passportId === passport.passportId ? <p className={message.kind === "error" ? styles.errorText : styles.passportMessage} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          );
        })}
      </div>
    </section>
  );
}

/** Conveyor slide (model page v2 prototype): the next photo enters from the left while the current one leaves right. */
const SPONSORED_SLIDE_MS = 650;
/** The model name fades out, swaps, and fades back in during the slide. */
const SPONSORED_NAME_SWAP_MS = 300;

function SponsoredSlideVisual({ item, dict }: { item: FairSponsoredModelCard; dict: FairGarageDict }) {
  const photoUrl = reviewPhoto(item.brandName, item.displayName, item.photoUrl);
  if (photoUrl) {
    return (
      <Image
        fill
        sizes="240px"
        src={photoUrl}
        alt={fmt(dict.sponsoredPhotoAlt, { brand: cleanTestLabel(item.brandName), model: displayModelName(item.brandName, item.displayName) })}
        className={styles.spPhoto}
      />
    );
  }
  if (item.brandLogoUrl) return <Image fill sizes="120px" src={item.brandLogoUrl} alt="" className={styles.spLogo} />;
  return <FairBrandMark brandName={cleanTestLabel(item.brandName)} className={styles.spMark} />;
}

/**
 * Garage recommendation dock (prototype stranica-modela-v2): sticky, dark
 * aurora card, photo on the right fading into the dark, a conveyor every
 * SPONSORED_INTERVAL_MS. The tag, the progress segments and the buttons are
 * fixed nodes; only the photo slides and the name crossfades. Rotation slots
 * stay deterministic (server epoch + interval), so every visitor sees the
 * same model at the same time.
 */
function SponsoredStrip({ event, document: garageDocument, dict, onDocument }: { event: FairGarageEventView; document: FairGarageDocument; dict: FairGarageDict; onDocument: (next: FairGarageDocument) => boolean }) {
  const rotation = event.sponsoredRotation;
  const items = rotation?.items ?? [];
  const intervalMs = rotation ? Math.max(SPONSORED_INTERVAL_MS, rotation.intervalMs) : SPONSORED_INTERVAL_MS;
  const [now, setNow] = useState(() => Date.now());
  const slot = rotation ? getFairRotationItem(items, { epochMs: rotation.epochMs, nowMs: now, intervalMs }) : null;
  const targetIndex = slot?.slot.index ?? 0;
  const nextSlotAt = slot?.slot.nextSlotAt;
  const slotStartedAt = slot?.slot.slotStartedAt;
  const [shownIndex, setShownIndex] = useState(targetIndex);
  const [incomingIndex, setIncomingIndex] = useState<number | null>(null);
  const [nameIndex, setNameIndex] = useState(targetIndex);
  const [nameOut, setNameOut] = useState(false);
  const [paused, setPaused] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const barsRef = useRef<HTMLDivElement | null>(null);
  const addAttemptRef = useRef<{ id: string; committed: boolean; fallback: number | null } | null>(null);

  // Next slot boundary: read the clock again (rotation keeps running while paused).
  useEffect(() => {
    if (!rotation || paused || nextSlotAt === undefined) return;
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.max(100, nextSlotAt - Date.now() + 20));
    return () => window.clearTimeout(timeout);
  }, [nextSlotAt, paused, rotation]);

  // A new slot: start the conveyor (or swap at once under reduced motion).
  useEffect(() => {
    if (!rotation || paused || incomingIndex !== null || targetIndex === shownIndex) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => {
        setShownIndex(targetIndex);
        setNameIndex(targetIndex);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.requestAnimationFrame(() => setIncomingIndex(targetIndex));
    return () => window.cancelAnimationFrame(frame);
  }, [incomingIndex, paused, rotation, shownIndex, targetIndex]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (incomingIndex === null || !viewport) return;
    const outgoing = viewport.querySelector<HTMLElement>("[data-slide='current']");
    const incoming = viewport.querySelector<HTMLElement>("[data-slide='incoming']");
    setNameOut(true);
    const nameTimer = window.setTimeout(() => {
      setNameIndex(incomingIndex);
      setNameOut(false);
    }, SPONSORED_NAME_SWAP_MS);
    const timeline = gsap.timeline({
      defaults: { duration: SPONSORED_SLIDE_MS / 1000, ease: "power2.inOut" },
      onComplete: () => {
        setShownIndex(incomingIndex);
        setIncomingIndex(null);
      },
    });
    if (outgoing) timeline.fromTo(outgoing, { xPercent: 0, opacity: 1 }, { xPercent: 105, opacity: 0.6 }, 0);
    if (incoming) timeline.fromTo(incoming, { xPercent: -105, opacity: 0.6 }, { xPercent: 0, opacity: 1 }, 0);
    return () => {
      timeline.kill();
      window.clearTimeout(nameTimer);
    };
  }, [incomingIndex]);

  // Progress segments: earlier ones full, the current one fills linearly to the slot end.
  const activeIndex = incomingIndex ?? shownIndex;
  useEffect(() => {
    const bars = barsRef.current;
    if (!bars || slotStartedAt === undefined) return;
    const fills = Array.from(bars.querySelectorAll<HTMLElement>("b"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animation: Animation | null = null;
    fills.forEach((fill, index) => {
      fill.getAnimations().forEach((running) => running.cancel());
      fill.style.transform = index < activeIndex ? "scaleX(1)" : "scaleX(0)";
    });
    const current = fills[activeIndex];
    if (current) {
      const progress = Math.min(1, Math.max(0, (Date.now() - slotStartedAt) / intervalMs));
      if (reduced) {
        current.style.transform = "scaleX(1)";
      } else {
        animation = current.animate([{ transform: `scaleX(${progress})` }, { transform: "scaleX(1)" }], {
          duration: Math.max(1, (1 - progress) * intervalMs),
          easing: "linear",
          fill: "forwards",
        });
        if (paused) animation.pause();
      }
    }
    return () => animation?.cancel();
  }, [activeIndex, intervalMs, paused, slotStartedAt]);

  useEffect(() => () => {
    const fallback = addAttemptRef.current?.fallback;
    if (fallback !== null && fallback !== undefined) window.clearTimeout(fallback);
  }, []);

  const item = items[activeIndex] ?? items[0];
  const nameItem = items[nameIndex] ?? item;
  if (!rotation || items.length === 0 || !item) return null;

  function record(kind: FairSponsoredActionKind, model: FairSponsoredModelCard) {
    void fetch("/api/fair/sponsored-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventModelId: model.eventModelId, surface: "garage", kind, requestId: createClientRequestId() }),
      keepalive: true,
    }).catch(() => undefined);
  }

  function resume() {
    setPaused(false);
    setNow(Date.now());
  }

  function commitAdd(model: FairSponsoredModelCard) {
    const attempt = addAttemptRef.current;
    if (!attempt || attempt.id !== model.eventModelId || attempt.committed) return;
    attempt.committed = true;
    if (attempt.fallback !== null) window.clearTimeout(attempt.fallback);
    const currentDocument = readFairGarage(window.localStorage).document;
    const photoUrl = reviewPhoto(model.brandName, model.displayName, model.photoUrl);
    const next = addFairGarageModel(currentDocument, {
      eventId: model.eventId,
      modelId: model.eventModelId,
      lastKnown: {
        eventSlug: event.publicSlug,
        modelSlug: model.slug,
        brandName: model.brandName,
        displayName: model.displayName,
        priceText: model.priceText,
        ...(photoUrl ? { photoUrl } : {}),
      },
    });
    const ok = onDocument(next);
    setStorageError(!ok);
    if (ok) {
      record("garage_add", model);
      fairHaptic([18, 40, 28]);
      // The new car parks as MESTO 01: back to the top of the garage.
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setAddingId(null);
    addAttemptRef.current = null;
  }

  function add(model: FairSponsoredModelCard) {
    if (addingId || eventContainsModel(garageDocument, model.eventModelId)) return;
    setPaused(true);
    setAddingId(model.eventModelId);
    setStorageError(false);
    addAttemptRef.current = { id: model.eventModelId, committed: false, fallback: null };
    const source = viewportRef.current?.querySelector<HTMLElement>("[data-slide='current']");
    // Fly into the list where the car will park (first bay), else into the garage icon.
    const target =
      window.document.querySelector<HTMLElement>("[data-garage-model-id] [data-garage-photo]") ??
      window.document.querySelector<HTMLElement>("[data-garage-list], [data-garage-empty]") ??
      window.document.querySelector<HTMLElement>("[data-garage-target]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!source || !target || reduced) {
      commitAdd(model);
      window.setTimeout(resume, 320);
      return;
    }
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const toWidth = Math.min(to.width, from.width * 2.4);
    const toHeight = Math.min(to.height || toWidth * 0.59, toWidth * 0.59);
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-slide");
    clone.className = styles.flyingCar;
    Object.assign(clone.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, transform: "none", opacity: "1" });
    window.document.body.appendChild(clone);
    addAttemptRef.current.fallback = window.setTimeout(() => {
      clone.remove();
      commitAdd(model);
      resume();
    }, 1_400);
    const timeline = gsap.timeline({
      onComplete: () => {
        clone.remove();
        commitAdd(model);
        window.setTimeout(resume, 420);
      },
    });
    timeline.to(clone, { y: -12, scale: 0.98, duration: 0.16, ease: "power2.out" });
    timeline.to(clone, { left: to.left + (to.width - toWidth) / 2, top: Math.max(to.top, 0), width: toWidth, height: toHeight, y: 0, scale: 1, borderRadius: 22, duration: 0.6, ease: "power3.inOut" });
    timeline.to(clone, { opacity: 0, duration: 0.18, ease: "power1.in" }, "-=0.08");
  }

  const saved = eventContainsModel(garageDocument, item.eventModelId);
  const adding = addingId === item.eventModelId;
  const shown = items[shownIndex] ?? item;
  const incoming = incomingIndex === null ? null : items[incomingIndex];
  return (
    <aside
      className={styles.spDock}
      aria-label={dict.sponsoredLabel}
      onPointerEnter={(pointerEvent) => { if (pointerEvent.pointerType === "mouse") setPaused(true); }}
      onPointerLeave={(pointerEvent) => { if (pointerEvent.pointerType === "mouse") resume(); }}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(focusEvent) => { if (!focusEvent.currentTarget.contains(focusEvent.relatedTarget)) resume(); }}
    >
      <div className={styles.spCard}>
        <div className={styles.spViewport} ref={viewportRef}>
          <div className={styles.spSlide} data-slide="current" key={`slide-${shown.eventModelId}`}>
            <SponsoredSlideVisual item={shown} dict={dict} />
          </div>
          {incoming ? (
            <div className={styles.spSlide} data-slide="incoming" key={`slide-${incoming.eventModelId}`}>
              <SponsoredSlideVisual item={incoming} dict={dict} />
            </div>
          ) : null}
        </div>
        <div className={styles.spBars} ref={barsRef} aria-hidden="true">
          {items.map((entry) => <i key={entry.eventModelId}><b /></i>)}
        </div>
        <div className={styles.spLeft}>
          <span className={styles.spTag}>{dict.sponsoredTag}</span>
          <div className={styles.spName} data-out={nameOut || undefined}>
            <span>{cleanTestLabel(nameItem.brandName)}</span>
            <strong>{displayModelName(nameItem.brandName, nameItem.displayName)}</strong>
          </div>
          <div className={styles.spActions}>
            <button type="button" className={styles.spAdd} data-done={saved || undefined} disabled={saved || adding} onClick={() => add(item)}>
              {saved ? <Check aria-hidden="true" /> : <CarFront aria-hidden="true" />}
              {saved ? dict.sponsoredAdded : adding ? dict.sponsoredAdding : dict.sponsoredAdd}
            </button>
            <Link prefetch={false} className={styles.spView} href={`/sajam/${event.publicSlug}/model/${item.slug}`} onClick={() => record("open_model", item)}>
              {dict.sponsoredView}
            </Link>
          </div>
        </div>
      </div>
      {storageError ? <p className={styles.spError} role="alert">{dict.sponsoredAddError}</p> : null}
    </aside>
  );
}

export function FairGarage({
  routeEventSlug,
  event: activeEvent,
  switchEvents,
  dict,
  shellDict,
  adminTools,
}: {
  routeEventSlug: string;
  event: FairGarageEventView;
  switchEvents: FairGarageEventView[];
  dict: FairGarageDict;
  shellDict: FairModelDict;
  /** Admin DEV tools, rendered on the server for a verified admin only. */
  adminTools?: ReactNode;
}) {
  const router = useRouter();
  const [garageDocument, setGarageDocument] = useState<FairGarageDocument>(() => createEmptyFairGarageDocument());
  const [storageState, setStorageState] = useState<FairGarageReadResult["status"]>("empty");
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState(true);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [liveModels, setLiveModels] = useState<Map<string, FairGarageModelView["live"]>>(new Map());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareDraft, setShareDraft] = useState<ShareDraft | null>(null);
  const [clockNow] = useState(() => Date.now());
  const modelListRef = useRef<HTMLDivElement | null>(null);
  const previousModelLayout = useRef<{ eventSlug: string; rects: Map<string, DOMRect> }>({ eventSlug: "", rects: new Map() });
  const requestSelectionClose = useFairHistoryLayer(selectionMode, closeSelection, "garage-selection");

  const activeItems = useMemo(() => fairGarageItemsForEvent(garageDocument, activeEvent), [activeEvent, garageDocument]);
  const activeModels = useMemo(() => activeItems.map((item) => fairGarageModelView(item, liveModels.get(item.modelId), activeEvent.publicSlug)).filter((item): item is FairGarageModelView => item !== null), [activeEvent, activeItems, liveModels]);
  const activeModelLayoutKey = activeModels.map((model) => model.id).join("|");
  const refreshNoticeVisible = !online || refreshState === "error";

  useLayoutEffect(() => {
    const eventSlug = activeEvent.publicSlug;
    const list = modelListRef.current;
    if (!list) {
      previousModelLayout.current = { eventSlug, rects: new Map() };
      return;
    }

    const cards = Array.from(list.querySelectorAll<HTMLElement>("[data-garage-model-id]"));
    const currentRects = new Map(cards.map((card) => [card.dataset.garageModelId ?? "", card.getBoundingClientRect()]));
    const previous = previousModelLayout.current;
    previousModelLayout.current = { eventSlug, rects: currentRects };
    if (previous.eventSlug !== eventSlug || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tweens: gsap.core.Tween[] = [];
    for (const card of cards) {
      const id = card.dataset.garageModelId ?? "";
      const before = previous.rects.get(id);
      const after = currentRects.get(id);
      if (!after) continue;
      if (!before) {
        tweens.push(gsap.fromTo(card, { autoAlpha: 0, y: -18, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, ease: "expo.out", clearProps: "transform,opacity,visibility" }));
        continue;
      }
      const x = before.left - after.left;
      const y = before.top - after.top;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      tweens.push(gsap.fromTo(card, { x, y }, { x: 0, y: 0, duration: 0.46, ease: "power3.out", clearProps: "transform" }));
    }
    return () => {
      for (const tween of tweens) tween.kill();
      // A refresh can interrupt the entrance tween. Never leave a newly added
      // card stranded at a partially faded inline state.
      for (const card of cards) gsap.set(card, { clearProps: "transform,opacity,visibility" });
    };
  }, [activeEvent.publicSlug, activeModelLayoutKey, refreshNoticeVisible]);

  const writeDocument = useCallback((next: FairGarageDocument) => {
    const result = writeFairGarage(window.localStorage, next);
    if (!result.ok) {
      setStorageState("unavailable");
      return false;
    }
    setGarageDocument(next);
    setStorageState("ok");
    emitGarageChange();
    return true;
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const first = readFairGarage(window.localStorage);
      setGarageDocument(first.document);
      setStorageState(first.status);
      setMounted(true);
      if (first.status === "ok") writeFairGarage(window.localStorage, first.document);
    }, 0);
    const unsubscribe = subscribeGarage((next) => { setGarageDocument(next.document); setStorageState(next.status); });
    return () => { window.clearTimeout(timeout); unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!mounted || eventIsLocked(activeEvent, Date.now())) return;
    writeFairGarageActiveEvent(window.localStorage, activeEvent.publicSlug);
  }, [activeEvent, mounted]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    if (!selectionMode) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      requestSelectionClose();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [requestSelectionClose, selectionMode]);

  useEffect(() => {
    if (selectionMode && selected.length === 0) requestSelectionClose();
  }, [requestSelectionClose, selected.length, selectionMode]);

  useEffect(() => {
    if (!shareMessage) return;
    const timeout = window.setTimeout(() => setShareMessage(null), 2_800);
    return () => window.clearTimeout(timeout);
  }, [shareMessage]);

  useEffect(() => {
    if (!mounted) return;
    const allIds = [...new Set(Object.values(garageDocument.events).flat().map((item) => item.modelId))];
    const ids = process.env.NODE_ENV === "development" ? allIds.filter((id) => !/^(garage|showcase|test)-/i.test(id)) : allIds;
    if (ids.length === 0) {
      const frame = window.requestAnimationFrame(() => setRefreshState("ready"));
      return () => window.cancelAnimationFrame(frame);
    }
    let cancelled = false;
    const loadingFrame = window.requestAnimationFrame(() => setRefreshState("loading"));
    fetchFairGarageModels(ids)
      .then((models) => {
        if (cancelled) return;
        setLiveModels(new Map(models.map((model) => [model.id, model])));
        setRefreshState("ready");
        let next = garageDocument;
        for (const model of models) {
          next = updateFairGarageModelSnapshot(next, model.id, { eventSlug: fairPublicEventSlug(model.eventSlug), modelSlug: model.slug, brandName: model.brandName, displayName: model.displayName, priceText: model.priceText, ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}) });
        }
        if (next !== garageDocument) writeDocument(next);
      })
      .catch(() => { if (!cancelled) setRefreshState("error"); });
    return () => { cancelled = true; window.cancelAnimationFrame(loadingFrame); };
  }, [garageDocument, mounted, refreshNonce, writeDocument]);

  const hasSponsored = Boolean(activeEvent.sponsoredRotation?.items.length);
  const compareHref = `/sajam/${activeEvent.publicSlug}/garaza/poredjenje?${new URLSearchParams(selected.map((id) => ["model", id])).toString()}`;
  function changeEvent(slug: string) {
    const nextEvent = switchEvents.find((event) => event.publicSlug === slug);
    if (!nextEvent || slug === activeEvent.publicSlug || eventIsLocked(nextEvent, clockNow)) return;
    if (selectionMode) requestSelectionClose(() => router.push(`/sajam/${slug}/garaza`));
    else router.push(`/sajam/${slug}/garaza`);
  }

  function toggleSelected(modelId: string) {
    setSelectionMessage(null);
    setSelected((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      if (current.length >= MAX_SELECTED_MODELS) {
        setSelectionMessage(dict.selectionLimit);
        return current;
      }
      return [...current, modelId];
    });
  }

  function enterSelection(modelId: string) {
    setSelectionMode(true);
    setSelectionMessage(null);
    setSelected((current) => current.includes(modelId) ? current : [...current, modelId].slice(0, MAX_SELECTED_MODELS));
  }

  function closeSelection() {
    setSelectionMode(false);
    setSelected([]);
    setSelectionMessage(null);
  }

  function removeSelected() {
    let next = garageDocument;
    for (const modelId of selected) next = removeModelEverywhere(next, modelId);
    writeDocument(next);
    requestSelectionClose();
  }

  async function recordShareAction(input: { eventModelId?: string; shareCollectionId?: string; channel: FairShareChannel; modelCount: number }) {
    await fetch("/api/fair/traffic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "share_action", requestId: createClientRequestId(), ...input }),
      keepalive: true,
    }).catch(() => undefined);
  }

  async function shareModels(models: FairGarageModelView[]) {
    if (shareBusy || models.length === 0 || models.length > MAX_SELECTED_MODELS) return;
    setShareBusy(true);
    setShareMessage(models.length > 1 ? dict.sharePreparing : null);
    try {
      let url: string;
      let shareCollectionId: string | undefined;
      if (models.length === 1) {
        const model = models[0];
        url = `${window.location.origin}/sajam/${model.eventSlug}/model/${model.modelSlug}`;
      } else {
        const response = await fetch("/api/fair/share-collection", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventModelIds: models.map((model) => model.id), requestId: createClientRequestId() }),
        });
        const body = (await response.json()) as { ok: boolean; value?: { collectionId: string; url: string } };
        if (!response.ok || !body.ok || !body.value) throw new Error("share_collection_failed");
        url = body.value.url;
        shareCollectionId = body.value.collectionId;
      }

      const first = models[0];
      const draft: ShareDraft = {
        models,
        title: models.length === 1
          ? fmt(dict.shareTitle, { brand: cleanTestLabel(first.brandName), model: displayModelName(first.brandName, first.displayName) })
          : dict.shareCollectionTitle,
        text: models.length === 1
          ? fmt(dict.shareText, { brand: cleanTestLabel(first.brandName), model: displayModelName(first.brandName, first.displayName) })
          : fmt(dict.shareCollectionText, { count: models.length }),
        url,
        ...(shareCollectionId ? { shareCollectionId } : {}),
      };

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: draft.title, text: draft.text, url: draft.url });
          void recordShareAction({
            ...(models.length === 1 ? { eventModelId: first.id } : { shareCollectionId }),
            channel: "native",
            modelCount: models.length,
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          // Keep an explicit fallback for browsers that expose Web Share but
          // reject the invocation (for example after an async collection call).
          setShareDraft(draft);
        }
      } else {
        setShareDraft(draft);
      }
      setShareMessage(null);
    } catch {
      setShareMessage(dict.shareFailed);
    } finally {
      setShareBusy(false);
    }
  }

  async function completeShare(channel: FairShareChannel): Promise<boolean> {
    if (!shareDraft || shareBusy) return false;
    setShareBusy(true);
    try {
      if (channel === "native") {
        if (typeof navigator.share !== "function") return false;
        try {
          await navigator.share({ title: shareDraft.title, text: shareDraft.text, url: shareDraft.url });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return false;
          throw error;
        }
      } else if (channel === "copy") {
        await copyText(shareDraft.url);
        setShareMessage(dict.shareCopied);
      }

      const first = shareDraft.models[0];
      void recordShareAction({
        ...(shareDraft.models.length === 1
          ? { eventModelId: first.id }
          : { shareCollectionId: shareDraft.shareCollectionId }),
        channel,
        modelCount: shareDraft.models.length,
      });
      return true;
    } catch {
      setShareMessage(dict.shareFailed);
      return false;
    } finally {
      setShareBusy(false);
    }
  }

  function removeModel(modelId: string) {
    setSelected((current) => current.filter((id) => id !== modelId));
    writeDocument(removeModelEverywhere(garageDocument, modelId));
  }

  return (
    <div className={`fair-event ${fairEventThemeClass(routeEventSlug)} ${styles.page}${hasSponsored && !selectionMode ? ` ${styles.pageWithDock}` : ""}${selectionMode ? ` ${styles.pageWithSelection}` : ""}`} data-reveal="off">
      <FairEventShell
        eventId={fairGarageEventId(activeEvent)}
        eventSlug={routeEventSlug}
        eventTitle={dict.umbrellaTitle}
        eventName={fairGarageEventTitle(activeEvent)}
        dict={shellDict}
        current="garage"
        adminTools={adminTools}
      />
      <main className={styles.main}>
        {switchEvents.length > 1 ? (
          <nav className={styles.tabs} aria-label={dict.eventTabsAria}>
            {switchEvents.map((event) => {
              const count = fairGarageItemsForEvent(garageDocument, event).length;
              const active = event.publicSlug === activeEvent.publicSlug;
              const locked = eventIsLocked(event, clockNow);
              const title = event.publicSlug === "auto-moto-fest-2026" ? dict.autoMotoTitle : event.publicSlug === "elektromobilnost-2026" ? dict.electromobilityTitle : fairGarageEventTitle(event);
              return (
                <button type="button" aria-current={active ? "page" : undefined} disabled={locked} className={`${active ? styles.tabActive : ""}${locked ? ` ${styles.tabLocked}` : ""}`} onClick={() => changeEvent(event.publicSlug)} key={event.publicSlug}>
                  <span>{title}<small>{locked ? dict.eventUpcoming : event.fallbackDates}</small></span>
                  <b>{count}</b>
                </button>
              );
            })}
          </nav>
        ) : (
          <section className={styles.intro}>
            <div><h1>{dict.pageTitle}</h1><p>{dict.pageBody}</p></div>
          </section>
        )}

        {refreshNoticeVisible ? (
          <div className={styles.networkNotice} role="status">
            <WifiOff aria-hidden="true" />
            <span>{online ? dict.refreshError : dict.offlineNotice}</span>
            {online ? <button type="button" aria-label={dict.retry} onClick={() => setRefreshNonce((value) => value + 1)}><RotateCcw aria-hidden="true" /></button> : null}
          </div>
        ) : null}
        {storageState === "unavailable" || storageState === "invalid" ? <p className={styles.storageError} role="alert">{dict.storageUnavailable}</p> : null}

        {activeModels.length > 0 ? (
          <section className={styles.models} aria-label={dict.pageTitle}>
            {selectionMode ? (
              <div className={`${styles.compareBar} ${styles.compareBarActive}`}>
                <span><GitCompareArrows aria-hidden="true" /><span>{fmt(dict.selectionCount, { count: selected.length })}</span></span>
              </div>
            ) : null}
            {selectionMessage ? <p className={styles.selectionMessage} role="status">{selectionMessage}</p> : null}
            <div className={styles.modelList} ref={modelListRef} data-garage-list>
              {activeModels.map((model, index) => <GarageModelCard key={model.id} model={model} selected={selected.includes(model.id)} selectionMode={selectionMode} selectionDisabled={selected.length >= MAX_SELECTED_MODELS} stale={!model.live && (refreshState === "error" || !online)} dict={dict} onSelect={() => toggleSelected(model.id)} onEnterSelection={() => enterSelection(model.id)} onShare={() => void shareModels([model])} onRemove={() => removeModel(model.id)} preload={index === 0} bay={index + 1} />)}
            </div>
          </section>
        ) : mounted ? (
          <section className={styles.emptyState} data-garage-empty><div className={styles.emptyVisual} aria-hidden="true"><CarFront /></div><h2>{dict.emptyTitle}</h2><p>{dict.emptyBody}</p><Link href={`/sajam/${routeEventSlug}`}><MapPin aria-hidden="true" />{dict.emptyAction}</Link></section>
        ) : <div className={styles.loadingState} aria-hidden="true"><span /><span /><span /></div>}

        <p className={styles.storageNotice}>{dict.storageNotice}</p>
      </main>
      <footer className="fair-footer"><span>{dict.poweredBy}</span><Link prefetch={false} href={FAIR_PRIVACY_PATH} className="fair-dev-entry">{dict.privacyLink}</Link></footer>
      {mounted && !selectionMode ? <SponsoredStrip event={activeEvent} document={garageDocument} dict={dict} onDocument={writeDocument} /> : null}
      {selectionMode && shareDraft === null ? (
        <div className={styles.selectionDock} role="toolbar" aria-label={fmt(dict.selectionCount, { count: selected.length })}>
          <strong>{selected.length}</strong>
          <button type="button" disabled={selected.length !== 2} onClick={() => requestSelectionClose(() => router.push(compareHref))}><GitCompareArrows aria-hidden="true" /><span>{dict.compareAction}</span></button>
          <button type="button" disabled={selected.length === 0 || shareBusy} onClick={() => void shareModels(activeModels.filter((model) => selected.includes(model.id)))}><Share2 aria-hidden="true" /><span>{dict.selectionShare}</span></button>
          <SelectionRemoveDialog count={selected.length} dict={dict} onConfirm={removeSelected} />
          <button type="button" className={styles.selectionClose} aria-label={dict.selectionClose} onClick={() => requestSelectionClose()}><X aria-hidden="true" /></button>
        </div>
      ) : null}
      <ShareDialog
        draft={shareDraft}
        dict={dict}
        onClose={() => setShareDraft(null)}
        onNativeShare={() => completeShare("native")}
        onChannel={completeShare}
      />
      {shareMessage ? <div className={styles.shareToast} role="status">{shareMessage}</div> : null}
    </div>
  );
}
