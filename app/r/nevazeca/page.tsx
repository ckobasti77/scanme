import type { Metadata } from "next";
import { resolverSr } from "@/lib/i18n/sr/resolver";

// The "card not active" landing page (RFC-001 §2.7). A STATIC sibling of
// /r/[cardCode] — the static segment wins route matching, so the resolver can
// safely 302 here for unknown, disabled and broken cards. Copy comes from the
// typed dictionary (direct per-surface import keeps the bundle lean).

export const metadata: Metadata = {
  title: resolverSr.metaTitle,
  robots: { index: false },
};

export default function NevazecaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-50">
      <div className="w-full max-w-sm text-center">
        <p aria-hidden="true" className="mb-6 text-5xl">
          ⊘
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {resolverSr.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          {resolverSr.body}
        </p>
        <p className="mt-6 text-sm font-medium text-neutral-200">
          {resolverSr.hint}
        </p>
      </div>
    </main>
  );
}
