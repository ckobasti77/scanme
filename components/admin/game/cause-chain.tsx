"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/components/admin/frame/use-admin-gsap";
import { ADMIN_DURATION, ADMIN_EASE } from "@/lib/admin-v2/motion";
import { quietModeStore } from "@/lib/admin-v2/quiet-mode";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { useGameApi } from "./game-context";
import { useGameInternal } from "./game-provider";

// ADMIN v3 V4 — the chain of cause (plan, signature moment 4): XP my action has
// just carried is one flight of a spark. It starts where I acted (the star or
// the row of the solved item), strikes the bar of the boss of the day and lands
// in the XP chip of the navbar, whose ring then fills. Decoration over the
// screen: no pointer events, hidden from a screen reader, transform and opacity
// only, about a second. Nothing flies in the quiet mode, with reduced motion, on
// a hidden tab or where the ring of the level is not on the screen (a phone);
// the numbers change all the same.

/** The flight to the bar of the boss and from there to the chip (seconds). */
export const SPARK = { toBoss: 0.25, toChip: 0.7, label: 0.9, tail: 28 } as const;

type Point = { x: number; y: number };

/** The element of this kind that is on the screen now (the level ring is in the chip, or around the profile icon). */
function visible(selector: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}
const visibleRect = (selector: string) => visible(selector)?.getBoundingClientRect() ?? null;

const centre = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const angle = (from: Point, to: Point) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

function fly(host: HTMLElement, aim: Point | null, xp: number) {
  const chip = visibleRect("[data-admin-xp-ring]");
  if (!chip) return;
  const end = centre(chip);
  const bar = visibleRect('[data-game-boss] [role="progressbar"]');
  const boss = bar ? centre(bar) : null;
  // Without a place of the action the spark comes from the boss, or rises into the chip from below it.
  const start = aim ?? boss ?? { x: end.x, y: end.y + 72 };
  const viaBoss = aim !== null && boss !== null;

  const spark = document.createElement("span");
  spark.dataset.adminSpark = "";
  // The head is the right end; the tail fades behind it.
  spark.style.cssText = `position:absolute;left:0;top:0;width:${SPARK.tail}px;height:6px;margin:-3px 0 0 -${SPARK.tail}px;border-radius:9999px;background:linear-gradient(90deg,transparent,var(--admin-nav-line));transform-origin:100% 50%;will-change:transform,opacity;`;
  const label = document.createElement("span");
  label.dataset.adminSparkLabel = "";
  label.textContent = fmt(d.operator.gain, { xp });
  label.style.cssText = `position:absolute;left:${end.x}px;top:${chip.bottom + 2}px;transform:translateX(-50%);font-size:0.75rem;font-weight:600;white-space:nowrap;color:var(--admin-nav-current);opacity:0;`;
  host.append(spark, label);

  const timeline = gsap.timeline({ onComplete: () => { spark.remove(); label.remove(); } });
  timeline.set(spark, { x: start.x, y: start.y, rotation: angle(start, viaBoss ? boss! : end), opacity: 1 });
  if (viaBoss) {
    timeline.to(spark, { x: boss!.x, y: boss!.y, duration: SPARK.toBoss, ease: ADMIN_EASE.out });
    timeline.set(spark, { rotation: angle(boss!, end) });
  }
  timeline.to(spark, { x: end.x, y: end.y, duration: SPARK.toChip, ease: "expo.inOut" });
  timeline.to(spark, { opacity: 0, duration: ADMIN_DURATION.feedback, onComplete: () => spark.remove() });
  // The chip takes the spark: its ring swells once, and the gain is said beside it.
  const ring = visible("[data-admin-xp-ring]");
  if (ring) timeline.fromTo(ring, { scale: 1 }, { scale: 1.25, duration: ADMIN_DURATION.feedback, ease: ADMIN_EASE.out, yoyo: true, repeat: 1, transformOrigin: "50% 50%", clearProps: "transform" }, "<");
  timeline.fromTo(label, { opacity: 1, y: 0 }, { opacity: 0, y: 10, duration: SPARK.label, ease: ADMIN_EASE.in }, "<");
}

export function CauseChain() {
  const { store } = useGameApi();
  const internal = useGameInternal();
  const host = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      store.onEffect((effect) => {
        if (effect.type !== "gain" || !host.current) return;
        const aim = internal?.takeAim() ?? null;
        if (quietModeStore.get() || prefersReducedMotion() || document.visibilityState !== "visible") return;
        fly(host.current, aim, effect.xp);
      }),
    [store, internal],
  );
  useEffect(() => {
    const element = host.current;
    return () => {
      if (element) gsap.killTweensOf(element.children);
    };
  }, []);

  return <div ref={host} data-admin-spark-layer="" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[65] overflow-hidden" />;
}
