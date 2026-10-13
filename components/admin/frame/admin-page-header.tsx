"use client";

import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { fmt } from "@/lib/i18n/format";
import { sidebarHasFilters } from "@/lib/admin-v2/sidebar/accordion";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";
import { useAdminFrame } from "./admin-frame-context";
import { useAdminSidebar } from "./admin-sidebar-content";

// ADMIN v2 — the header of a page, inside the screen (ZADATAK §2): the title
// on the left on a fixed rem scale (never fluid), the primary actions on the
// right. Below lg „Filteri (N)“ opens the drawer straight on the filters of
// the page (N = active filters).
// V3: the title block is the `title` of the reveal engine (its lines leave a
// mask one after another), the description and the actions follow as `text`.
// The empty layer holds the temporary copy the engine splits into lines.

export function AdminPageHeader({ title, eyebrow, description, badge, actions, className }: {
  title: ReactNode;
  /** Small line above the title (the area or the event). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const frame = useAdminFrame();
  return (
    <header data-admin-primitive="page-header" className={cn("flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div data-admin-reveal="title" className="relative grid min-w-0 flex-1 basis-72 gap-1">
        {badge ? <div className="mb-0.5">{badge}</div> : null}
        {eyebrow
          ? <p data-admin-title-line="" className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase [overflow-wrap:anywhere]">{eyebrow}</p>
          // No eyebrow: its line is kept, so the title does not jump between pages. Only on a screen of 42 rem
          // or wider (a container query on the screen of the frame): a phone keeps the room.
          : <span aria-hidden="true" data-eyebrow-space="" className="hidden h-4 @2xl/screen:block" />}
        <h1 data-admin-title-line="" className="text-2xl leading-8 font-semibold tracking-[-0.03em] [overflow-wrap:anywhere] lg:text-[1.75rem] lg:leading-[2.125rem]">{title}</h1>
        {description ? <p data-admin-reveal="text" className="max-w-2xl text-sm leading-5 text-[var(--admin-text-muted)]">{description}</p> : null}
        <span aria-hidden="true" data-admin-title-ghosts="" className="pointer-events-none absolute inset-0" />
      </div>
      {actions || frame ? (
        <div data-admin-reveal="text" className="flex min-w-0 flex-wrap items-center gap-2">
          {frame ? <FiltersButton onOpen={() => frame.openDrawer("filters")} /> : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

function FiltersButton({ onOpen }: { onOpen: () => void }) {
  const { config, hasFilters, filterCount } = useAdminSidebar();
  if (!hasFilters) return null;
  // A page with nothing to filter (only sections, a view or a member list) names what the drawer holds.
  const label = sidebarHasFilters(config) ? (filterCount ? fmt(dict.filters.toggleCount, { count: filterCount }) : dict.filters.toggle) : (config.context?.list ? config.context.label : config.views?.label) ?? dict.filters.toggle;
  return (
    <button type="button" data-admin-filters-open="" onClick={onOpen} className={cn(adminSecondaryButtonClass, "lg:hidden")}>
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
