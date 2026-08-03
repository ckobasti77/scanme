"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MetricsRange } from "@/convex/lib/metrics";
import { cn } from "@/lib/utils";

export function MetricsPeriodSelect({ value, onChange, ariaLabel, triggerClassName, contentClassName, itemClassName }: { value: MetricsRange; onChange: (value: MetricsRange) => void; ariaLabel: string; triggerClassName?: string; contentClassName?: string; itemClassName?: string }) {
  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as MetricsRange)}>
      <SelectTrigger className={cn("min-h-11 w-full justify-center border-0 bg-transparent px-0 py-1 text-center text-xs text-muted-foreground shadow-none focus-visible:ring-1 focus-visible:ring-primary", triggerClassName)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        <SelectItem className={itemClassName} value="7d">Poslednjih 7 dana</SelectItem>
        <SelectItem className={itemClassName} value="30d">Poslednjih 30 dana</SelectItem>
        <SelectItem className={itemClassName} value="90d">Poslednja 3 meseca</SelectItem>
        <SelectItem className={itemClassName} value="1y">Poslednjih godinu dana</SelectItem>
        <SelectItem className={itemClassName} value="all">Oduvek</SelectItem>
      </SelectContent>
    </Select>
  );
}
