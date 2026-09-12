import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTasksErrorBoundary, AdminTasksWorkspace } from "@/components/admin/admin-tasks";
import { adminTasksSr } from "@/lib/i18n/sr/admin-tasks";
import type { Id } from "@/convex/_generated/dataModel";

export const metadata: Metadata = {
  title: `${adminTasksSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ task?: string; assignee?: string }> }) {
  const query = await searchParams;
  return <AdminGuard><AdminShell><AdminTasksErrorBoundary><AdminTasksWorkspace initialTaskId={query.task as Id<"clientTasks"> | undefined} initialAssigneeId={query.assignee as Id<"users"> | undefined} /></AdminTasksErrorBoundary></AdminShell></AdminGuard>;
}
