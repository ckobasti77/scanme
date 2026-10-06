import Link from "next/link";
import { AdminEmptyState, AdminPanel } from "@/components/admin/admin-primitives";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";

// Admin UX A2 — unknown event or section: a clear state with a way back,
// never a crash or a bare 404.

export function AdminEventsNotFound({ title, body, href, linkLabel }: { title: string; body: string; href: string; linkLabel: string }) {
  return (
    <AdminPanel>
      <AdminEmptyState title={title} body={body} />
      <div className="flex justify-center pb-6">
        <Link href={href} className={adminSecondaryButtonClass}>{linkLabel}</Link>
      </div>
    </AdminPanel>
  );
}
