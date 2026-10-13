"use client";

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ADMIN_IGNITE_CURVE, ADMIN_REVEAL_EASE } from "@/lib/admin-v2/motion";

// ADMIN v3 V1 — the one place the admin registers GSAP plugins. The site uses
// ScrollTrigger over the window; the admin never calls `ScrollTrigger.defaults()`
// or `normalizeScroll`, never pins, and every admin trigger names its own
// scroller (the screen of the frame). `Flip` (the flight of a spark to the XP
// chip) is registered by V4, the first step that uses it.

let registered = false;

/** GSAP with the admin's plugins and its one custom curve; safe to call on every run. */
export function adminMotion() {
  if (!registered && typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase);
    CustomEase.create(ADMIN_REVEAL_EASE.ignite, ADMIN_IGNITE_CURVE);
    registered = true;
  }
  return { gsap, ScrollTrigger, SplitText };
}
