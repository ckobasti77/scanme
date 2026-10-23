"use client";

import { QrCode } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { AdminEmptyState, AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { AdminSubnav, adminFieldClass, adminPrimaryButtonClass } from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";
import type { AdminSubnavGroup } from "@/lib/admin-v1/subnav";
import type { FairEventStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A2 — the frame of every `Događaji` page: event title, event
// switch (keeps the section) and the section navigation. Presentational; the
// admin (AdminEventFrame) and the dev preview fill it.

export type FrameEvent = { slug: string; title: string; status: FairEventStatus };

export function AdminEventFrameView({ preview, events, currentSlug, onSelectEvent, nav, linkStickerHref, children }: {
  preview?: boolean;
  events: readonly FrameEvent[];
  currentSlug: string;
  onSelectEvent: (slug: string) => void;
  nav: readonly AdminSubnavGroup[];
  /** N2 — „Poveži nalepnicu“ right under the title (the field team's entry on the phone); null on that page. */
  linkStickerHref?: string | null;
  children: ReactNode;
}) {
  const selectId = useId();
  const current = events.find((event) => event.slug === currentSlug);
  return (
    <div className="grid min-w-0 gap-5">
      <header className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
        <div className="grid min-w-0 gap-1.5">
          {preview ? <span className="w-fit rounded-full border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--admin-warning)]">{dict.previewBadge}</span> : null}
          <p className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{dict.pageTitle}</p>
          <h1 className="text-[clamp(1.6rem,3.2vw,2.6rem)] leading-tight font-semibold tracking-[-0.045em] [overflow-wrap:anywhere]">{current?.title ?? dict.pageTitle}</h1>
          {preview ? <p className="max-w-2xl text-sm text-[var(--admin-text-muted)]">{dict.previewDescription}</p> : null}
          {linkStickerHref ? (
            <Link href={linkStickerHref} data-link-sticker-entry className={cn(adminPrimaryButtonClass, "mt-1.5 min-h-12 w-full text-base sm:w-fit")}>
              <QrCode className="size-5" aria-hidden="true" />{dict.linkSticker.entry}
            </Link>
          ) : null}
        </div>
        <label htmlFor={selectId} className="grid min-w-0 gap-1.5 text-sm font-semibold">{dict.eventLabel}
          <select id={selectId} value={currentSlug} onChange={(event) => onSelectEvent(event.target.value)} className={adminFieldClass}>
            {events.map((event) => <option key={event.slug} value={event.slug}>{fmt(dict.eventOption, { title: event.title, status: dict.eventStatus[event.status] })}</option>)}
          </select>
        </label>
      </header>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start">
        <AdminSubnav ariaLabel={dict.sectionsAria} groups={nav} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/** `/admin/dogadjaji` while it looks for the current event, or when there is none. */
export function AdminEventsEntryView({ empty }: { empty: boolean }) {
  return (
    <div className="grid min-w-0 gap-5">
      <h1 className="text-[clamp(1.6rem,3.2vw,2.6rem)] leading-tight font-semibold tracking-[-0.045em]">{dict.pageTitle}</h1>
      <AdminPanel>
        {empty ? <AdminEmptyState title={dict.noEventsTitle} body={dict.noEventsBody} /> : <AdminLoadingState label={dict.loading} />}
      </AdminPanel>
    </div>
  );
}
