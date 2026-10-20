import { fmt } from "@/lib/i18n/format";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { ConstellationCounts } from "@/lib/admin-v2/constellation/types";

/** The text equivalent of the Constellation for a screen reader (pure). */
export function constellationSummary(counts: ConstellationCounts | null): string {
  if (!counts) return adminV1Sr.dashboardConstellationSummaryUnavailable;
  return fmt(adminV1Sr.dashboardConstellationSummary, {
    urgent: counts.urgent,
    today: counts.today,
    waiting: counts.needsReply + counts.graceOrWarning + counts.waitingScanme + counts.waitingClient,
    calm: counts.calm,
  });
}

export function ConstellationSummary({ counts }: { counts: ConstellationCounts | null }) {
  return (
    <p className="sr-only" data-constellation-summary="">
      {constellationSummary(counts)}
    </p>
  );
}
