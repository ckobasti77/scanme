"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FairPassportCatalogEntry, FairPassportProgress } from "@/lib/fair-contract";
import { FAIR_PUBLIC_MAP_ENABLED } from "@/lib/fair-contract";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { createFavoriteSync, type FavoriteSync } from "@/lib/fair-client/favorite-sync";
import { devFavoriteResult, favoriteLeaders } from "@/lib/fair-client/passport-unlock";
import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import { fairPassportDisplayName } from "@/lib/fair-passport";
import { fmt } from "@/lib/i18n/format";
import type { FairPassportDict } from "@/lib/i18n/types";
import { CarArt, CarGuide, CompletionSeal, Postmark, carKindFor } from "./stamp-art";
import styles from "./stamp-passport.module.css";

// Stamp passport (Auto Moto Fest). Faithful port of the approved prototype
// public/prototip/pasos-markice.html: one perforated stamp per model; a
// scanned model waits as a dashed silhouette until the visitor taps it, then
// its stamp flies in, presses onto the page and the event postmark hits the
// ring beside it. The full set gets a wave, the seal and the favorite pick.
// "Stuck" is the existing seen-state (passport-visit-store), so every stamp
// flies in exactly once per device.

type RowState = "got" | "new" | "lock";

type StampEvent = { id: string; publicSlug: string; title: string };

const FLIGHT_MS = 900;
const ROW_GAP_MS = 200;
const EASE = "cubic-bezier(.25,.8,.3,1)";
const REST_SHADOW = "drop-shadow(0 1px 1px rgb(40 25 10/.22)) drop-shadow(0 4px 8px rgb(40 25 10/.12))";
const TILTS = [-1.2, 0.8, -0.5, 1, -0.8];

const tilt = (index: number) => TILTS[index % TILTS.length];

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cleanLabel(value: string) {
  return value.replace(/^TEST\s+/i, "").trim();
}

/** "Auto Moto Fest 2026" → { name: "Auto Moto Fest", year: "2026" }. */
function eventParts(title: string) {
  const clean = cleanLabel(title);
  const year = clean.match(/\b(\d{4})\b/)?.[1] ?? "";
  return { name: clean.replace(/\s*\b\d{4}\b\s*/, " ").trim(), year, full: clean };
}

/** Stable pseudo-random in [0, 1) per key, so the ink lands off-center but never jumps between renders. */
function unit(key: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function inkOffset(key: string, x: [number, number], y: [number, number], r: [number, number]) {
  const lerp = ([a, b]: [number, number], t: number) => a + t * (b - a);
  return `translate(${lerp(x, unit(key, 1)).toFixed(1)}px,${lerp(y, unit(key, 2)).toFixed(1)}px) rotate(${lerp(r, unit(key, 3)).toFixed(0)}deg)`;
}

const belgradeDate = new Intl.DateTimeFormat("sr-Latn", { day: "2-digit", month: "2-digit", timeZone: "Europe/Belgrade" });

function dateParts(at: number) {
  const parts = belgradeDate.formatToParts(new Date(at));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  // Non-breaking space: "16. 10." never splits across lines.
  return { postmark: `${day}.${month}.`, label: `${Number(day)}. ${Number(month)}.` };
}

/** Serbian count form after "od": 1, 2–4 (not 12–14) → "markice", otherwise "markica". */
function countLabel(dict: FairPassportDict, required: number) {
  const mod10 = required % 10;
  const mod100 = required % 100;
  const few = (mod10 >= 1 && mod10 <= 4) && !(mod100 >= 11 && mod100 <= 14);
  return fmt(few ? dict.stampCountOne : dict.stampCountMany, { required });
}

/** Event-time clock (handlers and animation callbacks only, never render). */
function nowMs() {
  return Date.now();
}

/** Paper fibres knocked loose around the slot when the stamp presses down. */
function paperPuff(layer: HTMLElement, rect: DOMRect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let k = 0; k < 10; k++) {
    const bit = document.createElement("i");
    bit.className = styles.paperBit;
    const side = k % 4;
    const x = side === 0 ? rect.left : side === 1 ? rect.right : rect.left + Math.random() * rect.width;
    const y = side === 2 ? rect.top : side === 3 ? rect.bottom : rect.top + Math.random() * rect.height;
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    layer.appendChild(bit);
    const angle = Math.atan2(y - cy, x - cx);
    const distance = 10 + Math.random() * 16;
    bit.animate(
      [{ transform: "translate(0,0)", opacity: 0.9 }, { transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px)`, opacity: 0 }],
      { duration: 420, easing: "cubic-bezier(.2,.7,.3,1)" },
    ).onfinish = () => bit.remove();
  }
}

/** Ink droplets thrown out by the seal. */
function inkBurst(layer: HTMLElement, rect: DOMRect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let k = 0; k < 12; k++) {
    const bit = document.createElement("i");
    bit.className = styles.inkBit;
    const size = 2 + Math.random() * 2.5;
    bit.style.cssText += `;width:${size}px;height:${size}px;left:${cx}px;top:${cy}px`;
    layer.appendChild(bit);
    const angle = Math.random() * Math.PI * 2;
    const distance = 44 + Math.random() * 24;
    bit.animate(
      [{ transform: "translate(-50%,-50%)", opacity: 0.75 }, { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px),calc(-50% + ${Math.sin(angle) * distance}px))`, opacity: 0 }],
      { duration: 540, easing: "cubic-bezier(.2,.8,.3,1)" },
    ).onfinish = () => bit.remove();
  }
}

function StampFace({ photo, kind, name, eager = false }: { photo?: string; kind: ReturnType<typeof carKindFor>; name: string; eager?: boolean }) {
  return (
    <div className={styles.stamp}>
      <div className={styles.stampInner} data-stamp-inner>
        {photo ? (
          <Image
            fill
            sizes="132px"
            src={photo}
            alt={name}
            loading={eager ? "eager" : undefined}
            unoptimized={fairPhotoUnoptimized(photo)}
            style={fairVehiclePhotoStyle(photo)}
          />
        ) : (
          <div className={styles.stampArt}><CarArt kind={kind} /></div>
        )}
        <i className={styles.sheen} data-sheen aria-hidden="true" />
      </div>
    </div>
  );
}

export function StampPassport({
  event,
  passport,
  progress,
  photos,
  stuckAt,
  unreadIds,
  dict,
  onProgress,
  onStuck,
  devTools,
  devThreshold,
  focusModelSlug,
  loaded,
  mapHref,
}: {
  event: StampEvent;
  passport: FairPassportCatalogEntry;
  progress: FairPassportProgress;
  photos: Record<string, string | undefined>;
  /** When each stuck stamp was stuck on this device (passport-visit-store). */
  stuckAt: Record<string, number>;
  unreadIds: string[];
  dict: FairPassportDict;
  onProgress: (next: FairPassportProgress) => void;
  onStuck: (modelId: string, at: number) => void;
  devTools: boolean;
  devThreshold: "public" | "below";
  focusModelSlug?: string;
  loaded: boolean;
  mapHref: string;
}) {
  const brand = cleanLabel(passport.brandName);
  const parts = eventParts(event.title);
  const postmarkTop = parts.name.toLocaleUpperCase("sr-Latn");
  const sealTop = dict.umbrellaTitle.toLocaleUpperCase("sr-Latn");
  const models = passport.models;
  const stamped = useMemo(() => new Set(progress.stampedModelIds), [progress.stampedModelIds]);
  const unread = useMemo(() => new Set(unreadIds), [unreadIds]);
  const stateOf = (modelId: string): RowState => (!stamped.has(modelId) ? "lock" : unread.has(modelId) ? "new" : "got");
  const allGot = models.length > 0 && models.every((model) => stateOf(model.eventModelId) === "got");
  const complete = progress.completed && allGot;
  const gotCount = models.filter((model) => stateOf(model.eventModelId) === "got").length;

  const rootRef = useRef<HTMLElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const pillTextRef = useRef<HTMLSpanElement>(null);
  const busyRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const completeRef = useRef(complete);
  const wasCompleteRef = useRef(complete);
  const focusHandledRef = useRef(false);

  const [flying, setFlying] = useState<{ id: string; index: number; left: number; top: number } | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [sealOn, setSealOn] = useState(complete);
  const [sealRun, setSealRun] = useState(0);
  const [countDone, setCountDone] = useState(complete);
  const [pick, setPick] = useState(complete);
  const [heartPop, setHeartPop] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | undefined>(progress.favoriteModelId);
  const [favoriteRun, setFavoriteRun] = useState(0);
  const [pillOverride, setPillOverride] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const syncRef = useRef<FavoriteSync | null>(null);
  const latestRef = useRef({ progress, onProgress, devTools, devThreshold });

  const nameOf = (modelId: string) => {
    const model = models.find((entry) => entry.eventModelId === modelId);
    return model ? fairPassportDisplayName(passport.brandName, model.displayName) : "";
  };
  const pillText = pillOverride ?? (favoriteId ? fmt(dict.stampFavoriteChosen, { model: nameOf(favoriteId) }) : dict.stampFavoriteAsk);

  useEffect(() => {
    completeRef.current = complete;
    if (!complete) {
      wasCompleteRef.current = false;
    }
    latestRef.current = { progress, onProgress, devTools, devThreshold };
  });

  // Favorite saves: latest tap wins, requests in tap order (lib/fair-client/favorite-sync).
  useEffect(() => {
    const sync = createFavoriteSync<FairPassportProgress>({
      confirmed: latestRef.current.progress.favoriteModelId,
      delayMs: 3000,
      send: async (modelId) => {
        const { progress: current, devTools: dev, devThreshold: threshold } = latestRef.current;
        if (dev) {
          return { ...current, favoriteModelId: modelId, favoriteResult: devFavoriteResult(passport.models.map((model) => model.eventModelId), modelId, threshold) };
        }
        const response = await fetch("/api/fair/passport/favorite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ passportId: passport.passportId, eventModelId: modelId }),
          keepalive: true,
        });
        const body = (await response.json()) as { ok: boolean; value?: FairPassportProgress };
        if (!response.ok || !body.ok || !body.value) throw new Error("favorite_failed");
        return body.value;
      },
      onSaved: (_modelId, value) => latestRef.current.onProgress(value),
      onFailed: (confirmed) => {
        setFavoriteId(confirmed);
        setPill(dict.favoriteError);
      },
    });
    syncRef.current = sync;
    // Leaving or hiding the page inside the 3 s wait still saves the last pick.
    const onHidden = () => {
      if (document.visibilityState === "hidden") sync.flushNow();
    };
    window.addEventListener("pagehide", sync.flushNow);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", sync.flushNow);
      document.removeEventListener("visibilitychange", onHidden);
      sync.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passport.passportId]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function later(fn: () => void, ms: number) {
    const timer = window.setTimeout(fn, ms);
    timersRef.current.push(timer);
    return timer;
  }

  function rowEl(modelId: string) {
    return rootRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(modelId)}"]`) ?? null;
  }

  function popDot(index: number) {
    const dot = rootRef.current?.querySelector<HTMLElement>(`[data-slot-dot="${index}"]`);
    if (!dot || reducedMotion()) return;
    dot.animate([{ transform: "scale(.3)" }, { transform: "scale(1)" }], { duration: 450, easing: "cubic-bezier(.3,1.7,.5,1)" });
  }

  function setPill(text: string) {
    const node = pillTextRef.current;
    if (!node || reducedMotion()) {
      setPillOverride(text);
      return;
    }
    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140 }).onfinish = () => {
      setPillOverride(text);
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    };
  }

  /* Completion: a wave runs through every row, then the seal is pressed. */
  function finale() {
    setLiveText(fmt(dict.finaleTitle, { brand }));
    if (reducedMotion()) {
      setSealOn(true);
      setSealRun((run) => run + 1);
      setCountDone(true);
      setHeartPop(true);
      setPick(true);
      return;
    }
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []);
    later(() => {
      rows.forEach((row, k) =>
        later(() => {
          row.querySelector<HTMLElement>("[data-glow]")?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 620, easing: "ease-in-out" });
          const postmark = row.querySelector<HTMLElement>("[data-postmark]");
          if (postmark) {
            const base = postmark.style.transform;
            postmark.animate(
              [{ transform: base, filter: "saturate(1)" }, { transform: `${base} scale(1.08)`, filter: "saturate(1.4) brightness(.92)", offset: 0.4 }, { transform: base, filter: "saturate(1)" }],
              { duration: 460 },
            );
          }
          popDot(k);
          fairHaptic(10, { iosTick: true });
        }, k * ROW_GAP_MS),
      );
      later(() => {
        setSealOn(true);
        setSealRun((run) => run + 1);
      }, rows.length * ROW_GAP_MS + 320);
    }, 280);
  }

  function after() {
    busyRef.current = false;
    setLanded(null);
    // Only the stamp that completes the set in this view starts the finale.
    if (completeRef.current && !wasCompleteRef.current) {
      wasCompleteRef.current = true;
      finale();
    }
  }

  function land(modelId: string, index: number, at: number) {
    // One commit: the flying stamp disappears as the page stamp appears in the same spot.
    setFlying(null);
    setLanded(modelId);
    onStuck(modelId, at);
    setLiveText(fmt(dict.stampStuckStatus, { model: nameOf(modelId) }));
    popDot(index);
  }

  function fly(modelId: string, index: number) {
    const slot = rowEl(modelId)?.querySelector<HTMLElement>("[data-slot]");
    if (!slot) {
      land(modelId, index, nowMs());
      return;
    }
    const rect = slot.getBoundingClientRect();
    setFlying({ id: modelId, index, left: rect.left, top: rect.top });
  }

  function stick(modelId: string, index: number) {
    if (busyRef.current || stateOf(modelId) !== "new") return;
    busyRef.current = true;
    setSealOn(false);
    setCountDone(false);
    setPick(false);
    if (reducedMotion()) {
      land(modelId, index, nowMs());
      return;
    }
    fly(modelId, index);
  }

  // ?focus=<modelSlug> from the new-stamp card: bring that row into view.
  useEffect(() => {
    if (!loaded || !focusModelSlug || focusHandledRef.current) return;
    const target = models.find((model) => model.slug === focusModelSlug);
    const row = target ? rootRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(target.eventModelId)}"]`) : null;
    if (!row) return;
    focusHandledRef.current = true;
    row.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [loaded, focusModelSlug, models]);

  // The flight (WAAPI, prototype keyframes) starts once the flying stamp is in the DOM.
  useLayoutEffect(() => {
    if (!flying) return;
    const node = flyRef.current;
    const slot = rowEl(flying.id)?.querySelector<HTMLElement>("[data-slot]");
    if (!node || !slot) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dx = W / 2 - (flying.left + 66);
    const dy = H * 0.38 - (flying.top + 48);
    const t = tilt(flying.index);
    const dim = dimRef.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: FLIGHT_MS });
    const flight = node.animate(
      [
        { transform: `translate(${dx + 30}px,${dy - H * 0.5}px) rotate(-16deg) scale(1.55)`, filter: "drop-shadow(0 34px 22px rgb(30 15 5/.32)) brightness(1)", offset: 0, easing: "cubic-bezier(.2,.8,.3,1)" },
        { transform: `translate(${dx}px,${dy}px) rotate(-5deg) scale(1.5)`, filter: "drop-shadow(0 30px 20px rgb(30 15 5/.3)) brightness(1)", offset: 0.32 },
        { transform: `translate(${dx}px,${dy - 6}px) rotate(-4deg) scale(1.53)`, filter: "drop-shadow(0 34px 22px rgb(30 15 5/.28)) brightness(1)", offset: 0.42, easing: "cubic-bezier(.62,0,.92,.45)" },
        { transform: `translate(0px,0px) rotate(${t}deg) scale(1)`, filter: "drop-shadow(0 3px 3px rgb(30 15 5/.3)) brightness(1)", offset: 0.86, easing: "cubic-bezier(.2,0,.2,1)" },
        { transform: `translate(0px,0px) rotate(${t}deg) scale(.972)`, filter: "drop-shadow(0 0 0 rgb(30 15 5/.4)) brightness(.93)", offset: 0.91, easing: "cubic-bezier(.2,.7,.3,1)" },
        { transform: `translate(0px,0px) rotate(${t}deg) scale(1)`, filter: `${REST_SHADOW} brightness(1)`, offset: 1 },
      ],
      { duration: FLIGHT_MS, fill: "forwards" },
    );
    const { id, index } = flying;
    flight.onfinish = () => land(id, index, nowMs());
    const impact = later(() => {
      fairHaptic(30, { iosTick: true });
      if (fxRef.current) paperPuff(fxRef.current, slot.getBoundingClientRect());
      slot.animate(
        [{ boxShadow: "0 0 0 0 color-mix(in srgb, var(--fair-accent) 35%, transparent)" }, { boxShadow: "0 0 0 9px color-mix(in srgb, var(--fair-accent) 0%, transparent)" }],
        { duration: 420, easing: "ease-out" },
      );
    }, FLIGHT_MS * 0.86);
    return () => {
      flight.onfinish = null;
      flight.cancel();
      dim?.cancel();
      window.clearTimeout(impact);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying]);

  // After landing: sheen inside the photo only, calm text swap, postmark slam; then finish.
  useLayoutEffect(() => {
    if (!landed) return;
    const row = rowEl(landed);
    if (!row) return;
    const stampWrap = row.querySelector<HTMLElement>("[data-stamp-wrap]");
    const postmark = row.querySelector<HTMLElement>("[data-postmark]");
    if (reducedMotion()) {
      stampWrap?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      postmark?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 120, fill: "backwards" });
      later(after, 340);
      return;
    }
    row.querySelector<HTMLElement>("[data-sheen]")?.animate([{ transform: "translateX(-120%)" }, { transform: "translateX(120%)" }], { duration: 700, delay: 60, easing: "ease-in-out" });

    row.querySelector<HTMLElement>("[data-stamp-status]")?.animate(
      [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE },
    );

    if (postmark) {
      const base = postmark.style.transform;
      postmark.animate(
        [
          { transform: `${base} scale(1.7)`, opacity: 0, filter: "blur(1.5px)" },
          { transform: `${base} scale(.94)`, opacity: 1, filter: "blur(0)", offset: 0.6 },
          { transform: `${base} scale(1)`, opacity: 1 },
        ],
        { duration: 300, delay: 420, easing: "cubic-bezier(.2,.8,.3,1)", fill: "backwards" },
      );
    }
    later(() => fairHaptic([8, 24, 22], { iosTick: true }), 600);
    later(after, 860);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed]);

  // Seal slam, burst of ink bits, count → "Kompletan pasoš", then the favorite pick.
  useLayoutEffect(() => {
    if (sealRun === 0) return;
    const seal = sealRef.current;
    if (!seal) return;
    const base = seal.style.transform;
    if (reducedMotion()) {
      seal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
      return;
    }
    seal.animate(
      [
        { transform: `${base} scale(2.3) rotate(-14deg)`, opacity: 0 },
        { transform: `${base} scale(.93)`, opacity: 1, offset: 0.55 },
        { transform: `${base} scale(1.02)`, offset: 0.78 },
        { transform: base },
      ],
      { duration: 520, easing: "cubic-bezier(.3,.7,.2,1)" },
    );
    later(() => {
      fairHaptic([50, 40, 90], { iosTick: true });
      if (fxRef.current) inkBurst(fxRef.current, seal.getBoundingClientRect());
      const count = countRef.current;
      if (count) {
        count.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = () => {
          setCountDone(true);
          count.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
        };
      } else {
        setCountDone(true);
      }
    }, 290);
    later(() => {
      setHeartPop(true);
      setPick(true);
    }, 860);
  }, [sealRun]);

  // Heart badge pops on the newly chosen stamp.
  useLayoutEffect(() => {
    if (favoriteRun === 0 || !favoriteId || reducedMotion()) return;
    const row = rowEl(favoriteId);
    row?.querySelector<HTMLElement>("[data-fav-badge]")?.animate(
      [{ transform: "scale(0)" }, { transform: "scale(1.25)", offset: 0.6 }, { transform: "scale(1)" }],
      { duration: 380, easing: "cubic-bezier(.3,1.5,.5,1)" },
    );
    row?.querySelector<HTMLElement>("[data-glow]")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteRun]);

  function choose(modelId: string) {
    if (modelId === favoriteId) return;
    setFavoriteId(modelId);
    setFavoriteRun((run) => run + 1);
    fairHaptic(14, { iosTick: true });
    setPill(fmt(dict.stampFavoriteChosen, { model: nameOf(modelId) }));
    syncRef.current?.choose(modelId);
  }

  const publicResult = progress.favoriteModelId && progress.favoriteResult?.state === "public" ? progress.favoriteResult : undefined;
  const leaders = favoriteLeaders(publicResult);
  const waitingForResults = Boolean(progress.favoriteModelId) && progress.favoriteResult?.state === "waiting_for_minimum";
  const sealTransform = inkOffset(passport.passportId, [-5, 5], [-4, 4], [-18, -4]);

  const infoGot = (modelId: string, name: string) => {
    const at = stuckAt[modelId];
    const percent = publicResult?.options.find((option) => option.eventModelId === modelId)?.percentage;
    return (
      <>
        {at ? <div className={styles.state}>{fmt(dict.stampCollectedState, { date: dateParts(at).label })}</div> : null}
        {percent !== undefined ? (
          <div className={styles.result} aria-label={fmt(dict.favoritePercentAria, { model: name, percent })}>
            <span className={styles.resultTrack}><i style={{ transform: `scaleX(${percent / 100})` }} /></span>
            <b>{percent}%</b>
          </div>
        ) : null}
        {leaders.includes(modelId) ? <span className={styles.crowdPick}>{dict.favoriteCrowdPick}</span> : null}
      </>
    );
  };

  const infoNew = () => (
    <>
      <span className={styles.chip}>{dict.newStamp}</span>
      <div className={styles.state}>{dict.stampNewState}</div>
    </>
  );

  const sheetClass = [styles.sheet, pick ? styles.sheetPick : "", pick && !favoriteId ? styles.sheetWaiting : ""].filter(Boolean).join(" ");

  return (
    <main className={styles.main} ref={rootRef}>
      <Link prefetch={false} href={`/sajam/${event.publicSlug}/pasosi`} className={styles.back}>
        <ArrowLeft aria-hidden="true" />
        <span>{dict.passportsNav}</span>
      </Link>

      <section className={sheetClass} aria-label={fmt(dict.brandPassportTitle, { brand })}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <div className={styles.eyebrow}>{fmt(dict.stampEyebrow, { event: parts.full })}</div>
            <h1 className={styles.brand}>{brand}</h1>
            <div className={styles.progress}>
              <div className={styles.slots} role="img" aria-label={fmt(dict.progressAria, { brand, stamped: gotCount, required: models.length })}>
                {models.map((model, index) => (
                  <i key={model.eventModelId} data-slot-dot={index} className={stateOf(model.eventModelId) === "got" ? styles.slotOn : undefined} />
                ))}
              </div>
              <div ref={countRef} className={styles.count}>
                {countDone ? dict.stampComplete : <><strong>{gotCount}</strong> <em>{countLabel(dict, models.length)}</em></>}
              </div>
            </div>
            <div className={`${styles.ask}${pick ? ` ${styles.askOpen}` : ""}`} aria-hidden={!pick}>
              <div>
                <div className={styles.pill} role="status">
                  <span className={styles.pillDot} aria-hidden="true" />
                  <span ref={pillTextRef}>{pillText}</span>
                </div>
                {waitingForResults ? <p className={styles.resultsSoon}>{dict.favoriteResultsSoon}</p> : null}
              </div>
            </div>
          </div>
          <div className={`${styles.sealBox}${sealOn ? ` ${styles.sealBoxDone}` : ""}`}>
            <div className={styles.sealGhost} aria-hidden="true">
              <b>{dict.stampSealGhostTop}<br />{dict.stampSealGhostBottom}</b>
            </div>
            <div
              ref={sealRef}
              className={`${styles.seal}${sealOn ? ` ${styles.sealOn}` : ""}`}
              style={{ transform: sealTransform }}
              role={sealOn ? "img" : undefined}
              aria-label={sealOn ? fmt(dict.finaleSealAria, { brand, event: parts.full }) : undefined}
            >
              {sealOn ? <CompletionSeal top={sealTop} bottom={postmarkTop} center={brand.toLocaleUpperCase("sr-Latn")} year={parts.year} /> : null}
            </div>
          </div>
        </div>

        <div className={styles.rows}>
          {models.map((model, index) => {
            const id = model.eventModelId;
            const state = stateOf(id);
            const name = fairPassportDisplayName(passport.brandName, model.displayName);
            const photo = photos[id];
            const kind = carKindFor(index);
            const isFav = favoriteId === id;
            // Same rule as before: the pick opens once the set is complete and sealed.
            const canPick = complete && pick && state === "got";
            const at = stuckAt[id];
            const postmarkStyle: CSSProperties = { transform: inkOffset(id, [-5, 5], [-4, 5], [-28, 22]) };
            const mount =
              state === "got" ? (
                <div className={styles.mount}>
                  <div className={styles.slot} data-slot />
                  <div className={styles.stampWrap} data-stamp-wrap style={{ transform: `rotate(${tilt(index)}deg)` }}>
                    <StampFace photo={photo} kind={kind} name={name} />
                  </div>
                  {pick ? <span className={styles.halo} style={{ "--d": `${index * 0.28}s` } as CSSProperties} aria-hidden="true" /> : null}
                </div>
              ) : state === "new" ? (
                <button type="button" className={styles.mount} aria-label={fmt(dict.stampStickAria, { model: name })} onClick={() => stick(id, index)}>
                  <div className={styles.slot} data-slot>
                    <CarGuide kind={kind} />
                    <span className={styles.tap}>{dict.stampTapToStick}</span>
                  </div>
                  {/* Loads the photo before the flight; never visible. */}
                  <div className={styles.preload} aria-hidden="true"><StampFace photo={photo} kind={kind} name="" eager /></div>
                </button>
              ) : (
                <div className={styles.mount}>
                  <div className={styles.slot} data-slot><CarGuide kind={kind} /></div>
                </div>
              );

            let info;
            if (state === "got") {
              info = infoGot(id, name);
            } else if (state === "new") {
              info = infoNew();
            } else {
              info = (
                <>
                  {FAIR_PUBLIC_MAP_ENABLED ? (
                    <Link prefetch={false} href={mapHref} className={styles.find}>{dict.stampFindOnMap}</Link>
                  ) : (
                    <div className={styles.state}>{dict.stampLockedHint}</div>
                  )}
                </>
              );
            }

            return (
              <div
                key={id}
                data-row={id}
                data-stamp-state={state}
                className={[styles.row, styles[`row_${state}`], isFav ? styles.rowFav : ""].filter(Boolean).join(" ")}
              >
                <span className={styles.glow} data-glow aria-hidden="true" />
                {/* The whole row opens the model; the stamp button and the heart sit above it (siblings, not nested). */}
                <Link
                  prefetch={false}
                  href={`/sajam/${event.publicSlug}/model/${model.slug}`}
                  className={styles.rowLink}
                  aria-label={fmt(dict.stampOpenModelAria, { model: name })}
                />
                <div className={styles.mountBox}>
                  {mount}
                  {canPick ? (
                    <button
                      type="button"
                      className={`${styles.heart} ${heartPop ? styles.heartPop : styles.heartFade}${isFav ? ` ${styles.heartOn}` : ""}`}
                      style={{ "--heart-delay": `${index * 95}ms` } as CSSProperties}
                      aria-pressed={isFav}
                      aria-label={fmt(dict.stampFavoriteAria, { model: name })}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        choose(id);
                      }}
                    >
                      <span className={styles.heartDisc} data-fav-badge>
                        <Heart aria-hidden="true" fill={isFav ? "currentColor" : "none"} />
                      </span>
                    </button>
                  ) : null}
                </div>
                <div className={styles.info} data-info>
                  <div className={styles.modelName} data-model-name>{name}</div>
                  <div className={styles.status} data-stamp-status>{info}</div>
                </div>
                <div className={styles.mark} aria-hidden="true">
                  <span className={styles.ring} />
                  {state === "got" && at ? (
                    <div className={styles.postmark} data-postmark style={postmarkStyle}>
                      <Postmark top={postmarkTop} bottom={parts.year} date={dateParts(at).postmark} seed={index} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <span className={styles.srOnly} aria-live="polite">{liveText}</span>
      <div ref={dimRef} className={styles.dim} aria-hidden="true" />
      <div ref={fxRef} className={styles.fx} aria-hidden="true">
        {flying ? (
          <div ref={flyRef} className={styles.fly} style={{ left: flying.left, top: flying.top }}>
            <StampFace photo={photos[flying.id]} kind={carKindFor(flying.index)} name="" />
          </div>
        ) : null}
      </div>
    </main>
  );
}
