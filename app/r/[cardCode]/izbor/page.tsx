import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { fmt } from "@/lib/i18n/format";
import { resolverSr } from "@/lib/i18n/sr/resolver";

// TASK-37 (RFC-002 §2.4) — the BARE splitter: one printed card, several
// services, buttons and nothing else.
//
// DELIBERATELY UNSTYLED — DO NOT "IMPROVE" THIS PAGE. No branding, no logo,
// no palette, no template, no editor. A customer who cares how the splitter
// looks buys ScanMe Links and gets their styled Links page as the splitter
// instead. That ladder is the product decision (§2.4: "a fair ladder, not a
// trick") — making this page pretty removes the reason Links exists.
//
// The Memories button's href comes from the read model and points at the
// card-aware server hop /r/[cardCode]/m — NEVER link /m/[code] from here
// (see app/r/[cardCode]/m/route.ts for why that is forbidden).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/r/[cardCode]/izbor">): Promise<Metadata> {
  const { cardCode } = await params;
  const robots = { index: false, follow: false };
  const view = await fetchQuery(api.cards.getSplitterView, { cardCode });
  if (view.status !== "ok") return { robots };
  return {
    title: fmt(resolverSr.splitterMetaTitle, { name: view.businessName }),
    robots,
  };
}

export default async function SplitterPage({
  params,
}: PageProps<"/r/[cardCode]/izbor">) {
  const { cardCode } = await params;
  const view = await fetchQuery(api.cards.getSplitterView, { cardCode });
  if (view.status !== "ok") redirect("/r/nevazeca");

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-50">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          {view.businessName}
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-400">
          {resolverSr.splitterHint}
        </p>
        <ul className="mt-8 space-y-3">
          {view.buttons.map((button) => (
            <li key={button.href}>
              <a
                href={button.href}
                rel={button.external ? "noopener noreferrer" : undefined}
                className="block rounded-md border border-neutral-700 px-5 py-4 text-center text-base font-medium text-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
              >
                {button.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
