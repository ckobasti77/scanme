"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function SiteScrollMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        const compact = window.innerWidth < 768;
        const revealOffset = compact ? 20 : 36;

        gsap.utils.toArray<HTMLElement>("[data-reveal-group]", root).forEach((group) => {
          const revealStart = group.dataset.revealStart ?? "84";
          const items = Array.from(group.children).filter(
            (child): child is HTMLElement =>
              child instanceof HTMLElement && !child.hasAttribute("data-reveal-skip"),
          );

          if (items.length === 0) return;

          gsap.fromTo(
            items,
            { autoAlpha: 0, y: revealOffset },
            {
              autoAlpha: 1,
              y: 0,
              duration: compact ? 0.56 : 0.7,
              stagger: compact ? 0.045 : 0.065,
              ease: "power3.out",
              scrollTrigger: {
                trigger: group,
                start: `top ${revealStart}%`,
                once: true,
              },
            },
          );
        });

        gsap.utils
          .toArray<HTMLElement>("[data-reveal-item]", root)
          .filter((item) => !item.closest("[data-reveal-group]"))
          .forEach((item) => {
            gsap.fromTo(
              item,
              { autoAlpha: 0, y: revealOffset },
              {
                autoAlpha: 1,
                y: 0,
                duration: compact ? 0.56 : 0.7,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: item,
                  start: "top 86%",
                  once: true,
                },
              },
            );
          });

        gsap.utils.toArray<HTMLElement>("[data-parallax]", root).forEach((layer) => {
          const configuredAmount = Number(layer.dataset.parallax) || 8;
          const amount = compact ? configuredAmount * 0.55 : configuredAmount;
          const trigger = layer.closest<HTMLElement>("[data-parallax-root]") ?? layer.parentElement;

          if (!trigger) return;

          gsap.fromTo(
            layer,
            { yPercent: -amount },
            {
              yPercent: amount,
              ease: "none",
              scrollTrigger: {
                trigger,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.65,
                invalidateOnRefresh: true,
              },
            },
          );
        });
      }, root);

      ScrollTrigger.refresh();
      return () => context.revert();
    });

    return () => media.revert();
  }, []);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
