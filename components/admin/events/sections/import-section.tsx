"use client";

import { useConvex, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { attempt } from "@/components/admin/events/event-outcome";
import { EventImportView } from "@/components/admin/events/sections/import-view";

// Admin UX A2 — container of `import`. The payload is validated by the
// Convex argument validator; a wrong shape comes back as a failed call,
// never as a partial write.

export function ImportSection() {
  const convex = useConvex();
  const commit = useMutation(api.fairImport.commit);
  return (
    <EventImportView
      actions={{
        dryRun: (payload) => attempt(() => convex.query(api.fairImport.dryRun, { payload: payload as never })),
        commit: (payload) => attempt(() => commit({ payload: payload as never })),
      }}
    />
  );
}
