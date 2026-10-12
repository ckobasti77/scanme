"use client";

import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";
import { useAdminFrame } from "./admin-frame-context";
import { useAdminSidebar } from "./admin-sidebar-content";

// ADMIN v2 — the header of a page, inside the screen (ZADATAK §2): the title
// on the left on a fixed rem scale (never fluid), the primary actions on the
// right. Below lg „Filteri (N)“ opens the drawer straight on the filters of
// the page (N = active filters).

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
      <div className="grid min-w-0 gap-1">
        {badge ? <div className="mb-0.5">{badge}</div> : null}
        {eyebrow ? <p className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase [overflow-wrap:anywhere]">{eyebrow}</p> : null}
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.03em] [overflow-wrap:anywhere] lg:text-[1.75rem] lg:leading-[2.125rem]">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-5 text-[var(--admin-text-muted)]">{description}</p> : null}
      </div>
      {actions || frame ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {frame ? <FiltersButton onOpen={() => frame.openDrawer("filters")} /> : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

function FiltersButton({ onOpen }: { onOpen: () => void }) {
  const { hasFilters, filterCount } = useAdminSidebar();
  if (!hasFilters) return null;
  return (
    <button type="button" data-admin-filters-open="" onClick={onOpen} className={cn(adminSecondaryButtonClass, "lg:hidden")}>
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      {filterCount ? fmt(dict.filters.toggleCount, { count: filterCount }) : dict.filters.toggle}
    </button>
  );
}
