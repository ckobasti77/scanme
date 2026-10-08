"use client";

import Image from "next/image";
import { CarFront } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fairHaptic } from "@/lib/fair-client/haptics";
import {
  PASSPORT_CELL_COUNT,
  PASSPORT_CELL_TICKS,
  PASSPORT_DRAIN_MS,
  PASSPORT_HOLD_MS,
  anchorRim,
  createRimState,
  drainProgress,
  litCellCount,
  nextTickIndex,
  rimFrame,
} from "@/lib/fair-client/passport-unlock";
import { fmt } from "@/lib/i18n/format";
import type { FairPassportDict } from "@/lib/i18n/types";
import styles from "./fair-passport.module.css";

type Phase = "ready" | "done";

type Engine = { schedule: () => void };

/** Moment the unlock burst hands over to the collected state (prototype `finalize`). */
const UNLOCK_SETTLE_MS = 1000;

const CELLS = Array.from({ length: PASSPORT_CELL_COUNT }, (_, index) => index);

/**
 * One "ready" stamp: edge comet, hold-to-unlock with battery cells and the
 * unlock burst. Per frame it only writes transform / opacity / clip-path (plus
 * the 32 px ring's dash offset); React re-renders only when the card settles.
 */
export function PassportUnlockCard({
  modelId,
  modelName,
  brand,
  photo,
  preload,
  active,
  dict,
  onActivate,
  onUnlocked,
}: {
  modelId: string;
  modelName: string;
  brand: string;
  photo?: string;
  preload?: boolean;
  /** Only the card in focus runs the comet. */
  active: boolean;
  dict: FairPassportDict;
  onActivate: (modelId: string) => void;
  onUnlocked: (modelId: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const rootRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef(active);
  const engineRef = useRef<Engine | null>(null);
  const callbacksRef = useRef({ onActivate, onUnlocked, dict });

  useEffect(() => {
    callbacksRef.current = { onActivate, onUnlocked, dict };
  }, [onActivate, onUnlocked, dict]);

  useEffect(() => {
    activeRef.current = active;
    if (rootRef.current) rootRef.current.toggleAttribute("data-active", active);
    engineRef.current?.schedule();
  }, [active]);

  useEffect(() => {
    const card = rootRef.current;
    const hit = hitRef.current;
    if (!card || !hit) return;
    const part = <T extends Element = HTMLElement>(name: string) => card.querySelector<T>(`[data-u="${name}"]`);
    const photoColor = part("color");
    const shade = part("shade")!;
    const charge = part("charge")!;
    const spin = part("spin")!;
    const fill = part("fill")!;
    const bladeRight = part("blade-r")!;
    const bladeLeft = part("blade-l")!;
    const ring = part<SVGCircleElement>("ring")!;
    const text = part("text")!;
    const hint = part("hint")!;
    const cells = Array.from(card.querySelectorAll<HTMLElement>('[data-u="cell"]'));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rim = createRimState(performance.now(), Math.random() * 360);
    const timers = new Set<number>();
    let progress = 0;
    let mode: "idle" | "hold" | "drain" | "done" = "idle";
    let start = 0;
    let from = 0;
    let tickIndex = 0;
    let raf = 0;
    let lastPercent = -1;
    let lit = 0;
    let visible = true;

    const later = (ms: number, run: () => void) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        run();
      }, ms);
      timers.add(timer);
    };

    function setProgress(value: number) {
      progress = value;
      if (photoColor) {
        photoColor.style.clipPath = `inset(0 ${((1 - value) * 100).toFixed(2)}% 0 0)`;
        photoColor.style.opacity = (value * 0.7).toFixed(3);
      }
      shade.style.opacity = (1 - value * 0.55).toFixed(3);
      charge.style.transform = `translateX(${((value - 1) * 101).toFixed(2)}%)`;
      ring.style.strokeDashoffset = (100 - value * 100).toFixed(2);
      // a zero-length round cap would still paint a dot
      ring.style.opacity = value > 0.004 ? "1" : "0";
      const count = litCellCount(value);
      if (count !== lit) {
        cells.forEach((cell, index) => cell.toggleAttribute("data-lit", index < count));
        lit = count;
      }
    }

    function drawRim(now: number) {
      const frame = rimFrame(rim, progress, mode === "hold", now);
      spin.style.transform = `rotate(${frame.tail.toFixed(2)}deg)`;
      fill.style.transform = `rotate(${frame.start.toFixed(2)}deg)`;
      fill.style.opacity = (frame.body * 0.95).toFixed(3);
      bladeRight.style.transform = `rotate(${Math.min(frame.fill, 180).toFixed(2)}deg)`;
      bladeLeft.style.transform = `rotate(${Math.max(0, frame.fill - 180).toFixed(2)}deg)`;
    }

    function wantsFrame() {
      if (mode === "hold" || mode === "drain") return true;
      return mode === "idle" && activeRef.current && visible && !reduced && document.visibilityState === "visible";
    }

    function schedule() {
      if (!raf && wantsFrame()) raf = requestAnimationFrame(loop);
    }

    function loop(now: number) {
      raf = 0;
      if (mode === "hold") {
        const value = Math.min(1, from + (now - start) / PASSPORT_HOLD_MS);
        setProgress(value);
        const percent = Math.round(value * 100);
        if (percent !== lastPercent) {
          text.textContent = fmt(callbacksRef.current.dict.holdPercent, { percent });
          lastPercent = percent;
        }
        while (tickIndex < PASSPORT_CELL_TICKS.length && value >= PASSPORT_CELL_TICKS[tickIndex]) {
          fairHaptic(14);
          tickIndex += 1;
        }
        if (value > 0.8) {
          const jitter = (value - 0.78) * 6;
          card!.style.transform = `scale(${(0.985 - (value - 0.78) * 0.02).toFixed(4)}) translate(${((Math.random() - 0.5) * jitter).toFixed(2)}px, ${((Math.random() - 0.5) * jitter).toFixed(2)}px)`;
        }
        drawRim(now);
        if (value >= 1) {
          finish();
          return;
        }
      } else if (mode === "drain") {
        const k = (now - start) / PASSPORT_DRAIN_MS;
        setProgress(drainProgress(from, k));
        if (k >= 1) mode = "idle";
        drawRim(now);
      } else if (mode === "idle") {
        drawRim(now);
      }
      schedule();
    }

    function begin(event?: PointerEvent) {
      if (mode === "done" || mode === "hold") return;
      if (event && event.button !== 0) return;
      callbacksRef.current.onActivate(modelId);
      const now = performance.now();
      anchorRim(rim, now);
      mode = "hold";
      from = progress;
      start = now;
      tickIndex = nextTickIndex(progress);
      card!.setAttribute("data-charging", "");
      card!.style.transition = "transform 160ms ease";
      card!.style.transform = "scale(.985)";
      hint.removeAttribute("data-show");
      if (reduced) {
        setProgress(1);
        finish();
        return;
      }
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      schedule();
    }

    function release() {
      if (mode !== "hold") return;
      mode = "drain";
      card!.removeAttribute("data-charging");
      card!.style.transform = "";
      if (progress > 0.04) {
        hint.setAttribute("data-show", "");
        later(1400, () => hint.removeAttribute("data-show"));
        fairHaptic(5);
      }
      from = progress;
      start = performance.now();
      text.textContent = callbacksRef.current.dict.holdToUnlock;
      lastPercent = -1;
      schedule();
    }

    function finish() {
      mode = "done";
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      card!.removeAttribute("data-charging");
      card!.style.transform = "";
      card!.style.transition = "";
      fairHaptic([45, 45, 110]);
      if (reduced) {
        settle();
        return;
      }
      burst();
      later(UNLOCK_SETTLE_MS, settle);
    }

    function settle() {
      part("burst")?.replaceChildren();
      setPhase("done");
      callbacksRef.current.onUnlocked(modelId);
    }

    function burst() {
      const layer = part("burst")!;
      const x = card!.clientWidth - 30;
      const y = card!.clientHeight * 0.5;
      const spawn = (className: string) => {
        const node = document.createElement("span");
        node.className = className;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        layer.appendChild(node);
        return node;
      };

      // 1. bloom + shockwave + sparks from the leading edge
      spawn(styles.bloom).animate(
        [{ opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "scale(4.5)", offset: 0.35 }, { opacity: 0, transform: "scale(9)" }],
        { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
      );
      spawn(styles.wave).animate(
        [{ opacity: 0.95, transform: "scale(.4)" }, { opacity: 0, transform: "scale(9)" }],
        { duration: 760, easing: "cubic-bezier(.15,.75,.25,1)", fill: "forwards" },
      );
      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2 + Math.random() * 0.3;
        const distance = 70 + Math.random() * 90;
        const degrees = (angle * 180) / Math.PI + 90;
        spawn(styles.spark).animate(
          [
            { opacity: 1, transform: `rotate(${degrees}deg) translateY(0) scaleY(.4)` },
            { opacity: 1, transform: `rotate(${degrees}deg) translateY(${-distance * 0.55}px) scaleY(1.2)`, offset: 0.4 },
            { opacity: 0, transform: `rotate(${degrees}deg) translateY(${-distance}px) scaleY(.2)` },
          ],
          { duration: 640 + Math.random() * 200, delay: 40, easing: "cubic-bezier(.1,.8,.3,1)", fill: "both" },
        );
      }

      // 2. energy completes, colour floods in, rim pulses then fades
      setProgress(1);
      anchorRim(rim, performance.now());
      drawRim(performance.now());
      photoColor?.animate([{ opacity: 0.7 }, { opacity: 1 }], { duration: 260, fill: "forwards" });
      part("flash")?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
      shade.animate([{ opacity: 0.45 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
      charge.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: 120, fill: "forwards" });
      part("runner")?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 900, fill: "forwards", easing: "ease-out" });
      part("rim-glow")?.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.25 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
      part("cells")?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 560, fill: "forwards", easing: "ease-out" });
      part("cells-flash")?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 560, easing: "ease-out" });

      // 3. shackle opens, lock flies off, card pops, light sweep, label
      part("shackle")?.animate(
        [{ transform: "none" }, { transform: "translateY(-3px)", offset: 0.45 }, { transform: "translateY(-3px) rotate(-32deg)" }],
        { duration: 300, fill: "forwards", easing: "cubic-bezier(.3,.7,.3,1)" },
      );
      part("lock")?.animate(
        [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translate(-6px,-18px) rotate(-18deg) scale(.6)" }],
        { duration: 360, delay: 230, fill: "forwards", easing: "ease-in" },
      );
      part("pill")?.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.3)" }], { duration: 260, fill: "forwards" });
      part("chip")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
      card!.animate(
        [{ transform: "scale(.97)" }, { transform: "scale(1.04)", offset: 0.35 }, { transform: "scale(.995)", offset: 0.7 }, { transform: "scale(1)" }],
        { duration: 760, easing: "cubic-bezier(.2,.9,.2,1)" },
      );
      part("sweep")?.animate(
        [{ opacity: 1, transform: "translateX(-110%)" }, { opacity: 1, transform: "translateX(110%)" }],
        { duration: 820, delay: 180, easing: "cubic-bezier(.5,0,.2,1)" },
      );
      part("accent")?.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 480, delay: 360, fill: "forwards", easing: "cubic-bezier(.2,.9,.2,1)" });
      const label = part("label");
      label?.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 420, fill: "forwards" });
      label?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 2600, fill: "forwards" });
      part("name-glow")?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 1200, delay: 200 });
    }

    const onPointerDown = (event: PointerEvent) => {
      hit.setPointerCapture?.(event.pointerId);
      begin(event);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === " " || event.key === "Enter") && !event.repeat) {
        event.preventDefault();
        begin();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        release();
      }
    };
    const onContextMenu = (event: Event) => event.preventDefault();
    // Assistive tech (TalkBack, Switch Control) activates with a synthetic
    // click and no pointer/keyboard hold: unlock directly instead of trapping it.
    const onClick = (event: MouseEvent) => {
      if (event.detail !== 0 || mode === "hold" || mode === "done") return;
      begin();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (card.hasAttribute("data-charging")) {
        setProgress(1);
        finish();
      }
    };
    const onVisibility = () => schedule();

    hit.addEventListener("pointerdown", onPointerDown);
    hit.addEventListener("pointerup", release);
    hit.addEventListener("pointercancel", release);
    hit.addEventListener("lostpointercapture", release);
    hit.addEventListener("blur", release);
    hit.addEventListener("contextmenu", onContextMenu);
    hit.addEventListener("click", onClick);
    hit.addEventListener("keydown", onKeyDown);
    hit.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibility);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      schedule();
    });
    observer.observe(card);

    engineRef.current = { schedule };
    drawRim(performance.now());
    schedule();

    return () => {
      engineRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      hit.removeEventListener("pointerdown", onPointerDown);
      hit.removeEventListener("pointerup", release);
      hit.removeEventListener("pointercancel", release);
      hit.removeEventListener("lostpointercapture", release);
      hit.removeEventListener("blur", release);
      hit.removeEventListener("contextmenu", onContextMenu);
      hit.removeEventListener("click", onClick);
      hit.removeEventListener("keydown", onKeyDown);
      hit.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [modelId]);

  const done = phase === "done";

  return (
    <div
      ref={rootRef}
      className={`${styles.modelCard} ${styles.unlockCard}`}
      data-phase={phase}
      data-passport-model={modelId}
      role={done ? "article" : undefined}
      aria-label={done ? fmt(dict.modelUnlockedAria, { model: modelName }) : undefined}
    >
      <span className={styles.modelMedia}>
        {photo ? (
          <Image fill sizes="(max-width: 620px) 100vw, 560px" src={photo} alt="" preload={preload} className={`${styles.modelPhoto} ${styles.unlockPhoto}`} />
        ) : (
          <CarFront className={styles.modelFallback} aria-hidden="true" />
        )}
      </span>
      {photo ? (
        <span data-u="color" className={styles.unlockPhotoColor} aria-hidden="true">
          <Image fill sizes="(max-width: 620px) 100vw, 560px" src={photo} alt="" className={styles.modelPhoto} />
        </span>
      ) : null}
      <span className={styles.modelTextGradient} aria-hidden="true" />
      <span data-u="shade" className={styles.unlockShade} aria-hidden="true" />
      <span data-u="charge" className={styles.unlockCharge} aria-hidden="true" />
      {!done ? (
        <span data-u="cells" className={styles.unlockCells} aria-hidden="true">
          {CELLS.map((cell) => <i key={cell} data-u="cell" />)}
          <span data-u="cells-flash" className={styles.unlockCellsFlash} />
        </span>
      ) : null}
      <span data-u="runner" className={styles.runner} aria-hidden="true">
        <span data-u="spin" className={styles.runnerSpin} />
        <span data-u="fill" className={styles.rimFill}>
          <span className={styles.rimHalfRight}><span data-u="blade-r" /></span>
          <span className={styles.rimHalfLeft}><span data-u="blade-l" /></span>
        </span>
        <span data-u="rim-glow" className={styles.rimGlow} />
      </span>
      <span data-u="flash" className={styles.unlockFlash} aria-hidden="true" />
      <span data-u="sweep" data-card-sweep className={styles.cardSweep} aria-hidden="true" />
      <span data-card-flash className={styles.cardFlash} aria-hidden="true" />
      <span data-u="accent" className={styles.modelAccent} aria-hidden="true" />
      <span data-u="name-glow" className={styles.nameGlow} aria-hidden="true" />
      <strong>
        <small data-u="label" className={styles.unlockLabel}>{dict.unlockedLabel}</small>
        {modelName}
      </strong>
      {!done ? (
        <>
          <span data-u="lock" className={styles.lockState} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }}>
              <rect width="18" height="11" x="3" y="11" rx="2" />
              <path data-u="shackle" d="M7 11V7a5 5 0 0 1 10 0v4" style={{ transformBox: "fill-box", transformOrigin: "0% 100%" }} />
            </svg>
          </span>
          <span data-u="chip" className={styles.newChip} aria-hidden="true">{dict.newStamp}</span>
          <span data-u="pill" className={styles.holdPill} aria-hidden="true">
            <span className={styles.holdRing}>
              <svg viewBox="0 0 36 36">
                <circle className={styles.holdRingTrack} cx="18" cy="18" r="15.9" pathLength={100} />
                <circle data-u="ring" className={styles.holdRingValue} cx="18" cy="18" r="15.9" pathLength={100} />
              </svg>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </span>
            </span>
            <span data-u="text">{dict.holdToUnlock}</span>
          </span>
        </>
      ) : null}
      <span data-u="burst" className={styles.burst} aria-hidden="true" />
      <span data-u="hint" className={styles.holdHint} aria-hidden="true">{dict.holdToEnd}</span>
      {!done ? (
        <button
          ref={hitRef}
          type="button"
          className={styles.unlockHit}
          aria-label={fmt(dict.holdToUnlockAria, { model: `${brand} ${modelName}` })}
        />
      ) : null}
    </div>
  );
}
