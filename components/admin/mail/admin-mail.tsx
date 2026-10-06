"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { downloadAdminFile } from "@/components/admin/events/download-file";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import { mailCallbackNotice } from "./mail-format";
import { MailWorkspace } from "./mail-workspace";
import type { MailSource } from "./use-mail-workspace";

// Admin UX Z1 — Convex container of /admin/posta. Status is reactive (own
// connections only, never a token); every Zoho read is an admin-only action
// called on demand. `status`/`kod` come from the OAuth callback redirect.

export function AdminMailContainer({ callbackStatus, callbackCode }: { callbackStatus?: string; callbackCode?: string }) {
  const status = useQuery(api.adminMail.getMailStatus);
  const startConnect = useMutation(api.adminMail.startZohoConnect);
  const listFolders = useAction(api.adminMail.listFolders);
  const listMessages = useAction(api.adminMail.listMessages);
  const getMessage = useAction(api.adminMail.getMessage);
  const markRead = useAction(api.adminMail.markRead);
  const downloadAttachment = useAction(api.adminMail.downloadAttachment);
  const disconnect = useAction(api.adminMail.disconnect);
  const [initialNotice] = useState(() => mailCallbackNotice(callbackStatus, callbackCode));

  // The callback result is shown once; it does not stay in the address bar.
  useEffect(() => {
    if (callbackStatus) window.history.replaceState(null, "", "/admin/posta");
  }, [callbackStatus]);

  const source = useMemo<MailSource>(() => ({
    listFolders: (account) => listFolders({ connectionId: account.connectionId, accountId: account.accountId }),
    listMessages: (account, args) =>
      listMessages({
        connectionId: account.connectionId,
        accountId: account.accountId,
        folderId: args.folderId,
        start: args.start,
        limit: args.limit,
        unreadOnly: args.unreadOnly,
        ...(args.search ? { search: args.search } : {}),
      }),
    getMessage: (account, args) => getMessage({ connectionId: account.connectionId, accountId: account.accountId, ...args }),
    markRead: async (account, messageId) => {
      await markRead({ connectionId: account.connectionId, accountId: account.accountId, messageId });
    },
    downloadAttachment: async (account, args) => {
      downloadAdminFile(await downloadAttachment({ connectionId: account.connectionId, accountId: account.accountId, ...args }));
    },
    connect: async () => {
      const { authorizeUrl } = await startConnect({});
      window.location.assign(authorizeUrl);
    },
    disconnect: async (connectionId) => {
      await disconnect({ connectionId });
    },
  }), [listFolders, listMessages, getMessage, markRead, downloadAttachment, startConnect, disconnect]);

  if (status === undefined) {
    return (
      <AdminPanel>
        <AdminLoadingState label={dict.pageTitle} />
      </AdminPanel>
    );
  }
  return <MailWorkspace status={status} source={source} initialNotice={initialNotice} />;
}
