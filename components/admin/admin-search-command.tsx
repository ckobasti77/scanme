"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { adminSearchSr as dict } from "@/lib/i18n/sr/admin-search";
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
}: {
  buttonClass: string;
  previewGroups?: AdminSearchCommandPreviewGroups;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredTerm = useDeferredValue(term.trim());
  const inputRef = useRef<HTMLInputElement>(null);
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

  function openResult(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={buttonClass} aria-label={dict.commandTitle}>
          <Search className="size-[1.15rem]" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="admin-v1 top-[12vh] max-h-[78vh] w-[min(44rem,calc(100vw-2rem))] translate-y-0 overflow-hidden rounded-[var(--admin-radius-panel)] border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 shadow-[var(--admin-shadow-lg)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="border-b border-[var(--admin-border)] px-5 pt-5 pb-3 text-left">
          <DialogTitle>{dict.commandTitle}</DialogTitle>
          <DialogDescription>{dict.commandDescription}</DialogDescription>
        </DialogHeader>
        <div className="p-3 sm:p-4">
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
                  setActiveIndex((index) => (index + 1) % results.length);
                } else if (event.key === "ArrowUp" && results.length) {
                  event.preventDefault();
                  setActiveIndex((index) => (index - 1 + results.length) % results.length);
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
        <div id="admin-search-command-results" role="listbox" className="max-h-[48vh] overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
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
                          activeIndex === index ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "hover:bg-[var(--admin-surface-muted)]",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{result.title}</span>
                          <span className={cn("block truncate text-xs", activeIndex === index ? "text-white/70" : "text-[var(--admin-text-muted)]")}>
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
        <div className="border-t border-[var(--admin-border)] p-3 sm:px-4">
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
