import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminMailContainer } from "@/components/admin/mail/admin-mail";
import { postaSr } from "@/lib/i18n/sr/posta";

// Admin UX Z1 — Pošta: the admin's own Zoho mailbox (ADMIN-UX-ZAHTEVI §10).
export const metadata: Metadata = {
  title: `${postaSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function PostaPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; kod?: string | string[] }> }) {
  const { status, kod } = await searchParams;
  return (
    <AdminGuard>
      <AdminShell>
        <AdminMailContainer
          callbackStatus={typeof status === "string" ? status : undefined}
          callbackCode={typeof kod === "string" ? kod : undefined}
        />
      </AdminShell>
    </AdminGuard>
  );
}
