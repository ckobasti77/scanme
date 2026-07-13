"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type ScanResult =
  | { status: "available"; destinationUrl: string }
  | { status: "missing" | "inactive" | "invalid_destination" | "error"; message: string };

const minimumLoaderTime = 400;

export function ScanRedirect({ slug }: { slug: string }) {
  const started = useRef(false);
  const requestId = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      if (response.ok && result.status === "available") {
        window.location.replace(result.destinationUrl);
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

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8">
      <div className="w-full max-w-md border border-border bg-card p-6 sm:p-10">
        <div className="mb-12 flex items-center gap-3 text-sm font-semibold">
          <span className="scan-mark" aria-hidden="true" />
          <span>SCANME</span>
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
