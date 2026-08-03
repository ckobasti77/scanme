"use client";

import { useEffect, useState, type MouseEvent } from "react";
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

  // Povratak iz bfcache-a (swipe-back) vraća stranicu sa zadržanim state-om;
  // bez resetovanja bi svaki sledeći klik bio blokiran openingId guard-om.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setOpeningId(null);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function openDestination(
    destination: PublicDestination,
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    event.preventDefault();
    if (!destination.url || destination.state === "inactive") return;
    if (openingId) return;
    setOpeningId(destination.id);
    const clickId = crypto.randomUUID();
    // keepalive garantuje da beacon preživi napuštanje stranice, pa
    // navigacija ne čeka odgovor analitike.
    void fetch("/api/scanme-links/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        destinationId: destination.id,
        clickId,
      }),
      cache: "no-store",
      keepalive: true,
    }).catch(() => undefined);
    window.location.assign(destination.url);
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
