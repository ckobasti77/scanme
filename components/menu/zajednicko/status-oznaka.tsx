// ScanMe Menu V1 — status label (K07). A state is never colour alone: the
// icon carries the colour, the text names the state and stays in the text
// token (DASHBOARD-STANDARD §4, §8). The tone → meaning map is in
// docs/menu/MENU-UX.md §3.

import {
  Circle,
  CircleCheck,
  Info,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTon = "neutralno" | "info" | "uspeh" | "upozorenje" | "opasnost";

export const STATUS_TONOVI: Record<StatusTon, { ikonica: LucideIcon; povrsina: string; ikonicaBoja: string }> = {
  neutralno: {
    ikonica: Circle,
    povrsina: "[--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)]",
    ikonicaBoja: "text-[var(--mp-tekst-sporedni)]",
  },
  info: {
    ikonica: Info,
    povrsina: "[--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]",
    ikonicaBoja: "text-[var(--mp-info)]",
  },
  uspeh: {
    ikonica: CircleCheck,
    povrsina: "[--border:var(--mp-uspeh-ivica)] bg-[var(--mp-uspeh-meko)]",
    ikonicaBoja: "text-[var(--mp-uspeh)]",
  },
  upozorenje: {
    ikonica: TriangleAlert,
    povrsina: "[--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]",
    ikonicaBoja: "text-[var(--mp-upozorenje)]",
  },
  opasnost: {
    ikonica: OctagonAlert,
    povrsina: "[--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]",
    ikonicaBoja: "text-[var(--mp-opasnost)]",
  },
};

export function StatusOznaka({
  ton,
  ikonica,
  velicina = "standardna",
  className,
  children,
}: {
  ton: StatusTon;
  /** Replaces the tone's default icon (e.g. Lock for Premium, PencilLine for a draft). */
  ikonica?: LucideIcon;
  velicina?: "standardna" | "mala";
  className?: string;
  /** The state in words. Required: the colour never speaks alone. */
  children: ReactNode;
}) {
  const t = STATUS_TONOVI[ton];
  const Ikonica = ikonica ?? t.ikonica;
  return (
    <span
      data-status-ton={ton}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-[var(--mp-radius-dugme)] border py-0.5 font-semibold leading-tight text-[var(--mp-tekst)]",
        velicina === "mala" ? "min-h-6 px-2 text-xs" : "min-h-7 px-2.5 text-[0.8125rem]",
        t.povrsina,
        className,
      )}
    >
      <Ikonica
        aria-hidden="true"
        strokeWidth={2}
        className={cn("shrink-0", velicina === "mala" ? "size-3.5" : "size-4", t.ikonicaBoja)}
      />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
