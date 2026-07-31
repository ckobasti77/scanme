"use client";

import { useState, type MouseEvent } from "react";
import { ScanMeLinksTemplate } from "@/components/scanme-links/templates/registry";
import type {
  PublicDestination,
  ScanMeLinksViewModel,
} from "@/components/scanme-links/templates/types";

export function PublicScanMeLinks({
  view,
  requestId,
}: {
  view: ScanMeLinksViewModel;
  requestId: string;
}) {
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function openDestination(
    destination: PublicDestination,
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    event.preventDefault();
    if (!destination.url || destination.state === "inactive") return;
    if (openingId) return;
    setOpeningId(destination.id);
    const clickId = crypto.randomUUID();
    try {
      await fetch("/api/scanme-links/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          destinationId: destination.id,
          clickId,
        }),
        cache: "no-store",
        keepalive: true,
      });
    } finally {
      window.location.assign(destination.url);
    }
  }

  return (
    <>
      <style>{`[data-theme-toggle="global"]{display:none!important}`}</style>
      <ScanMeLinksTemplate
        view={view}
        requestId={requestId}
        onDestinationClick={openDestination}
      />
    </>
  );
}
