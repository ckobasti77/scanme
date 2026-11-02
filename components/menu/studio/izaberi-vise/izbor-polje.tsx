"use client";

// ScanMe Menu V1 — the checkbox of `Izaberi više` (K11): a real checkbox (Space
// toggles it, the name says what it selects) with a 44 px target. A section's
// box has a third state, "some of its rows" (the native `indeterminate`, shown
// as a dash), so the state is never colour alone.

import { Check, Minus } from "lucide-react";
import type { StanjeIzbora } from "@/lib/menu/studio/selection";
import { cn } from "@/lib/utils";

export function IzborPolje({
  oznaka,
  stanje,
  onPromena,
  onemoguceno = false,
  className,
}: {
  /** "Izaberi Espresso", "Izaberi sve u sekciji Topli napici". */
  oznaka: string;
  stanje: StanjeIzbora;
  onPromena: () => void;
  onemoguceno?: boolean;
  className?: string;
}) {
  return (
    <label
      data-izbor-polje={stanje}
      className={cn(
        "relative grid size-[var(--mp-meta)] shrink-0 cursor-pointer place-items-center rounded-[var(--mp-radius-kontrola)] hover:bg-[var(--mp-povrsina-utisana)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55",
        className,
      )}
    >
      <input
        type="checkbox"
        aria-label={oznaka}
        checked={stanje === "sve"}
        disabled={onemoguceno}
        onChange={onPromena}
        ref={(element) => {
          if (element) element.indeterminate = stanje === "deo";
        }}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-[inherit] appearance-none opacity-0"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-6 place-items-center rounded-[0.375rem] border-2 [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] text-[var(--mp-na-mastilu)]",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--mp-fokus)]",
          stanje !== "nista" && "[--border:var(--mp-mastilo)] bg-[var(--mp-mastilo)]",
        )}
      >
        {stanje === "sve" ? <Check strokeWidth={3} className="size-4" /> : stanje === "deo" ? <Minus strokeWidth={3} className="size-4" /> : null}
      </span>
    </label>
  );
}
