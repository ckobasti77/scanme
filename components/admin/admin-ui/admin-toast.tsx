"use client";

import { Trophy, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { gsap, prefersReducedMotion, useAdminGsapLayout } from "@/components/admin/frame/use-admin-gsap";
import { ADMIN_DURATION, ADMIN_EASE, ADMIN_ENTER_OFFSET } from "@/lib/admin-v2/motion";
import { celebrationsOn, quietModeStore } from "@/lib/admin-v2/quiet-mode";
import { ADMIN_TOAST_MS, adminToastStore, type AdminToast } from "@/lib/admin-v2/toast";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";

// ADMIN v2 X4 — the toasts of the frame (a new record of the day): one calm
// line in the corner that leaves by itself (it waits while the pointer or the
// focus is on it), announced politely, with a close button. The quiet mode shows none (lib/admin-v2/toast.ts drops them) and
// clears the ones on the screen. No sound, nothing over the content.

const EMPTY: readonly AdminToast[] = [];
const serverToasts = () => EMPTY;
const notQuiet = () => false;

/** The quiet mode of this browser and its switch; turning it on clears the toasts on the screen. */
export function useQuietMode(): [boolean, (quiet: boolean) => void] {
  const quiet = useSyncExternalStore(quietModeStore.subscribe, quietModeStore.get, notQuiet);
  return [quiet, setQuietMode];
}

function setQuietMode(quiet: boolean) {
  quietModeStore.set(quiet);
  if (!celebrationsOn(quiet)) adminToastStore.clear();
}

function ToastItem({ toast }: { toast: AdminToast }) {
  const ref = useRef<HTMLLIElement>(null);
  useAdminGsapLayout(
    ({ reduced }) => {
      if (ref.current) gsap.from(ref.current, { opacity: 0, ...(reduced ? {} : { y: ADMIN_ENTER_OFFSET }), duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out, clearProps: "opacity,transform" });
    },
    [],
  );
  const dismiss = () => {
    const element = ref.current;
    if (!element) return adminToastStore.dismiss(toast.id);
    gsap.to(element, { opacity: 0, ...(prefersReducedMotion() ? {} : { y: ADMIN_ENTER_OFFSET }), duration: ADMIN_DURATION.state, ease: ADMIN_EASE.in, overwrite: true, onComplete: () => adminToastStore.dismiss(toast.id) });
  };
  const leave = useRef(dismiss);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    leave.current = dismiss;
  });
  // It leaves by itself, but waits while the pointer or the focus is on it (time to read it and to reach its button).
  const hold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const release = () => {
    hold();
    timer.current = setTimeout(() => leave.current(), ADMIN_TOAST_MS);
  };
  useEffect(() => {
    const element = ref.current;
    timer.current = setTimeout(() => leave.current(), ADMIN_TOAST_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (element) gsap.killTweensOf(element);
    };
  }, []);
  return (
    <li ref={ref} data-admin-toast={toast.key} onMouseEnter={hold} onMouseLeave={release} onFocus={hold} onBlur={release} className="pointer-events-auto flex min-w-0 items-start gap-2.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] py-2.5 pr-1.5 pl-3 text-sm shadow-[var(--admin-shadow-md)]">
      <Trophy className="mt-0.5 size-4 flex-none text-[var(--admin-medal-1)]" aria-hidden="true" />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-semibold [overflow-wrap:anywhere]">{toast.title}</p>
        {toast.body ? <p className="mt-0.5 text-xs leading-5 text-[var(--admin-text-muted)]">{toast.body}</p> : null}
      </div>
      <button type="button" onClick={dismiss} aria-label={adminUiSr.toast.dismiss} className="-my-1.5 grid size-11 flex-none place-items-center rounded-md lg:my-0 lg:size-8 text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]">
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export function AdminToaster() {
  const toasts = useSyncExternalStore(adminToastStore.subscribe, adminToastStore.snapshot, serverToasts);
  return (
    <div data-admin-toasts="" role="status" aria-label={adminUiSr.toast.region} aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] w-[min(22rem,calc(100vw-2rem))]">
      {toasts.length ? (
        <ol className="grid gap-2">
          {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />)}
        </ol>
      ) : null}
    </div>
  );
}
