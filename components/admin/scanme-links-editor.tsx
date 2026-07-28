"use client";

import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EditorAccessGuard } from "@/components/admin/editor-access-guard";
import { EditorWorkspace } from "@/components/admin/scanme-links-editor/editor-workspace";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

export function ScanMeLinksEditorScreen({
  routeKey,
}: {
  routeKey: string;
}) {
  return (
    <EditorAccessGuard routeKey={routeKey}>
      <EditorLoader routeKey={routeKey} />
    </EditorAccessGuard>
  );
}

function EditorLoader({ routeKey }: { routeKey: string }) {
  const router = useRouter();
  const data = useQuery(api.scanMeLinks.editorByRouteKey, { routeKey });

  useEffect(() => {
    if (data?.clientPanelSlug && data.clientPanelSlug !== routeKey) {
      router.replace(`/admin/scanme-links/${data.clientPanelSlug}/editor`);
    }
  }, [data?.clientPanelSlug, routeKey, router]);

  if (data === undefined) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4f2ec] p-6">
        <div className="w-full max-w-xs">
          <div className="h-1 overflow-hidden rounded-full bg-black/10">
            <span className="block h-full w-2/5 animate-pulse rounded-full bg-primary" />
          </div>
          <p className="mt-3 text-center text-xs text-black/55">
            Učitavanje editora…
          </p>
        </div>
      </main>
    );
  }

  if (!data?.profile || !data.config) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4f2ec] px-4">
        <section className="w-full max-w-lg rounded-[18px] border border-black/10 bg-[#fcfbf8] p-7">
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">
            Editor nije dostupan
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/60">
            ScanMe Links profil za ovaj lokal nije pronađen.
          </p>
          <Button asChild className="mt-6 rounded-xl">
            <Link href="/admin/scanme-links">
              <ArrowLeft className="size-4" />
              Nazad na lokale
            </Link>
          </Button>
        </section>
      </main>
    );
  }

  return <EditorWorkspace data={data} />;
}
