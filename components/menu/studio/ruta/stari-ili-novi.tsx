"use client";

// ScanMe Menu V1 — /[slug]/meni/editor after K10 (K01 §7.1). A venue whose
// Menu runs on the new model opens the new editor in the client panel; a
// venue on the legacy model (or one whose legacy menu is not cut over yet)
// keeps the legacy editor exactly as before, which checks access on its own.

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { panelSekcijaHref } from "@/lib/menu/panel-nav";
import { MenuEditorScreen } from "../../editor/menu-editor";

export function StariIliNoviEditor({ slug }: { slug: string }) {
  const router = useRouter();
  const { isLoading } = useConvexAuth();
  const ulaz = useQuery(api.menuStudio.entry, isLoading ? "skip" : { slug });

  useEffect(() => {
    if (ulaz?.kind === "studio") router.replace(panelSekcijaHref(slug, "editor"));
  }, [ulaz?.kind, router, slug]);

  if (ulaz === undefined || ulaz.kind === "studio") {
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        {menuStudioSr.stanja.stariEditor}
      </p>
    );
  }
  return <MenuEditorScreen slug={slug} />;
}
