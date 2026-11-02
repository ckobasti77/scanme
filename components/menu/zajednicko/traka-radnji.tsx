// ScanMe Menu V1 — action bar (K07). A named group of the actions that
// belong to what is on screen. `pozicija="dno"` pins it to the bottom of the
// viewport below 1024 px (thumb reach, master §15.1), and lets it flow inline
// from 1024 px up. A group, not a toolbar: Tab moves through the buttons.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TrakaRadnji({
  oznaka,
  pozicija = "u-toku",
  poravnanje = "kraj",
  className,
  children,
}: {
  /** Names the group for screen readers ("Radnje nad artiklom"). */
  oznaka: string;
  pozicija?: "u-toku" | "dno";
  poravnanje?: "pocetak" | "kraj" | "razmaknuto";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={oznaka}
      data-traka-radnji={pozicija}
      className={cn(
        "flex flex-wrap items-center gap-2",
        poravnanje === "pocetak" && "justify-start",
        poravnanje === "kraj" && "justify-end",
        poravnanje === "razmaknuto" && "justify-between",
        pozicija === "dno" && [
          // Bleeds to the edges of the shell padding (px-4, from 640 px px-6). The right end keeps
          // 4.25rem free for the app-wide theme button (fixed bottom-right, 44 px, app/layout.tsx),
          // so it never covers the main action (MENU-UX §8).
          "sticky bottom-0 z-20 -mx-4 border-t [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] pt-3 pl-4 pr-[4.25rem] sm:-mx-6 sm:pl-6",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.06)]",
          "lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
        ],
        className,
      )}
    >
      {children}
    </div>
  );
}
