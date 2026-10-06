import { CircleAlert, Clock, Info } from "lucide-react";
import type { AdminUrgencyTone } from "@/lib/admin-v1/subnav";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A10 (A0 §2.5) — urgency of an item: hitno = danger + CircleAlert,
// uskoro = warning + Clock, info = neutral + Info. The word is always there,
// so the color is never the only signal.

const TONES: Record<AdminUrgencyTone, string> = {
  hitno: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
  uskoro: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  info: "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]",
};
export const ADMIN_URGENCY_ICONS = { hitno: CircleAlert, uskoro: Clock, info: Info } as const;

export function AdminUrgencyBadge({ tone, label, className }: { tone: AdminUrgencyTone; label?: string; className?: string }) {
  const Icon = ADMIN_URGENCY_ICONS[tone];
  return (
    <span data-admin-primitive="urgency" data-tone={tone} className={cn("inline-flex min-h-6 w-fit items-center gap-1 rounded-full border px-2 text-[0.7rem] leading-5 font-bold", TONES[tone], className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label ?? dict.urgencyLabel[tone]}
    </span>
  );
}
