import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminMailPreview } from "@/components/admin/mail/admin-mail-preview";
import type { MailPreviewMessage, MailPreviewState } from "@/components/admin/mail/mail-fixtures";
import { postaSr } from "@/lib/i18n/sr/posta";

// Admin UX Z1 — dev preview of /admin/posta with TEST messages (no Convex, no
// Zoho). ?stanje=nije-podeseno|bez-naloga|greska|pisanje|pregled-pisma|potpis,
// ?poruka=tekst|nijedna.
const STATES: readonly MailPreviewState[] = ["spremno", "nije-podeseno", "bez-naloga", "greska", "pisanje", "pregled-pisma", "potpis"];
const MESSAGES: readonly MailPreviewMessage[] = ["html", "tekst", "nijedna"];

export default async function AdminMailPreviewPage({ searchParams }: { searchParams: Promise<{ stanje?: string; poruka?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { stanje, poruka } = await searchParams;
  const state = STATES.find((value) => value === stanje) ?? "spremno";
  const message = MESSAGES.find((value) => value === poruka) ?? "html";
  return (
    <AdminShell previewIdentity={postaSr.previewBadge} activePathname="/admin/posta">
      <AdminMailPreview state={state} message={message} />
    </AdminShell>
  );
}
