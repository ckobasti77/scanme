"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { PublicScanMeLinks } from "@/components/scanme-links/public-scanme-links";
import type { ScanMeLinksViewModel } from "@/components/scanme-links/templates/types";

type ScanResult =
  | { status: "direct"; destinationUrl: string }
  | { status: "links"; scanSessionId: string; view: ScanMeLinksViewModel }
  | { status: "missing" | "inactive" | "invalid_destination" | "error"; message: string };

const minimumLoaderTime = 400;

export function ScanRedirect({ slug }: { slug: string }) {
  const started = useRef(false);
  const requestId = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [linksSession, setLinksSession] = useState<{
    view: ScanMeLinksViewModel;
    requestId: string;
  } | null>(null);

  const runScan = useCallback(async () => {
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const [response] = await Promise.all([
        fetch(`/api/scans/${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: requestId.current }),
          cache: "no-store",
        }),
        new Promise((resolve) => window.setTimeout(resolve, minimumLoaderTime)),
      ]);
      const result = (await response.json()) as ScanResult;
      if (response.ok && result.status === "direct") {
        window.location.replace(result.destinationUrl);
        return;
      }
      if (response.ok && result.status === "links") {
        setLinksSession({ view: result.view, requestId: requestId.current! });
        return;
      }
      setError("message" in result ? result.message : "Odredište trenutno nije dostupno.");
    } catch {
      setError("Veza trenutno nije dostupna. Proverite internet i pokušajte ponovo.");
    }
  }, [slug]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runScan();
  }, [attempt, runScan]);

  function retry() {
    started.current = false;
    setAttempt((value) => value + 1);
  }

  if (linksSession) {
    return (
      <PublicScanMeLinks
        view={linksSession.view}
        requestId={linksSession.requestId}
      />
    );
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8">
      <div className="w-full max-w-md border border-border bg-card p-6 sm:p-10">
        <div className="mb-12 flex items-center" aria-label="ScanMe">
          <BrandLogo width="7rem" />
        </div>
        {error ? (
          <div role="alert">
            <p className="text-xs uppercase tracking-[0.14em] text-destructive">Preusmeravanje nije uspelo</p>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Odredište nije otvoreno.</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{error}</p>
            <button type="button" onClick={retry} className="button-primary mt-8 w-full">
              <RotateCcw aria-hidden="true" className="size-4" />
              Pokušaj ponovo
            </button>
          </div>
        ) : (
          <div aria-live="polite" aria-busy="true">
            <div className="scan-loader" aria-hidden="true"><span /></div>
            <h1 className="mt-8 text-2xl font-semibold tracking-[-0.04em]">Otvaramo odredište.</h1>
            <p className="mt-3 text-sm text-muted-foreground">Skeniranje je uspešno. Sačekajte trenutak.</p>
          </div>
        )}
      </div>
    </main>
  );
}
