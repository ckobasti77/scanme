"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MetricsRange } from "@/convex/lib/metrics";

export function MetricsPeriodSelect({ value, onChange, ariaLabel }: { value: MetricsRange; onChange: (value: MetricsRange) => void; ariaLabel: string }) {
  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as MetricsRange)}>
      <SelectTrigger className="min-h-11 w-full justify-start border-0 bg-transparent px-0 py-1 text-left text-xs text-muted-foreground shadow-none focus-visible:ring-1 focus-visible:ring-primary" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7d">Poslednjih 7 dana</SelectItem>
        <SelectItem value="30d">Poslednjih 30 dana</SelectItem>
        <SelectItem value="90d">Poslednja 3 meseca</SelectItem>
        <SelectItem value="1y">Poslednjih godinu dana</SelectItem>
        <SelectItem value="all">Oduvek</SelectItem>
      </SelectContent>
    </Select>
  );
}
