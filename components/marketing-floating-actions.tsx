"use client";

import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import {
  ArrowUp,
  AtSign,
  Camera,
  Mail,
  MessageCircle,
  Phone,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type MarketingContactAction = {
  id: "phone" | "email" | "instagram" | "x" | "facebook";
  label: string;
  icon: LucideIcon;
  href?: string;
  external?: boolean;
};

export const MARKETING_CONTACT_ACTIONS = [
  { id: "phone", label: "Poziv", icon: Phone },
  { id: "email", label: "Email", icon: Mail },
  { id: "instagram", label: "Instagram", icon: Camera, external: true },
  { id: "x", label: "X", icon: AtSign, external: true },
  { id: "facebook", label: "Facebook", icon: UsersRound, external: true },
] as const satisfies readonly MarketingContactAction[];

const actionClassName =
  "liquid-glass focus-signal flex min-h-11 min-w-[9.25rem] items-center gap-2.5 rounded-2xl border border-[var(--marketing-border)] px-3.5 text-left text-xs font-semibold tracking-[-0.01em] text-[var(--marketing-text)] shadow-[0_12px_36px_var(--marketing-shadow)]";

function ContactAction({
  action,
  onActivate,
}: {
  action: MarketingContactAction;
  onActivate: () => void;
}) {
  const Icon = action.icon;

  const content = (
    <>
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span>{action.label}</span>
    </>
  );

  if (!action.href) {
    return (
      <button
        type="button"
        className={`${actionClassName} cursor-not-allowed opacity-55 saturate-50`}
        aria-disabled="true"
        aria-label={`${action.label} — uskoro dostupno`}
        title={`${action.label} — uskoro dostupno`}
        disabled
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={action.href}
      className={`${actionClassName} transition-colors hover:border-[color-mix(in_srgb,var(--marketing-accent)_60%,transparent)] hover:text-[var(--marketing-accent)]`}
      target={action.external ? "_blank" : undefined}
      rel={action.external ? "noopener noreferrer" : undefined}
      aria-label={action.label}
      title={action.label}
      onClick={onActivate}
    >
      {content}
    </a>
  );
}

export function MarketingFloatingActions() {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !actionsRef.current?.contains(event.target)
      ) {
        setActionsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      setActionsOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionsOpen]);

  useEffect(() => {
    let frame = 0;

    const updateVisibility = () => {
      frame = 0;
      setShowScrollTop(window.scrollY > window.innerHeight * 0.9);
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateVisibility);
    };

    updateVisibility();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const trayVariants: Variants = {
    closed: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.035,
        staggerDirection: -1,
      },
    },
    open: {
      transition: {
        delayChildren: reduceMotion ? 0 : 0.025,
        staggerChildren: reduceMotion ? 0 : 0.055,
      },
    },
  };

  const actionVariants: Variants = {
    closed: {
      opacity: 0,
      scale: reduceMotion ? 1 : 0.94,
      y: reduceMotion ? 0 : 10,
    },
    open: {
      opacity: 1,
      scale: 1,
      y: 0,
    },
  };

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        ref={actionsRef}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-[44] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:left-[max(1.5rem,env(safe-area-inset-left))]"
      >
        <AnimatePresence initial={false}>
          {actionsOpen ? (
            <motion.div
              id="marketing-contact-actions"
              key="contact-actions"
              role="group"
              aria-label="Brze kontakt akcije"
              className="absolute bottom-[calc(100%+0.75rem)] left-0 flex max-h-[calc(100dvh-6rem)] flex-col gap-2 overflow-y-auto p-1 [scrollbar-width:none]"
              initial="closed"
              animate="open"
              exit="closed"
              variants={trayVariants}
            >
              {MARKETING_CONTACT_ACTIONS.map((action) => (
                <motion.div key={action.id} variants={actionVariants}>
                  <ContactAction
                    action={action}
                    onActivate={() => setActionsOpen(false)}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          ref={triggerRef}
          type="button"
          className="liquid-glass focus-signal flex size-14 items-center justify-center rounded-[1.25rem] border border-[var(--marketing-border-strong)] text-[var(--marketing-text)] shadow-[0_18px_48px_var(--marketing-shadow)] transition-colors hover:border-[var(--marketing-accent)] hover:text-[var(--marketing-accent)]"
          aria-controls="marketing-contact-actions"
          aria-expanded={actionsOpen}
          aria-label={actionsOpen ? "Zatvori brze akcije" : "Otvori brze akcije"}
          title={actionsOpen ? "Zatvori brze akcije" : "Brze akcije"}
          onClick={() => setActionsOpen((current) => !current)}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={actionsOpen ? "close" : "contact"}
              className="flex items-center justify-center"
              initial={{ opacity: 0, rotate: reduceMotion ? 0 : -18, scale: 0.9 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: reduceMotion ? 0 : 18, scale: 0.9 }}
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
            >
              {actionsOpen ? (
                <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
              ) : (
                <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.75} />
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {showScrollTop ? (
          <motion.button
            key="scroll-to-top"
            type="button"
            className="marketing-scroll-top liquid-glass focus-signal fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[44] flex size-13 items-center justify-center rounded-[1.125rem] border border-[var(--marketing-border-strong)] text-[var(--marketing-text)] shadow-[0_18px_48px_var(--marketing-shadow)] transition-colors hover:border-[var(--marketing-accent)] hover:text-[var(--marketing-accent)] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:right-[max(1.5rem,env(safe-area-inset-right))]"
            aria-label="Vrati se na vrh stranice"
            title="Nazad na vrh"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.92, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.92, y: reduceMotion ? 0 : 8 }}
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: reduceMotion ? "auto" : "smooth",
              })
            }
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          >
            <ArrowUp aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
