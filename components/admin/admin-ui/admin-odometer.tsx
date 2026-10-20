"use client";

import { useRef, useState } from "react";
import { gsap, useAdminGsapLayout } from "@/components/admin/frame/use-admin-gsap";
import { formatCount } from "@/lib/admin-v2/analytics/format";
import { ADMIN_DURATION, ADMIN_EASE, ADMIN_STAGGER_TOTAL } from "@/lib/admin-v2/motion";
import { odometerColumns, odometerDirection } from "@/lib/admin-v2/odometer";
import { cn } from "@/lib/utils";

// ADMIN v2 X4 — a number that rolls when new data arrives (ZADATAK §5.3). The
// first render is plain text; only a change of the shown text while mounted
// rolls the characters that differ (up when the value grew, down when it fell).
// While it rolls the real text stays in an sr-only span and the columns are
// aria-hidden; afterwards the plain text is back. The columns are as wide as a
// character (tabular-nums) and as high as a line, so nothing shifts.

export type AdminOdometerProps = {
  /** The number behind the text: a change of it starts the roll, its direction is up or down. */
  value: number;
  /** What is shown when it is not the plain formatted number („412+“). */
  text?: string;
  className?: string;
};

type Roll = { id: number; from: string; direction: 1 | -1 };
type Shown = { text: string; value: number; roll: Roll | null; rolls: number };

export function AdminOdometer({ value, text, className }: AdminOdometerProps) {
  const next = text ?? formatCount(value);
  const [shown, setShown] = useState<Shown>({ text: next, value, roll: null, rolls: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  // Derived state: a change of the text starts a roll from the text shown a moment ago (a roll in flight is replaced).
  if (next !== shown.text) {
    const rolls = shown.rolls + 1;
    setShown({ text: next, value, roll: { id: rolls, from: shown.text, direction: odometerDirection(shown.value, value) }, rolls });
  }
  const roll = shown.roll;
  const rollId = roll?.id;

  useAdminGsapLayout(
    ({ reduced }) => {
      const element = ref.current;
      if (!element || rollId === undefined) return;
      const strips = gsap.utils.toArray<HTMLElement>("[data-odometer-strip]", element);
      const end = () => setShown((current) => (current.roll?.id === rollId ? { ...current, roll: null } : current));
      // Up: the strip is [old, new] and slides to -50%; down: it is [new, old] and slides from -50% to 0.
      const direction = roll?.direction ?? 1;
      if (reduced || !strips.length) {
        gsap.set(strips, { yPercent: direction === 1 ? -50 : 0 });
        gsap.fromTo(element, { opacity: 0.4 }, { opacity: 1, duration: ADMIN_DURATION.feedback, clearProps: "opacity", onComplete: end });
        return;
      }
      gsap.fromTo(
        strips,
        { yPercent: direction === 1 ? 0 : -50 },
        {
          yPercent: direction === 1 ? -50 : 0,
          // The digits are staggered: 180 ms each, the last one ends within 250 ms.
          duration: ADMIN_DURATION.state,
          ease: ADMIN_EASE.out,
          stagger: { each: strips.length > 1 ? ADMIN_STAGGER_TOTAL / (strips.length - 1) : 0, from: "end" },
          onComplete: end,
        },
      );
    },
    [rollId],
    ref,
  );

  if (!roll) {
    return <span data-admin-odometer="" className={cn("tabular-nums", className)}>{shown.text}</span>;
  }
  return (
    <span ref={ref} data-admin-odometer="" data-rolling="" className={cn("inline-flex tabular-nums", className)}>
      <span className="sr-only">{shown.text}</span>
      <span aria-hidden="true" className="inline-flex">
        {odometerColumns(roll.from, shown.text).map((column, index) => (
          <span key={`${roll.id}-${index}`} className="block overflow-hidden whitespace-pre">
            {column.changed ? (
              <span data-odometer-strip="" className="flex flex-col">
                {(roll.direction === 1 ? [column.from ?? "", column.to] : [column.to, column.from ?? ""]).map((char, cell) => (
                  <span key={cell} className="block h-[1lh]">{char}</span>
                ))}
              </span>
            ) : (
              <span className="block h-[1lh]">{column.to}</span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
