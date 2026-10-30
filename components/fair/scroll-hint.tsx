"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FAIR_DURATION, FAIR_EASE } from "./fair-motion";

// 30 Oct 2026 (owner, AMF): the app-wide scroll indicator. A small round arrow
// sticks to the bottom edge of its scroll area while there is more content
// below; a tap scrolls smoothly to the end, where the same arrow turns 180°
// (one continuous rotation) and a tap scrolls back to the top. It fades in and
// out with the overflow. Placed as the LAST child of the scrolling element
// (`scope="parent"`) or of the page (`scope="window"`), so at the end it sits
// below the content instead of covering it.

const EDGE_PX = 24;

function scroller(node: HTMLElement | null, scope: "parent" | "window") {
  if (scope === "window") return typeof document === "undefined" ? null : (document.scrollingElement as HTMLElement | null);
  return node?.parentElement ?? null;
}

export function FairScrollHint({ scope = "parent", downLabel, upLabel }: { scope?: "parent" | "window"; downLabel: string; upLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState({ overflow: false, atEnd: false });

  useEffect(() => {
    const element = scroller(ref.current, scope);
    if (!element) return;
    const target: HTMLElement | Window = scope === "window" ? window : element;
    // Layout reads only; the state changes (and re-renders) only when a flag flips.
    const measure = () => {
      const viewport = scope === "window" ? window.innerHeight : element.clientHeight;
      const overflow = element.scrollHeight - viewport > EDGE_PX;
      const atEnd = element.scrollTop + viewport >= element.scrollHeight - EDGE_PX;
      setState((current) => (current.overflow === overflow && current.atEnd === atEnd ? current : { overflow, atEnd }));
    };
    measure();
    target.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(scope === "window" ? document.body : element);
    for (const child of Array.from((scope === "window" ? document.body : element).children)) observer.observe(child);
    return () => {
      target.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [scope]);

  function jump() {
    const element = scroller(ref.current, scope);
    if (!element) return;
    const options: ScrollToOptions = { top: state.atEnd ? 0 : element.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" };
    if (scope === "window") window.scrollTo(options);
    else element.scrollTo(options);
  }

  return (
    <div ref={ref} className="fair-scroll-hint" data-overflow={state.overflow || undefined} data-scope={scope}>
      <AnimatePresence initial={false}>
        {state.overflow ? (
          <motion.button
            key="hint"
            type="button"
            className="fair-scroll-hint__button"
            aria-label={state.atEnd ? upLabel : downLabel}
            onClick={jump}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: reduceMotion ? 0 : FAIR_DURATION.state, ease: FAIR_EASE.enter } }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: reduceMotion ? 0 : FAIR_DURATION.state, ease: FAIR_EASE.exit } }}
          >
            <motion.span
              className="fair-scroll-hint__arrow"
              aria-hidden="true"
              initial={false}
              animate={{ rotate: state.atEnd ? 180 : 0 }}
              transition={{ duration: reduceMotion ? 0 : FAIR_DURATION.overlay, ease: FAIR_EASE.move }}
            >
              <ArrowDown />
            </motion.span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
