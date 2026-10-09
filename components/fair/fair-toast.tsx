"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { FAIR_DURATION, FAIR_EASE } from "./fair-motion";

// Short confirmation only (EVENT-DESIGN-SYSTEM §6): polite live region, never
// steals focus. Errors that need a retry stay inline in their own flow.

export type FairToastMessage = { id: number; text: string };

export function useFairToast() {
  const [toast, setToast] = useState<FairToastMessage | null>(null);
  const counter = useRef(0);
  const show = useCallback((text: string) => {
    counter.current += 1;
    setToast({ id: counter.current, text });
  }, []);
  const clear = useCallback(() => setToast(null), []);
  return { toast, show, clear };
}

export function FairToast({ toast, onDone }: { toast: FairToastMessage | null; onDone: () => void }) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(timer);
  }, [onDone, toast]);

  return (
    <div className="fair-toast-region" role="status" aria-live="polite">
      <AnimatePresence>
        {toast ? (
          <motion.p
            key={toast.id}
            className="fair-toast"
            initial={reduceMotion ? false : { opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: FAIR_DURATION.feedback } } : { opacity: 0, y: -10, transition: { duration: FAIR_DURATION.feedback, ease: FAIR_EASE.exit } }}
            transition={{ duration: FAIR_DURATION.state, ease: FAIR_EASE.enter }}
          >
            {toast.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
