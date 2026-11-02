// /[slug]/meni/editor — server shell → client MenuEditorScreen (RFC-003 §1.a,
// TASK-51), mirroring app/[slug]/venue/editor/page.tsx. Authority lives in the
// Convex guard (requireBusinessAccess until TASK-61). The route is deliberately
// UNLINKED while MENU_EXISTS is false: no admin navigation, no client-panel
// action, no README entry points here — and it is noindexed.
// K10: a venue on the new Menu model is sent to the new editor in the client
// panel; every other venue gets this legacy editor as before.

import type { Metadata } from "next";
import { StariIliNoviEditor } from "@/components/menu/studio/ruta/stari-ili-novi";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import { menuNaslov } from "@/lib/menu-naslovi";

export const metadata: Metadata = {
  title: menuNaslov(dict.metaEditorTitle),
  robots: { index: false, follow: false },
};

export default async function MenuEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StariIliNoviEditor slug={slug} />;
}
