"use client";

import { useId, type ReactNode } from "react";

export function AdminTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const tooltipId = useId();

  return (
    <span className="group/admin-tooltip relative inline-flex">
      <span aria-describedby={tooltipId} className="inline-flex">
        {children}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute top-[calc(100%+0.55rem)] left-1/2 z-40 w-max max-w-56 -translate-x-1/2 translate-y-1 rounded-lg bg-[var(--admin-ink)] px-2.5 py-1.5 text-center text-xs leading-4 text-[var(--admin-on-ink)] opacity-0 shadow-[var(--admin-shadow-md)] transition-[opacity,transform] duration-150 group-hover/admin-tooltip:translate-y-0 group-hover/admin-tooltip:opacity-100 group-focus-within/admin-tooltip:translate-y-0 group-focus-within/admin-tooltip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
