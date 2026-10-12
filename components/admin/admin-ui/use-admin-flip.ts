"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { gsap, prefersReducedMotion } from "@/components/admin/frame/use-admin-gsap";
import { FLIP_MAX_ITEMS, flipArmed, flipMoves, type FlipRect } from "@/lib/admin-v2/flip";
import { ADMIN_DURATION, ADMIN_EASE } from "@/lib/admin-v2/motion";

// ADMIN v2 X4 — FLIP for a filtered list (ZADATAK §7). After every commit the
// items are measured; only when the filter signature changed since the last
// commit (the URL query plus the optional `signature`, e.g. a column sort) the
// items that stayed glide from their old place, new ones fade in, gone ones
// are simply gone. A list filtered by its query gets the rows a moment later:
// the filter change stays armed for a short while (FLIP_ARMED_MS) and the first
// change of the rows uses it. Any other commit with the same signature (polling
// brought rows) only re-measures, so polling never animates the list. The item
// is the DOM node itself: React keeps the node for the same `key`.

type Snapshot = { signature: string | null; rects: Map<Element, FlipRect>; armedAt: number | null };

export function useAdminFlip(container: RefObject<HTMLElement | null>, selector: string, signature = ""): void {
  const last = useRef<Snapshot>({ signature: null, rects: new Map(), armedAt: null });

  // No dependency list on purpose: it measures after every commit.
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const previous = last.current;
    const current = `${window.location.search}|${signature}`;
    const now = performance.now();
    const armedAt = previous.signature !== null && previous.signature !== current ? now : previous.armedAt;
    const armed = flipArmed(armedAt, now);
    const items = root.querySelectorAll<HTMLElement>(selector);
    if (items.length > FLIP_MAX_ITEMS) {
      last.current = { signature: current, rects: new Map(), armedAt: null };
      return;
    }
    // One batch of reads, no writes in between.
    const origin = root.getBoundingClientRect();
    const rects = new Map<Element, FlipRect>();
    for (const item of items) {
      const box = item.getBoundingClientRect();
      rects.set(item, { left: box.left - origin.left + root.scrollLeft, top: box.top - origin.top + root.scrollTop });
    }
    const { moved, entered } = flipMoves(previous.rects, rects);
    const rowsChanged = moved.length > 0 || entered.length > 0 || previous.rects.size !== rects.size;
    // Armed and nothing changed yet (the query is still loading): the next change of the rows is the answer.
    last.current = { signature: current, rects, armedAt: armed && !rowsChanged ? armedAt : null };
    if (!armed || (!moved.length && !entered.length)) return;
    const reduced = prefersReducedMotion();
    const context = gsap.context(() => {
      if (!reduced) {
        for (const { key, dx, dy } of moved) {
          gsap.fromTo(key, { x: dx, y: dy }, { x: 0, y: 0, duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out, clearProps: "transform" });
        }
      }
      if (entered.length) {
        gsap.fromTo(entered, { opacity: 0 }, { opacity: 1, duration: ADMIN_DURATION.state, ease: ADMIN_EASE.out, clearProps: "opacity" });
      }
    }, root);
    // Reverted before the next commit measures, so a half-way item is never read.
    return () => context.revert();
  });
}
