// /[slug]/client-panel/meni/editor — "Editor" opens the real menu directly
// (master §13.4: no intro screen). Until the new editor exists (K10) that is
// the existing menu editor of the venue, which checks access on its own.

import { redirect } from "next/navigation";
import { postojeciEditorHref } from "@/lib/menu/panel-nav";

export default async function MenuPanelEditorPage({ params }: PageProps<"/[slug]/client-panel/meni/editor">) {
  const { slug } = await params;
  redirect(postojeciEditorHref(slug));
}
