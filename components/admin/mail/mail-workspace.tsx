"use client";

import type { AdminMailStatus } from "@/convex/lib/adminMailContract";
import { AdminMailView } from "./mail-view";
import { useMailWorkspace, type MailNotice, type MailSource } from "./use-mail-workspace";

// Admin UX Z1 — state (useMailWorkspace) + view (AdminMailView). The Convex
// container and the TEST preview differ only in `status` and `source`.
export function MailWorkspace({
  status,
  source,
  initialNotice,
  initialMessage,
  badge,
}: {
  status: AdminMailStatus;
  source: MailSource;
  initialNotice?: MailNotice | null;
  initialMessage?: { folderId: string; messageId: string } | null;
  badge?: string;
}) {
  const { model, actions } = useMailWorkspace({ status, source, initialNotice, initialMessage });
  return <AdminMailView model={model} actions={actions} badge={badge} />;
}
