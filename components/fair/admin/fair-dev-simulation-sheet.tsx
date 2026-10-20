"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { FairPassportSimConfig } from "@/lib/fair-passport-simulation";
import type { FairAdminDevDict } from "@/lib/i18n";
import { FairAdminSimulation } from "./fair-admin-simulation";

// Open DEV menu of the passport pages (`next dev` only, no login): just the
// passport simulation, which is a cookie of this browser and never calls
// Convex. A signed-in admin gets the same section in the admin DEV sheet
// instead (lib/fair-server/passport-simulation.ts decides which one renders).

const subscribeNothing = () => () => {};

export function FairDevSimulationSheet({ dict, current }: { dict: FairAdminDevDict; current: FairPassportSimConfig | null }) {
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1700);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const close = () => {
    setOpen(false);
    tabRef.current?.focus();
  };

  const sheet = (
    <div className={`fair-admin-dev ${open ? "is-open" : ""}`}>
      <button ref={tabRef} type="button" className="fair-admin-dev__tab" aria-label={dict.simTabAria} aria-expanded={open} onClick={() => setOpen(true)}>
        {dict.tab}
      </button>
      <div className="fair-admin-dev__scrim" onClick={close} aria-hidden="true" />
      <div className="fair-admin-dev__sheet" role="dialog" aria-modal="true" aria-label={dict.simMenuTitle} inert={!open}>
        <div className="fair-admin-dev__hd">
          <div className="fair-admin-dev__grab" aria-hidden="true" />
          <div className="fair-admin-dev__row">
            <h3>{dict.simMenuTitle} <i>{dict.chip}</i></h3>
            <button ref={closeRef} type="button" className="fair-admin-dev__x" aria-label={dict.close} onClick={close}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="fair-admin-dev__bd">
          <FairAdminSimulation dict={dict} current={current} onToast={(message) => { say(message); setOpen(false); }} />
        </div>
      </div>
      <div className={`fair-admin-dev__toast ${toast ? "is-on" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );

  return mounted ? createPortal(sheet, document.body) : null;
}
