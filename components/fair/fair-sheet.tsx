"use client";

import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { FAIR_DURATION, FAIR_EASE } from "./fair-motion";
import { useEffect, useRef, type ReactNode } from "react";

// Shared frame of the model page sheets. `bottom`: short action (rating).
// `full`: phone-height flow with a fixed footer (leads, survey) as in the
// survey prototype. The sheet traps focus, restores it on close and closes on
// Escape only while `closable` (the survey's final step has no way out).

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function FairSheet({
  variant,
  titleId,
  title,
  subtitle,
  mark,
  closable,
  closeLabel,
  onRequestClose,
  toolbar,
  footer,
  children,
}: {
  variant: "bottom" | "full";
  titleId: string;
  title: string;
  subtitle?: string;
  /** One-letter brand monogram shown before the title (full variant). */
  mark?: string;
  closable: boolean;
  closeLabel: string;
  onRequestClose: () => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    return () => {
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (closable) onRequestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function focusInitial() {
    const target =
      closeRef.current ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      dialogRef.current;
    target?.focus({ preventScroll: true });
  }

  return (
    <motion.div
      className={`fair-sheet-backdrop fair-sheet-backdrop--${variant}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: FAIR_DURATION.overlay, ease: FAIR_EASE.enter } }}
      exit={{ opacity: 0, transition: { duration: FAIR_DURATION.state, ease: FAIR_EASE.exit } }}
      onPointerDown={(event) => {
        if (closable && event.currentTarget === event.target) onRequestClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        className={`fair-sheet fair-sheet--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        // Reduced motion: the sheet fades in place instead of rising.
        initial={reduceMotion ? { opacity: 0, y: 0 } : { y: "100%" }}
        animate={{ opacity: 1, y: 0, transition: { duration: reduceMotion ? FAIR_DURATION.state : variant === "full" ? FAIR_DURATION.overlay : FAIR_DURATION.focal, ease: FAIR_EASE.enter } }}
        exit={reduceMotion ? { opacity: 0, transition: { duration: FAIR_DURATION.state } } : { y: "100%", transition: { duration: FAIR_DURATION.state, ease: FAIR_EASE.exit } }}
        onAnimationComplete={(definition) => {
          if (typeof definition === "object" && definition !== null && "y" in definition && definition.y === 0) {
            focusInitial();
          }
        }}
      >
        <header className="fair-sheet__top">
          {mark ? (
            <span className="fair-sheet__mark" aria-hidden="true">
              {mark}
            </span>
          ) : null}
          <div className="fair-sheet__titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <small>{subtitle}</small> : null}
          </div>
          {closable ? (
            <button ref={closeRef} type="button" className="fair-sheet__close" onClick={() => onRequestClose()}>
              <X aria-hidden="true" />
              <span className="sr-only">{closeLabel}</span>
            </button>
          ) : null}
        </header>
        {toolbar}
        {variant === "full" ? <div className="fair-sheet__body">{children}</div> : children}
        {footer ? <div className="fair-sheet__footer">{footer}</div> : null}
      </motion.div>
    </motion.div>
  );
}
