"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { ADMIN_DURATION, ADMIN_EASE } from "@/lib/admin-v2/motion";
import { gsap, prefersReducedMotion } from "./use-admin-gsap";

// ADMIN v2 X4 — the chips of the active filters enter and leave (ZADATAK §7).
// A chip that appears fades in and grows a little, the chips beside a removed
// one slide into its place, and the removed chip fades out as a copy left for
// a moment where it stood (React has already taken the real one away). Nothing
// moves on the first render: the chips a link arrived with are simply there.
// The last chip leaves with its whole block, at once.

type Seen = { node: HTMLElement; left: number; top: number; width: number; height: number };

/** `root` holds the chips (`[data-chip="<id>"]` inside one positioned list); `ids` are the chips shown now. */
export function useChipMotion(root: RefObject<HTMLElement | null>, ids: readonly string[]): void {
  const last = useRef<Map<string, Seen> | null>(null);
  const signature = ids.join("\n");

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const now = new Map<string, Seen>();
    // Places inside the list (its offset parent), so a change above the chips is never read as a move.
    for (const node of element.querySelectorAll<HTMLElement>("[data-chip]")) {
      now.set(node.dataset.chip ?? "", { node, left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight });
    }
    const previous = last.current;
    last.current = now;
    if (!previous) return;

    const reduced = prefersReducedMotion();
    const list = element.querySelector<HTMLElement>("[data-chip-list]");
    const ghosts: HTMLElement[] = [];
    const context = gsap.context(() => {
      for (const [id, chip] of now) {
        const old = previous.get(id);
        if (!old) {
          gsap.from(chip.node, { opacity: 0, ...(reduced ? {} : { scale: 0.9 }), duration: ADMIN_DURATION.state, ease: ADMIN_EASE.out, clearProps: "opacity,transform" });
        } else if (!reduced && (Math.abs(old.left - chip.left) >= 1 || Math.abs(old.top - chip.top) >= 1)) {
          gsap.from(chip.node, { x: old.left - chip.left, y: old.top - chip.top, duration: ADMIN_DURATION.state, ease: ADMIN_EASE.out, clearProps: "transform" });
        }
      }
      if (!list) return;
      for (const [id, old] of previous) {
        if (now.has(id)) continue;
        const ghost = old.node.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("data-chip");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        Object.assign(ghost.style, { position: "absolute", left: `${old.left}px`, top: `${old.top}px`, width: `${old.width}px`, height: `${old.height}px`, margin: "0", pointerEvents: "none" });
        list.appendChild(ghost);
        ghosts.push(ghost);
        gsap.to(ghost, { opacity: 0, ...(reduced ? {} : { scale: 0.9 }), duration: ADMIN_DURATION.feedback, ease: ADMIN_EASE.in, onComplete: () => ghost.remove() });
      }
    }, element);
    return () => {
      context.revert();
      for (const ghost of ghosts) ghost.remove();
    };
  }, [root, signature]);
}
