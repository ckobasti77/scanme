import { notFound } from "next/navigation";
import { AdminClientsPreview } from "@/components/admin/admin-clients";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export const dynamic = "force-dynamic";

export default async function AdminClientsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  const mode = state === "loading" || state === "empty" || state === "error"
    ? state
    : "loaded";
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/klijenti">
      <AdminClientsPreview mode={mode} />
    </AdminShell>
  );
}
