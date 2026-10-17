"use client";

import { useEffect, useRef, useState } from "react";
import type { PassportCellState } from "@/lib/fair-client/passport-tickets";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { CompletionSeal } from "./stamp-art";
import styles from "./passport-tickets.module.css";

// The tear-off stub of a passport ticket: N/M, one bar per model and, once the
// passport is complete, the completion seal. Its own component so an admin-only
// "tear off" (prize claim) can be added later around `data-stub-state`.

export type PassportStubSeal = "none" | "static" | "slam";

export type PassportStubProps = {
  got: number;
  total: number;
  cells: readonly PassportCellState[];
  /** Stamped, not stuck yet: light orange stub (the "NOVO" tag sits on the ticket). */
  fresh: number;
  complete: boolean;
  /** "slam": the first time this device sees the passport complete. */
  seal: PassportStubSeal;
  sealTexts: { top: string; bottom: string; center: string; year: string };
  /** "markice" / "markica" for `total`. */
  unitLabel: string;
  /** The seal landed (or reduced motion skipped the animation). */
  onSealed?: () => void;
};

type Phase = "idle" | "filling" | "fading" | "sealed";

const BAR_GAP_MS = 150;
const START_DELAY_MS = 250;

export function PassportStub({ got, total, cells, fresh, complete, seal, sealTexts, unitLabel, onSealed }: PassportStubProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const onSealedRef = useRef(onSealed);
  const [phase, setPhase] = useState<Phase>(seal === "slam" ? "idle" : "sealed");
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    onSealedRef.current = onSealed;
  });

  // Completion moment: bars fill one by one, the numbers fade, the seal slams.
  useEffect(() => {
    if (seal !== "slam") return;
    const root = rootRef.current;
    if (!root) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const finish = () => {
      setPhase("sealed");
      onSealedRef.current?.();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      later(finish, 0);
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
    const run = () => {
      setPhase("filling");
      for (let index = 0; index < total; index++) {
        later(() => {
          setFilled(index + 1);
          root.querySelector<HTMLElement>(`[data-bar="${index}"]`)?.animate([{ transform: "scaleX(.2)" }, { transform: "none" }], { duration: 260, easing: "ease-out" });
          fairHaptic(10, { iosTick: true });
        }, START_DELAY_MS + index * BAR_GAP_MS);
      }
      const fadeAt = START_DELAY_MS + total * BAR_GAP_MS + 220;
      later(() => {
        setPhase("fading");
        root.querySelectorAll<HTMLElement>("[data-stub-count]").forEach((node) =>
          node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }),
        );
      }, fadeAt);
      later(() => {
        setPhase("sealed");
        const node = sealRef.current;
        if (node) {
          const base = getComputedStyle(node).transform;
          const from = base === "none" ? "" : base;
          node.animate(
            [
              { transform: `${from} scale(1.8)`, opacity: 0, filter: "blur(2px)" },
              { transform: `${from} scale(.93)`, opacity: 1, filter: "blur(0)", offset: 0.6 },
              { transform: `${from} scale(1)`, opacity: 1 },
            ],
            { duration: 340, easing: "cubic-bezier(.2,.8,.3,1)" },
          );
        }
        later(() => {
          fairHaptic([12, 30, 40], { iosTick: true });
          root.closest("a")?.animate([{ transform: "scale(1)" }, { transform: "scale(.985) translateY(1px)" }, { transform: "none" }], { duration: 180, easing: "ease-out" });
          onSealedRef.current?.();
        }, 200);
      }, fadeAt + 200);
    };
    // Only when the ticket is actually on screen.
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      run();
    }, { threshold: 0.6 });
    observer.observe(root.closest("a") ?? root);
    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [seal, total]);

  const animating = seal === "slam" && phase !== "sealed";
  const sealed = complete && seal !== "none" && phase === "sealed";
  const showCount = !complete || animating;
  const shownGot = animating ? filled : got;
  const state = complete ? "complete" : fresh > 0 ? "new" : "progress";

  return (
    <div ref={rootRef} className={`${styles.stub}${state === "new" ? ` ${styles.stubNew}` : ""}`} data-stub-state={state}>
      {showCount ? (
        <>
          <div className={styles.stubCount} data-stub-count>
            {shownGot}<i>/{total}</i>
          </div>
          <small data-stub-count>{unitLabel}</small>
          <div className={styles.bars} data-stub-count>
            {cells.map((cell, index) => {
              const on = animating ? index < filled : cell === "got";
              return <i key={index} data-bar={index} className={on ? styles.barOn : !animating && cell === "new" ? styles.barNew : undefined} />;
            })}
          </div>
        </>
      ) : null}
      {complete && seal !== "none" ? (
        <div ref={sealRef} className={`${styles.seal}${sealed ? ` ${styles.sealOn}` : ""}`}>
          <CompletionSeal {...sealTexts} />
        </div>
      ) : null}
    </div>
  );
}
