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

        // Copy entrances are owned by the site-wide word-by-word reveal
        // (TextRevealGlobal). This component keeps only the scroll parallax so
        // the two never fight over the same element's opacity.
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
