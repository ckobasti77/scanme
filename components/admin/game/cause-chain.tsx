"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/components/admin/frame/use-admin-gsap";
import { adminMotion } from "@/components/admin/reveal/gsap-plugins";
import { approachAngle, barImpact, curveControl, curveHeading, curvePoint, inView, labelPlace, sparkSeconds, tailLength, type Point } from "@/lib/admin-v2/game/spark";
import { ADMIN_DURATION, ADMIN_EASE, ADMIN_SPARK } from "@/lib/admin-v2/motion";
import { quietModeStore } from "@/lib/admin-v2/quiet-mode";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { useGameApi } from "./game-context";
import { useGameInternal } from "./game-provider";

// ADMIN v3 V5 — the chain of cause (plan, signature moment 4): XP my action has
// just carried is one flight of a comet. It starts where I acted (the star or
// the row of the solved item), strikes the bar of the boss of the day and lands
// in the XP chip of the navbar, whose ring then fills. The comet is a round
// bright head with a glow and a tail of ADMIN_SPARK.tail px that fades behind it
// and always points back along the path (the legs are gentle arcs and the tail
// turns with them). The strike flashes on the bar, the landing sends one ring
// around the chip, and „+XP“ stands in a small pill inside the navbar beside the
// chip. Decoration over the screen: no pointer events, hidden from a screen
// reader, transform and opacity only, under 1.8 s. Nothing flies in the quiet
// mode, with reduced motion, on a hidden tab or where the ring of the level is
// not on the screen (a phone); the numbers change all the same.

/** The timing of the flight: the tokens of motion.ts (kept as an export for the tests). */
export const SPARK = ADMIN_SPARK;

const centre = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** The element of this kind that is on the screen now (the level ring is in the chip, or around the profile icon). */
function visible(selector: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

const GLOW = "color-mix(in srgb, var(--admin-nav-line) 75%, transparent)";
const GLOW_WIDE = "color-mix(in srgb, var(--admin-nav-line) 35%, transparent)";

function part(css: string, name?: string): HTMLSpanElement {
  const element = document.createElement("span");
  if (name) element.setAttribute(name, "");
  element.style.cssText = css;
  return element;
}

/** A ring or a burst that stays at one point and only scales and fades. */
function mark(at: Point, size: number, css: string, name: string): HTMLSpanElement {
  return part(`position:absolute;left:${at.x}px;top:${at.y}px;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:9999px;opacity:0;will-change:transform,opacity;${css}`, name);
}

/** The bar shakes once as the comet strikes it, unless its own hit is shaking it at this moment. */
function jolt(bar: HTMLElement) {
  if (gsap.isTweening(bar)) return;
  const step = ADMIN_SPARK.strike / 4;
  gsap
    .timeline({ defaults: { ease: "none" } })
    .to(bar, { x: -2, duration: step })
    .to(bar, { x: 2, duration: step * 2 })
    .to(bar, { x: 0, duration: step, clearProps: "transform" });
}

function fly(host: HTMLElement, aim: Point | null, xp: number, flights: Set<gsap.core.Timeline>) {
  const chip = visible("[data-admin-xp-ring]");
  if (!chip) return;
  adminMotion();
  const chipRect = chip.getBoundingClientRect();
  const end = centre(chipRect);
  const bar = visible('[data-game-boss] [role="progressbar"]');
  const barRect = bar?.getBoundingClientRect() ?? null;
  // A bar that is scrolled out of the screen of the frame (under the navbar, or below the fold) is not struck: the comet goes straight to the chip.
  const screen = document.querySelector('main[data-admin-frame="screen"]')?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
  const boss = bar && barRect && inView(barRect, screen) ? barImpact(barRect, Number(bar.getAttribute("aria-valuenow")), Number(bar.getAttribute("aria-valuemax"))) : null;
  // Without a place of the action the comet comes from the boss, or rises into the chip from below it.
  const start = aim ?? boss ?? { x: end.x, y: end.y + 72 };
  const viaBoss = aim !== null && boss !== null;
  const time = sparkSeconds(viaBoss);
  const first = viaBoss ? boss! : end;
  const length = Math.hypot(first.x - start.x, first.y - start.y) + (viaBoss ? Math.hypot(end.x - boss!.x, end.y - boss!.y) : 0);

  // The box of the comet is its real size (the tail and half of the head); its head is the point it flies on and turns about.
  const reach = tailLength(length);
  const across = ADMIN_SPARK.head;
  const comet = part(`position:absolute;left:${-reach}px;top:${-across / 2}px;width:${reach + across / 2}px;height:${across}px;opacity:0;will-change:transform,opacity;`, "data-admin-spark");
  const tail = part(`position:absolute;left:0;top:50%;margin-top:-4px;width:${reach}px;height:8px;background:linear-gradient(90deg,transparent,${GLOW});clip-path:polygon(0 50%,100% 12%,100% 88%);transform-origin:100% 50%;`);
  const head = part(`position:absolute;left:${reach - across / 2}px;top:0;width:${across}px;height:${across}px;border-radius:9999px;background:radial-gradient(circle at 40% 40%,#fff 0 35%,var(--admin-nav-line) 78%);box-shadow:0 0 6px 2px ${GLOW},0 0 16px 5px ${GLOW_WIDE};`);
  comet.append(tail, head);

  const label = part("position:absolute;left:0;top:0;padding:2px 8px;border:1px solid var(--admin-border);border-radius:9999px;background:var(--admin-surface-strong);box-shadow:0 2px 8px rgb(0 0 0/0.16);font-size:0.75rem;line-height:1.25;font-weight:600;white-space:nowrap;color:var(--admin-nav-current);opacity:0;will-change:transform,opacity;", "data-admin-spark-label");
  label.textContent = fmt(d.operator.gain, { xp });

  const arrival = mark(end, 32, `border:2px solid var(--admin-nav-line);box-shadow:0 0 8px ${GLOW};`, "data-admin-spark-ring");
  const strike = viaBoss ? mark(boss!, 40, `border:2px solid var(--admin-nav-line);box-shadow:0 0 10px ${GLOW};`, "data-admin-spark-strike") : null;
  const flash = viaBoss ? mark(boss!, 18, `background:radial-gradient(circle,#fff 0 30%,var(--admin-nav-line) 62%,transparent 72%);`, "data-admin-spark-strike") : null;
  const parts = [comet, ...(strike && flash ? [strike, flash] : []), arrival, label];
  host.append(...parts);
  // Measured after it is in the layer: the pill sits beside the chip, centred on it, inside the navbar and the viewport.
  const size = label.getBoundingClientRect();
  const navbar = document.querySelector('[data-admin-frame="navbar"]')?.getBoundingClientRect() ?? null;
  const place = labelPlace(chipRect, { width: size.width, height: size.height }, navbar, window.innerWidth);
  label.style.left = `${place.left}px`;
  label.style.top = `${place.top}px`;

  const flight = gsap.timeline({
    onComplete: () => {
      for (const element of parts) element.remove();
      flights.delete(flight);
    },
  });
  flights.add(flight);

  // One flight of the head along the arcs; the tail turns with the path (a little late, so a corner is a bend, not a snap).
  const firstControl = curveControl(start, first);
  let heading = curveHeading(start, firstControl, first, 0);
  gsap.set(tail, { transformOrigin: "100% 50%" });
  gsap.set(comet, { transformOrigin: `${reach}px 50%`, x: start.x, y: start.y, rotation: heading, opacity: 1 });
  const leg = (from: Point, to: Point, at: number, duration: number, ease: string) => {
    const control = from === start ? firstControl : curveControl(from, to);
    const run = { t: 0 };
    flight.to(
      run,
      {
        t: 1,
        duration,
        ease,
        onUpdate: () => {
          const point = curvePoint(from, control, to, run.t);
          heading = approachAngle(heading, curveHeading(from, control, to, run.t), 0.4);
          gsap.set(comet, { x: point.x, y: point.y, rotation: heading });
        },
      },
      at,
    );
  };
  // It speeds up into the boss and is thrown out of the strike, slowing as it comes into the chip.
  if (viaBoss) leg(start, boss!, 0, time.toBoss, ADMIN_EASE.in);
  leg(viaBoss ? boss! : start, end, time.toBoss, time.toChip, ADMIN_EASE.out);
  flight.fromTo(tail, { scaleX: 0.15 }, { scaleX: 1, duration: ADMIN_SPARK.fade, ease: ADMIN_EASE.out }, 0);

  // The strike on the bar of the boss: a ring and a flash at the point of impact, and one jolt of the bar.
  if (viaBoss && strike && flash && bar) {
    flight.fromTo(strike, { scale: 0.3, opacity: 1 }, { scale: 1.7, opacity: 0, duration: ADMIN_SPARK.strike, ease: ADMIN_EASE.out, immediateRender: false }, time.toBoss);
    flight.fromTo(flash, { scale: 1.5, opacity: 1 }, { scale: 0.3, opacity: 0, duration: ADMIN_SPARK.strike, ease: ADMIN_EASE.out, immediateRender: false }, time.toBoss);
    flight.call(() => jolt(bar), undefined, time.toBoss);
  }

  // The landing: the tail is drawn in and the comet is gone, the chip takes it (its ring swells and one ring goes out
  // around it), and the gain is said in the pill beside it.
  flight.to(comet, { opacity: 0, duration: ADMIN_SPARK.fade, ease: ADMIN_EASE.in, onComplete: () => comet.remove() }, time.landing);
  flight.to(tail, { scaleX: 0.2, duration: ADMIN_SPARK.fade, ease: ADMIN_EASE.in }, time.landing);
  const swell = visible("[data-admin-xp-ring]");
  if (swell) flight.fromTo(swell, { scale: 1 }, { scale: 1.25, duration: ADMIN_DURATION.feedback, ease: ADMIN_EASE.out, yoyo: true, repeat: 1, transformOrigin: "50% 50%", clearProps: "transform" }, time.landing);
  flight.fromTo(arrival, { scale: 0.8, opacity: 0.9 }, { scale: 2.2, opacity: 0, duration: ADMIN_SPARK.ring, ease: ADMIN_EASE.out, immediateRender: false }, time.landing);
  flight.fromTo(label, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: ADMIN_SPARK.fade, ease: ADMIN_EASE.out, immediateRender: false }, time.landing);
  flight.to(label, { opacity: 0, duration: ADMIN_SPARK.label * 0.4, ease: ADMIN_EASE.in }, time.landing + ADMIN_SPARK.label * 0.6);
}

export function CauseChain() {
  const { store } = useGameApi();
  const internal = useGameInternal();
  const host = useRef<HTMLDivElement>(null);
  const flights = useRef(new Set<gsap.core.Timeline>());

  useEffect(
    () =>
      store.onEffect((effect) => {
        if (effect.type !== "gain" || !host.current) return;
        const aim = internal?.takeAim() ?? null;
        if (quietModeStore.get() || prefersReducedMotion() || document.visibilityState !== "visible") return;
        fly(host.current, aim, effect.xp, flights.current);
      }),
    [store, internal],
  );
  useEffect(() => {
    const element = host.current;
    const running = flights.current;
    return () => {
      for (const flight of running) flight.kill();
      running.clear();
      if (element) {
        gsap.killTweensOf(element.children);
        element.replaceChildren();
      }
    };
  }, []);

  return <div ref={host} data-admin-spark-layer="" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[71] overflow-hidden" />;
}
