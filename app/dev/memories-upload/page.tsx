// Dev-only harness for the TASK-16 client image pipeline
// (lib/memories-client): picks files, runs the real
// sniff → reserve → prepare → transfer → process queue against the dev
// deployment, and prints per-item state, byte sizes before/after, and
// timings. Unavailable in production, mirroring app/dev/template-gallery.
//
// THIS IS A MECHANISM PROBE, NOT THE GUEST PAGE — the designed guest
// experience is TASK-17. Everything here is developer chrome (raw machine
// keys and numbers, like the pipeline's own JSON log lines); the only
// guest-facing copy on screen is the items' errorMessage, which the module
// takes from the memories i18n dictionary.
//
// Prerequisite: a guest cookie for the space. Mint one by visiting
// /r/[cardCode] for a card that targets the space (npx convex run
// memoriesDevSeed:seed prints the codes), then open
// /dev/memories-upload?space=[spaceCode].
//
// The query param is `space`, NOT `code`, on purpose: ConvexAuthNextjsProvider
// wraps the whole app (app/layout.tsx) and claims `?code=` globally as its
// OAuth callback param — it tries to exchange the value and strips it from
// the URL with a client-side replace, which re-renders the page with empty
// searchParams. Anything guest-facing (TASK-17 included) must avoid `?code=`.

import { notFound } from "next/navigation";
import { MemoriesUploadHarness } from "./memories-upload-harness";

export const dynamic = "force-dynamic";

export default async function MemoriesUploadDevPage({
  searchParams,
}: PageProps<"/dev/memories-upload">) {
  if (process.env.NODE_ENV === "production") notFound();

  const resolved = await searchParams;
  const code = typeof resolved.space === "string" ? resolved.space : "";
  return (
    <MemoriesUploadHarness
      initialCode={code}
      convexUrl={process.env.NEXT_PUBLIC_CONVEX_URL ?? ""}
    />
  );
}
