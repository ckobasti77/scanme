import type { Metadata } from "next";
import { AdminTasksErrorBoundary, AdminTasksWorkspace } from "@/components/admin/admin-tasks";
import { adminTasksSr } from "@/lib/i18n/sr/admin-tasks";
import type { Id } from "@/convex/_generated/dataModel";

export const metadata: Metadata = {
  title: `${adminTasksSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

// ADMIN v2: the filters (also `?assignee=`) are read from the URL by the page itself.
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const query = await searchParams;
  return <AdminTasksErrorBoundary><AdminTasksWorkspace initialTaskId={query.task as Id<"clientTasks"> | undefined} /></AdminTasksErrorBoundary>;
}
