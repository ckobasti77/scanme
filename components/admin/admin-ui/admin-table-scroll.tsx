"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { useAdminFlip } from "@/components/admin/admin-ui/use-admin-flip";

// ADMIN v2 — the wrapper of an admin table (ZADATAK §2): a table scrolls
// with the screen, never up and down in its own box, and its header row
// stays under the top edge of the screen. A sticky header and a sideways
// scroll exclude each other in CSS (a wrapper that scrolls sideways becomes
// the scroll container of the header), so the wrapper clips by default and
// gets the sideways scroll (`data-overflow-x`, app/globals.css) only while
// the table is really wider than it.

// X4: rows glide when the list is filtered (useAdminFlip); `flipSignature`
// adds what else reorders the rows (a column sort) to the filters in the URL.

export function AdminTableScroll({ children, flipSignature, ...props }: ComponentProps<"div"> & { flipSignature?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useAdminFlip(ref, "tbody > tr", flipSignature);
  useEffect(() => {
    const element = ref.current;
    const table = element?.querySelector("table");
    if (!element || !table) return;
    const update = () => element.toggleAttribute("data-overflow-x", table.offsetWidth > element.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);
  // V3: the light that follows the cursor also lies on a table (`data-admin-glow`).
  return <div ref={ref} data-admin-table-wrap="" data-admin-glow="" {...props}>{children}</div>;
}
