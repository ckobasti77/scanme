"use client";

import { QrCode } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { AdminEmptyState, AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { adminPrimaryButtonClass } from "@/components/admin/admin-ui";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import { useAdminSidebarLive } from "@/components/admin/frame/admin-sidebar-store";
import { cn } from "@/lib/utils";
import type { AdminSubnavGroup } from "@/lib/admin-v1/subnav";
import type { SidebarLive } from "@/lib/admin-v2/sidebar/types";
import type { FairEventStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A2 / ADMIN v2 — the frame of every `Događaji` page. The event
// switch (keeps the section) and the section navigation live in the sidebar
// of the admin frame: this view sends them there (useAdminSidebarLive) and
// renders the page header (the event above, the section as the title, the
// one „Poveži nalepnicu“ entry on the right). Presentational; the admin
// (AdminEventFrame) and the dev preview fill it.

export type FrameEvent = { slug: string; title: string; status: FairEventStatus };

export function AdminEventFrameView({ preview, events, currentSlug, onSelectEvent, nav, linkStickerHref, title, children }: {
  preview?: boolean;
  events: readonly FrameEvent[];
  currentSlug: string;
  onSelectEvent: (slug: string) => void;
  nav: readonly AdminSubnavGroup[];
  /** N2 — „Poveži nalepnicu“, the field team's entry (also on the phone); null on that page. */
  linkStickerHref?: string | null;
  /** The open section (the H1 of the screen); the event title when there is none. */
  title?: string;
  children: ReactNode;
}) {
  const current = events.find((event) => event.slug === currentSlug);
  const live = useMemo<SidebarLive>(() => ({
    context: {
      value: currentSlug,
      options: events.map((event) => ({ value: event.slug, label: fmt(dict.eventOption, { title: event.title, status: dict.eventStatus[event.status] }) })),
      onChange: onSelectEvent,
    },
    nav,
  }), [currentSlug, events, nav, onSelectEvent]);
  useAdminSidebarLive(live);
  const eventTitle = current?.title ?? dict.pageTitle;
  return (
    <div className="grid min-w-0 gap-5">
      <AdminPageHeader
        badge={preview ? <span className="inline-block w-fit rounded-full border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--admin-warning)]">{dict.previewBadge}</span> : undefined}
        eyebrow={title ? `${dict.pageTitle} · ${eventTitle}` : dict.pageTitle}
        title={title ?? eventTitle}
        description={preview ? dict.previewDescription : undefined}
        actions={linkStickerHref ? (
          <Link href={linkStickerHref} data-link-sticker-entry className={cn(adminPrimaryButtonClass, "min-h-12 text-base")}>
            <QrCode className="size-5" aria-hidden="true" />{dict.linkSticker.entry}
          </Link>
        ) : undefined}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** `/admin/dogadjaji` while it looks for the current event, or when there is none. */
export function AdminEventsEntryView({ empty }: { empty: boolean }) {
  return (
    <div className="grid min-w-0 gap-5">
      <AdminPageHeader title={dict.pageTitle} />
      <AdminPanel>
        {empty ? <AdminEmptyState title={dict.noEventsTitle} body={dict.noEventsBody} /> : <AdminLoadingState label={dict.loading} />}
      </AdminPanel>
    </div>
  );
}
