"use client";

import gsap from "gsap";
import { useEffect, useLayoutEffect, type DependencyList, type RefObject } from "react";

// ADMIN v2 X4 — the one way the admin runs GSAP (ZADATAK §7): inside a
// gsap.context scoped to an element, reverted when the dependencies change or
// the component leaves, so no tween outlives its element. `reduced` is
// `prefers-reduced-motion` at the moment the effect runs: with it nothing
// moves, a change may only fade. Nothing here runs on the server, and the
// content never depends on it (it is visible without JavaScript).

export { gsap };

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export type AdminGsapRun = (tools: { reduced: boolean }) => void;

/** Runs `run` after the commit (useEffect) inside a context scoped to `scope`. */
export function useAdminGsap(run: AdminGsapRun, deps: DependencyList, scope?: RefObject<Element | null>): void {
  useEffect(() => {
    const context = gsap.context(() => run({ reduced: prefersReducedMotion() }), scope?.current ?? undefined);
    return () => context.revert();
    // The caller lists what the animation depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** The same before the browser paints (FLIP: the element is measured and moved back in one frame). */
export function useAdminGsapLayout(run: AdminGsapRun, deps: DependencyList, scope?: RefObject<Element | null>): void {
  useLayoutEffect(() => {
    const context = gsap.context(() => run({ reduced: prefersReducedMotion() }), scope?.current ?? undefined);
    return () => context.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
