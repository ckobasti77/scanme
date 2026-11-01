import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPanel } from "@/components/admin/admin-primitives";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

// ADMIN v2 — two TEST pages under the real admin layout, to see what the
// guard lets through and that the frame stays mounted between them.
const PAGES: Readonly<Record<string, string>> = { "": adminV1Sr.navDashboard, klijenti: adminV1Sr.navClients };

export default async function AdminGuardPreviewPage({ params }: { params: Promise<{ stanje: string; strana?: string[] }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { stanje, strana = [] } = await params;
  const key = strana.join("/");
  if (!Object.hasOwn(PAGES, key)) notFound();
  const base = `/dev/admin-cuvar-preview/${stanje}`;
  return (
    <div className="grid min-w-0 gap-4" data-guard-preview-page={key || "dashboard"}>
      <AdminPageHeader title={PAGES[key]} badge={adminV1Sr.fixtureBadge} />
      <AdminPanel className="p-4">
        <nav className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link href={base} className="underline underline-offset-4">{adminV1Sr.navDashboard}</Link>
          <Link href={`${base}/klijenti`} className="underline underline-offset-4">{adminV1Sr.navClients}</Link>
        </nav>
      </AdminPanel>
    </div>
  );
}
