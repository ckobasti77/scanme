"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { routeHref } from "@/lib/admin-v2/frame/routes";
import {
  ADMIN_GO_PENDING_EVENT,
  ADMIN_SHORTCUT_GROUPS,
  ADMIN_SHORTCUTS_EVENT,
  SHORTCUT_IDLE,
  isEditableTarget,
  shortcutStep,
  type ShortcutAction,
  type ShortcutState,
} from "@/lib/admin-v2/shortcuts";
import { ADMIN_NAV_INTENT_EVENT } from "@/components/admin/reveal/admin-reveal-root";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { useAdminFrame } from "./admin-frame-context";

// ADMIN v2 X4 — one keydown listener for the whole admin plus the dialog that
// lists the shortcuts. The key logic lives in `lib/admin-v2/shortcuts.ts`.

const dict = adminUiSr.shortcuts;
const OPEN_LAYER = '[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

const visible = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && element.offsetParent !== null;

export function AdminShortcuts() {
  const router = useRouter();
  const frame = useAdminFrame();
  const [open, setOpen] = useState(false);
  const sequence = useRef<ShortcutState>(SHORTCUT_IDLE);
  // The dialog has no Trigger (a key or the profile menu opens it), so Radix would focus nothing on close.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(ADMIN_SHORTCUTS_EVENT, onOpen);
    return () => window.removeEventListener(ADMIN_SHORTCUTS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const focusPageSearch = () => {
      const sidebar = document.querySelector('[data-admin-frame="sidebar"]');
      const sidebarSearch = document.querySelector<HTMLInputElement>('[data-admin-frame="sidebar"] [data-admin-sidebar-search]');
      if (visible(sidebarSearch)) {
        sidebarSearch.focus();
        sidebarSearch.select();
        return;
      }
      const screenSearch = document.querySelector<HTMLInputElement>('[data-admin-frame="screen"] input[type="search"]');
      if (visible(screenSearch)) {
        screenSearch.focus();
        return;
      }
      if (sidebar && !visible(sidebar) && frame) {
        frame.openDrawer("filters");
        return;
      }
      document.querySelector<HTMLElement>("[data-admin-palette-trigger]")?.click();
    };

    const run = (action: ShortcutAction) => {
      if (action.type === "go") {
        const href = routeHref(action.href, frame?.route ?? null);
        // V3: a shortcut leaves the page like a click on a link does (the old page dims).
        window.dispatchEvent(new CustomEvent(ADMIN_NAV_INTENT_EVENT, { detail: href }));
        router.push(href);
      }
      else if (action.type === "pageSearch") focusPageSearch();
      else setOpen(true);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const editable = isEditableTarget(event.target as Element | null);
      // The list itself is a dialog: "?" closes it instead of being blocked.
      if (open && event.key === "?" && !editable && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      const result = shortcutStep(sequence.current, {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        editable,
        modal: document.querySelector(OPEN_LAYER) !== null,
        at: event.timeStamp,
      });
      // V3: while the letter after G is awaited the navbar says so (a chip beside the search).
      const pending = result.state.goAt !== null;
      if (pending !== (sequence.current.goAt !== null)) window.dispatchEvent(new CustomEvent(ADMIN_GO_PENDING_EVENT, { detail: pending }));
      sequence.current = result.state;
      if (!result.action) return;
      event.preventDefault();
      run(result.action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, router, frame]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        sequence.current = SHORTCUT_IDLE;
        setOpen(next);
      }}
    >
      <DialogContent
        data-admin-dialog="shortcuts"
        onOpenAutoFocus={() => {
          // Radix has not moved focus yet: remember where it was.
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          const target = opener.current;
          opener.current = null;
          // Opened from the profile menu the item is gone by now: Radix then does what it did before.
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
        className="admin-v1 max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-[var(--admin-radius-panel)] border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-5 shadow-[var(--admin-shadow-lg)]"
      >
        <DialogHeader className="text-left">
          <DialogTitle>{dict.title}</DialogTitle>
          <DialogDescription>{dict.description}</DialogDescription>
        </DialogHeader>
        <AdminShortcutsList />
      </DialogContent>
    </Dialog>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-1.5 py-0.5 font-sans text-[0.68rem] font-semibold text-[var(--admin-text-muted)]">
      {children}
    </kbd>
  );
}

export function AdminShortcutsList() {
  return (
    <div className="grid gap-5">
      {ADMIN_SHORTCUT_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`admin-shortcuts-${group.id}`}>
          <h3 id={`admin-shortcuts-${group.id}`} className="mb-2 text-[0.68rem] font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">
            {dict.groups[group.id]}
          </h3>
          <dl className="grid gap-1.5">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4">
                <dt className="min-w-0 text-sm text-[var(--admin-text)]">{dict.items[item.id]}</dt>
                <dd className="flex shrink-0 items-center gap-1">
                  {item.keys.map((key, index) => (
                    <Fragment key={`${key}-${index}`}>
                      {item.sequence && index > 0 ? <span className="text-xs text-[var(--admin-text-muted)]">{dict.then}</span> : null}
                      <Key>{key}</Key>
                    </Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="text-xs text-[var(--admin-text-muted)]">{dict.inputNote}</p>
    </div>
  );
}
