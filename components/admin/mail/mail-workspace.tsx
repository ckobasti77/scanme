"use client";

import type { AdminMailStatus } from "@/convex/lib/adminMailContract";
import { MailComposePanel } from "./mail-compose";
import { MailSignaturePanel } from "./mail-signature";
import { AdminMailView } from "./mail-view";
import { useMailCompose, type MailComposeInitial } from "./use-mail-compose";
import { useMailWorkspace, type MailNotice, type MailSource, type MailViewActions } from "./use-mail-workspace";

// Admin UX Z1/Z2 — state (useMailWorkspace, useMailCompose) + view
// (AdminMailView, compose and signature sheets). The Convex container and the
// TEST preview differ only in `status` and `source`.
export function MailWorkspace({
  status,
  source,
  initialNotice,
  initialMessage,
  initialCompose,
  badge,
}: {
  status: AdminMailStatus;
  source: MailSource;
  initialNotice?: MailNotice | null;
  initialMessage?: { folderId: string; messageId: string } | null;
  initialCompose?: MailComposeInitial;
  badge?: string;
}) {
  const { model, actions, controls } = useMailWorkspace({ status, source, initialNotice, initialMessage });
  const compose = useMailCompose({ source, accounts: model.accounts, controls, initial: initialCompose });
  const viewActions: MailViewActions = { ...actions, compose: compose.open, openSignature: compose.openSignature };
  return (
    <>
      <AdminMailView model={model} actions={viewActions} badge={badge} />
      <MailComposePanel model={compose.model} actions={compose.actions} />
      <MailSignaturePanel model={compose.signatureModel} actions={compose.signatureActions} />
    </>
  );
}
