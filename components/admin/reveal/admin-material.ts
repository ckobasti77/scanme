"use client";

import { REDUCED_MOTION_QUERY } from "@/components/admin/frame/use-admin-gsap";
import { ADMIN_EASE, ADMIN_MATERIAL } from "@/lib/admin-v2/motion";
import { adminMotion } from "./gsap-plugins";

// ADMIN v3 V1 — the material of the admin (ZADATAK-V3 §2; plan §2.8): primary
// buttons that lean towards the cursor (at most 6 px) and number tiles that
// tilt (at most 3°). One delegated `pointermove` on the screen, handled once
// per frame; only on a device with a fine pointer, never with reduced motion
// or in the quiet mode. Only `transform` changes.

const POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const MAGNETS = '[data-admin-primitive="page-header"] .admin-button-primary, [data-admin-magnet]';
/** How often the list of magnetic buttons is read again (ms). */
const MAGNET_SCAN_MS = 600;

export function attachMaterial(screen: HTMLElement): () => void {
  if (!window.matchMedia(POINTER_QUERY).matches || window.matchMedia(REDUCED_MOTION_QUERY).matches) return () => undefined;
  const { gsap } = adminMotion();

  let pointer: { x: number; y: number; target: Element | null } | null = null;
  let frame = 0;
  let tilted: HTMLElement | null = null;
  let magnets: HTMLElement[] = [];
  let magnetsAt = -Infinity;
  const pulled = new Set<HTMLElement>();

  const release = (element: HTMLElement) => {
    pulled.delete(element);
    gsap.to(element, { x: 0, y: 0, duration: ADMIN_MATERIAL.magnetOut, ease: ADMIN_EASE.out, overwrite: "auto", clearProps: "transform" });
  };
  const level = (element: HTMLElement) => {
    gsap.to(element, { rotationX: 0, rotationY: 0, duration: ADMIN_MATERIAL.tilt, ease: ADMIN_EASE.out, overwrite: "auto", clearProps: "transform" });
  };

  function draw() {
    frame = 0;
    if (!pointer) return;
    const { x, y } = pointer;
    // What stood under the pointer may be gone (a row left its list): then it is whatever is there now.
    const under = pointer.target?.isConnected ? pointer.target : document.elementFromPoint(x, y);
    const target = under && screen.contains(under) ? under : null;

    // Read first: everything that needs layout, in one go.
    const nextTilt = target?.closest<HTMLElement>("[data-admin-tilt]") ?? null;
    const tiltRect = nextTilt?.getBoundingClientRect() ?? null;
    const now = performance.now();
    if (now - magnetsAt > MAGNET_SCAN_MS) {
      magnets = [...screen.querySelectorAll<HTMLElement>(MAGNETS)];
      magnetsAt = now;
    }
    const magnetRects = magnets.map((element) => element.getBoundingClientRect());

    // Then write.
    if (tilted && tilted !== nextTilt) level(tilted);
    tilted = nextTilt;
    if (nextTilt && tiltRect && tiltRect.width > 0 && tiltRect.height > 0) {
      const px = (x - tiltRect.left) / tiltRect.width - 0.5;
      const py = (y - tiltRect.top) / tiltRect.height - 0.5;
      gsap.to(nextTilt, { rotationY: px * 2 * ADMIN_MATERIAL.tiltMax, rotationX: -py * 2 * ADMIN_MATERIAL.tiltMax, transformPerspective: 800, duration: ADMIN_MATERIAL.tilt, ease: ADMIN_EASE.out, overwrite: "auto" });
    }

    magnets.forEach((element, index) => {
      const rect = magnetRects[index];
      if (rect.width === 0) return;
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      if (Math.hypot(dx, dy) <= ADMIN_MATERIAL.magnetRadius) {
        // The rect includes the pull itself: the centre is taken without it.
        const cx = rect.left + rect.width / 2 - Number(gsap.getProperty(element, "x"));
        const cy = rect.top + rect.height / 2 - Number(gsap.getProperty(element, "y"));
        const clamp = (value: number) => Math.max(-ADMIN_MATERIAL.magnetMax, Math.min(ADMIN_MATERIAL.magnetMax, value * 0.3));
        pulled.add(element);
        gsap.to(element, { x: clamp(x - cx), y: clamp(y - cy), duration: ADMIN_MATERIAL.magnetIn, ease: ADMIN_EASE.out, overwrite: "auto" });
      } else if (pulled.has(element)) {
        release(element);
      }
    });
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    pointer = { x: event.clientX, y: event.clientY, target: event.target instanceof Element ? event.target : null };
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const onLeave = () => {
    pointer = null;
    if (tilted) level(tilted);
    tilted = null;
    for (const element of [...pulled]) release(element);
  };

  screen.addEventListener("pointermove", onMove, { passive: true });
  screen.addEventListener("pointerleave", onLeave);
  return () => {
    screen.removeEventListener("pointermove", onMove);
    screen.removeEventListener("pointerleave", onLeave);
    if (frame) cancelAnimationFrame(frame);
    for (const element of [tilted, ...pulled]) {
      if (!element) continue;
      gsap.killTweensOf(element);
      gsap.set(element, { clearProps: "transform" });
    }
  };
}
