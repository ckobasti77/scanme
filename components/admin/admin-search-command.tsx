"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { fmt } from "@/lib/i18n/format";
import { adminSearchSr as dict } from "@/lib/i18n/sr/admin-search";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

const GROUP_LABEL = {
  clients: dict.groupClients,
  venues: dict.groupVenues,
  contacts: dict.groupContacts,
  products: dict.groupProducts,
  channels: dict.groupChannels,
  orders: dict.groupOrders,
} as const;

export type AdminSearchCommandPreviewGroups = FunctionReturnType<typeof api.adminGlobalSearch.preview>;

export function AdminSearchCommand({
  buttonClass,
  previewGroups,
  showShortcut = false,
}: {
  buttonClass: string;
  previewGroups?: AdminSearchCommandPreviewGroups;
  /** ADMIN v2 — the button names itself and shows the Ctrl K shortcut on a wide navbar. */
  showShortcut?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredTerm = useDeferredValue(term.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const queriedGroups = useQuery(
    api.adminGlobalSearch.preview,
    deferredTerm && !previewGroups ? { term: deferredTerm, limitPerGroup: 4 } : "skip",
  );
  const groups = deferredTerm ? (previewGroups ?? queriedGroups) : undefined;
  const results = useMemo(
    () => (groups ?? []).flatMap((group) => group.results),
    [groups],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ADMIN v2 X4 — the palette opens from its button: the scale starts at the point the trigger is at
  // (app/globals.css reads --admin-origin). Its box is centred and starts 12vh from the top. A ref
  // callback, because the dialog mounts its content one render after it opens.
  const placeOrigin = useCallback((content: HTMLDivElement | null) => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!content || !trigger?.width) return;
    const left = (window.innerWidth - content.offsetWidth) / 2;
    const top = window.innerHeight * 0.12;
    content.style.setProperty("--admin-origin", `${Math.round(trigger.left + trigger.width / 2 - left)}px ${Math.round(trigger.top + trigger.height / 2 - top)}px`);
  }, []);

  // The arrows move the active option; the list (max-h + overflow-y) scrolls by the least amount that
  // brings it into view. Only the list scrolls: scrollIntoView would also move the clipped dialog box.
  function moveActive(index: number) {
    setActiveIndex(index);
    const list = document.getElementById("admin-search-command-results");
    const option = document.getElementById(`admin-search-result-${index}`);
    if (!list || !option) return;
    const box = list.getBoundingClientRect();
    const item = option.getBoundingClientRect();
    if (item.top < box.top) list.scrollTop -= box.top - item.top;
    else if (item.bottom > box.bottom) list.scrollTop += item.bottom - box.bottom;
  }

  function openResult(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          ref={triggerRef}
          data-admin-palette-trigger=""
          className={buttonClass}
          aria-label={dict.commandTitle}
          aria-keyshortcuts={showShortcut ? "Control+K" : undefined}
          title={showShortcut ? fmt(adminUiSr.shortcuts.hint, { label: adminUiSr.shortcuts.items.palette, keys: adminUiSr.frame.searchShortcut }) : undefined}
        >
          <Search className="size-[1.15rem]" aria-hidden="true" />
          {showShortcut ? (
            <>
              <span className="hidden 2xl:inline">{adminUiSr.frame.search}</span>
              <kbd className="hidden rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-1.5 py-0.5 font-sans text-[0.68rem] font-semibold text-[var(--admin-text-muted)] xl:inline">{adminUiSr.frame.searchShortcut}</kbd>
            </>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent
        ref={placeOrigin}
        data-admin-dialog="palette"
        className="admin-v1 top-[12vh] flex max-h-[78vh] w-[min(44rem,calc(100vw-2rem))] translate-y-0 flex-col overflow-hidden rounded-[var(--admin-radius-panel)] border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 shadow-[var(--admin-shadow-lg)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="shrink-0 border-b border-[var(--admin-border)] px-5 pt-5 pb-3 text-left">
          <DialogTitle>{dict.commandTitle}</DialogTitle>
          <DialogDescription>{dict.commandDescription}</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 p-3 sm:p-4">
          <label className="relative block">
            <span className="sr-only">{dict.searchLabel}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
            <Input
              ref={inputRef}
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                } else if (event.key === "ArrowDown" && results.length) {
                  event.preventDefault();
                  moveActive((activeIndex + 1) % results.length);
                } else if (event.key === "ArrowUp" && results.length) {
                  event.preventDefault();
                  moveActive((activeIndex - 1 + results.length) % results.length);
                } else if (event.key === "Enter" && results[activeIndex]) {
                  event.preventDefault();
                  openResult(results[activeIndex].href);
                }
              }}
              placeholder={dict.searchPlaceholder}
              className="min-h-12 rounded-xl border-[var(--admin-border)] bg-[var(--admin-surface)] pl-9 text-base"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="admin-search-command-results"
              aria-activedescendant={results[activeIndex] ? `admin-search-result-${activeIndex}` : undefined}
            />
          </label>
        </div>
        <div id="admin-search-command-results" role="listbox" className="max-h-[48vh] min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
          {!deferredTerm ? null : groups === undefined ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--admin-text-muted)]">{dict.loading}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--admin-text-muted)]">{dict.commandEmpty}</p>
          ) : (
            groups?.map((group) => (
              <section key={group.group} className="mb-3 last:mb-0">
                <h3 className="px-3 py-2 text-[0.68rem] font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">
                  {GROUP_LABEL[group.group]}
                </h3>
                <div className="grid gap-1">
                  {group.results.map((result) => {
                    const index = results.findIndex((item) => item.id === result.id && item.group === result.group);
                    return (
                      <button
                        id={`admin-search-result-${index}`}
                        key={`${result.group}:${result.id}`}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => openResult(result.href)}
                        className={cn(
                          "grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2 text-left outline-none",
                          activeIndex === index ? "bg-[var(--admin-surface-muted)] text-[var(--admin-text)]" : "hover:bg-[var(--admin-surface-muted)]",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{result.title}</span>
                          <span className="block truncate text-xs text-[var(--admin-text-muted)]">
                            {Array.from(new Set([result.code, result.smkCode, result.smlCode].filter(Boolean))).join(" · ")}
                          </span>
                        </span>
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
        <div className="shrink-0 border-t border-[var(--admin-border)] p-3 sm:px-4">
          <Link
            href={`/admin/pretraga${deferredTerm ? `?q=${encodeURIComponent(deferredTerm)}` : ""}`}
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 text-sm font-semibold hover:border-[var(--admin-ink)]"
          >
            {dict.commandOpenPage}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
