"use client";

// Mounts once in the shell, renders nothing. One IntersectionObserver — with the
// root shrunk from the bottom by TEXT_REVEAL.enterRatio — reveals every copy
// element once, word by word in random order, blurred and lifted, as it crosses
// 20% above the viewport bottom. Everything is scoped to [data-text-reveal-root]
// so admin/editor routes (which never render that attribute) are untouched.
//
// See .agents/skills/text-reveal/SKILL.md.

import { useEffect } from "react";
import { gsap } from "gsap";
import {
  TEXT_REVEAL,
  candidateSelector,
  skipSelector,
} from "@/constants/textRevealConfig";
import { splitWords } from "@/lib/textReveal";

export function TextRevealGlobal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-text-reveal-root]");
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const isCandidate = (el: Element): el is HTMLElement =>
      el instanceof HTMLElement &&
      !el.closest(skipSelector) &&
      // innermost copy only — skip a candidate that wraps another candidate
      !el.querySelector(candidateSelector) &&
      Boolean(el.textContent && el.textContent.trim());

    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(candidateSelector),
    ).filter(isCandidate);

    const reveal = (el: HTMLElement) => {
      if (el.dataset.revealState) return;
      el.dataset.revealState = "pending";

      const display = getComputedStyle(el).display;
      const isFlexOrGrid = /flex|grid/.test(display);
      const wordCount = (el.textContent ?? "").trim().split(/\s+/).length;

      // A flex/grid line, or copy longer than maxWords, arrives as one block —
      // splitting it would turn the words into flex/grid items and drop every
      // gap between them.
      if (isFlexOrGrid || wordCount > TEXT_REVEAL.maxWords) {
        gsap.fromTo(
          el,
          { opacity: 0, y: TEXT_REVEAL.blockLift, filter: `blur(${TEXT_REVEAL.blur}px)` },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: TEXT_REVEAL.blockDuration,
            ease: "power2.out",
            onComplete: () => {
              el.dataset.revealState = "done";
              gsap.set(el, { clearProps: "filter,transform" });
            },
          },
        );
        return;
      }

      const words = splitWords(el);
      // Un-hide the element itself (the stylesheet held it at opacity 0); the
      // words carry the hiding now, so there is no flash.
      gsap.set(el, { opacity: 1 });

      if (words.length === 0) {
        el.dataset.revealState = "done";
        return;
      }

      gsap.fromTo(
        words,
        { opacity: 0, y: TEXT_REVEAL.wordLift, filter: `blur(${TEXT_REVEAL.blur}px)` },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: TEXT_REVEAL.wordDuration,
          ease: "power2.out",
          stagger: { each: TEXT_REVEAL.wordStagger, from: "random" },
          onComplete: () => {
            el.dataset.revealState = "done";
            gsap.set(words, { clearProps: "filter,transform" });
          },
        },
      );
    };

    // Copy that never enters the viewport never comes back — so anything the
    // stylesheet hid must be revealed. If a very fast scroll carries a block
    // past the top before the observer catches the crossing, show it at once
    // rather than leaving it stranded at opacity 0.
    const showInstant = (el: HTMLElement) => {
      if (el.dataset.revealState) return;
      el.dataset.revealState = "done";
      gsap.set(el, { opacity: 1 });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            reveal(el);
            observer.unobserve(el);
          } else if (entry.boundingClientRect.bottom <= 0) {
            showInstant(el);
            observer.unobserve(el);
          }
        }
      },
      {
        rootMargin: `0px 0px -${TEXT_REVEAL.enterRatio * 100}% 0px`,
        threshold: 0,
      },
    );

    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return null;
}
