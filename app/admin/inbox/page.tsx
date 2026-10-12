import type { Metadata } from "next";
import { AdminInboxErrorBoundary, AdminInboxWorkspace } from "@/components/admin/admin-inbox";
import { communicationsSr } from "@/lib/i18n/sr/communications";
import type { Id } from "@/convex/_generated/dataModel";

export const metadata: Metadata = {
  title: `${communicationsSr.inboxTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ conversation?: string; assignee?: string }> }) {
  const query = await searchParams;
  return (
    <AdminInboxErrorBoundary><AdminInboxWorkspace initialConversationId={query.conversation as Id<"conversations"> | undefined} initialAssigneeId={query.assignee as Id<"users"> | undefined} /></AdminInboxErrorBoundary>
  );
}
