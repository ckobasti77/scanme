import type { Metadata } from "next";
import { AdminTasksErrorBoundary, AdminTasksWorkspace } from "@/components/admin/admin-tasks";
import { adminTasksSr } from "@/lib/i18n/sr/admin-tasks";
import type { Id } from "@/convex/_generated/dataModel";

export const metadata: Metadata = {
  title: `${adminTasksSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ task?: string; assignee?: string }> }) {
  const query = await searchParams;
  return <AdminTasksErrorBoundary><AdminTasksWorkspace initialTaskId={query.task as Id<"clientTasks"> | undefined} initialAssigneeId={query.assignee as Id<"users"> | undefined} /></AdminTasksErrorBoundary>;
}
