// ADMIN v2 X4 — the toasts of the admin frame: a short line for something that
// happened while the page was open (a new record of the day). The quiet mode
// drops them; the same `key` is never shown twice in a row. Pure store, the
// frame renders it (components/admin/admin-ui/admin-toast.tsx).

import { celebrationsOn, quietModeStore } from "@/lib/admin-v2/quiet-mode";

export type AdminToast = { id: number; key: string; title: string; body?: string };
/**
 * `personal` (V4): a level, a badge or a beaten boss is information about the operator, not a celebration,
 * so the quiet mode keeps it as one calm line (the ceremony itself is what the quiet mode turns off).
 */
export type AdminToastInput = { key: string; title: string; body?: string; personal?: boolean };

/** A toast leaves by itself after this long. */
export const ADMIN_TOAST_MS = 4500;
/** More than this many never stand on the screen; the oldest leaves. */
export const ADMIN_TOAST_MAX = 3;

const EMPTY: readonly AdminToast[] = [];

export function createToastStore(isQuiet: () => boolean = quietModeStore.get) {
  let toasts: readonly AdminToast[] = EMPTY;
  let nextId = 1;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    /** false: the toast was not shown (quiet mode, or the same one is already on the screen). */
    push({ personal, ...input }: AdminToastInput): boolean {
      if (!personal && !celebrationsOn(isQuiet())) return false;
      if (toasts.some((toast) => toast.key === input.key)) return false;
      toasts = [...toasts, { id: nextId++, ...input }].slice(-ADMIN_TOAST_MAX);
      emit();
      return true;
    },
    dismiss(id: number) {
      const next = toasts.filter((toast) => toast.id !== id);
      if (next.length === toasts.length) return;
      toasts = next.length ? next : EMPTY;
      emit();
    },
    clear() {
      if (!toasts.length) return;
      toasts = EMPTY;
      emit();
    },
    snapshot: () => toasts,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const adminToastStore = createToastStore();

/** Shows a toast in the admin frame; false when the quiet mode dropped it. */
export const pushAdminToast = (input: AdminToastInput) => adminToastStore.push(input);
