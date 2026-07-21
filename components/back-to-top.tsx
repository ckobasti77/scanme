"use client";

import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { useState } from "react";

export function BackToTop() {
  const { scrollY } = useScroll();
  const reduceMotion = Boolean(useReducedMotion());
  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const nextVisible = latest > Math.max(window.innerHeight * 0.75, 560);
    setVisible((current) => current === nextVisible ? current : nextVisible);
  });

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })}
          className="focus-signal fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 inline-flex size-12 items-center justify-center border border-foreground/20 bg-background/88 text-foreground shadow-[0_8px_28px_rgb(0_0_0/0.12)] backdrop-blur-sm transition-colors duration-200 hover:border-primary hover:bg-primary hover:text-primary-foreground"
          aria-label="Vrati se na vrh stranice"
          title="Nazad na vrh"
        >
          <ArrowUp aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
