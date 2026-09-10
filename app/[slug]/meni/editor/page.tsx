// /[slug]/meni/editor — server shell → client MenuEditorScreen (RFC-003 §1.a,
// TASK-51), mirroring app/[slug]/venue/editor/page.tsx. Authority lives in the
// Convex guard (requireBusinessAccess until TASK-61). The route is deliberately
// UNLINKED while MENU_EXISTS is false: no admin navigation, no client-panel
// action, no README entry points here — and it is noindexed.

import type { Metadata } from "next";
import { MenuEditorScreen } from "@/components/menu/editor/menu-editor";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";

export const metadata: Metadata = {
  title: dict.metaEditorTitle,
  robots: { index: false, follow: false },
};

export default async function MenuEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <MenuEditorScreen slug={slug} />;
}
