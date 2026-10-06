"use client";

import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { downloadAdminFile } from "@/components/admin/events/download-file";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import { mailCallbackNotice } from "./mail-format";
import { MailWorkspace } from "./mail-workspace";
import type { MailSource } from "./use-mail-workspace";

// Admin UX Z1/Z2 — Convex container of /admin/posta. Status is reactive (own
// connections only, never a token); every Zoho call is an admin-only action
// called on demand. `status`/`kod` come from the OAuth callback redirect.
// Z2: an attachment is posted to a Convex upload URL (XHR, for the progress
// bar), registered, and handed to Zoho only by the send action.

function uploadWithProgress(url: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<Id<"_storage">>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      try {
        const storageId = (JSON.parse(request.responseText) as { storageId?: unknown }).storageId;
        if (request.status >= 200 && request.status < 300 && typeof storageId === "string") resolve(storageId as Id<"_storage">);
        else reject(new ConvexError({ code: "ZOHO_UNAVAILABLE" }));
      } catch {
        reject(new ConvexError({ code: "ZOHO_UNAVAILABLE" }));
      }
    };
    request.onerror = () => reject(new ConvexError({ code: "ZOHO_UNAVAILABLE" }));
    request.send(file);
  });
}

export function AdminMailContainer({ callbackStatus, callbackCode }: { callbackStatus?: string; callbackCode?: string }) {
  const convex = useConvex();
  const status = useQuery(api.adminMail.getMailStatus);
  const startConnect = useMutation(api.adminMail.startZohoConnect);
  const listFolders = useAction(api.adminMail.listFolders);
  const listMessages = useAction(api.adminMail.listMessages);
  const getMessage = useAction(api.adminMail.getMessage);
  const markRead = useAction(api.adminMail.markRead);
  const downloadAttachment = useAction(api.adminMail.downloadAttachment);
  const disconnect = useAction(api.adminMail.disconnect);
  const generateUploadUrl = useMutation(api.adminMail.generateMailUploadUrl);
  const registerUpload = useMutation(api.adminMail.registerMailUpload);
  const removeUpload = useMutation(api.adminMail.removeMailUpload);
  const sendMail = useAction(api.adminMail.sendMail);
  const updateSignature = useMutation(api.adminMail.updateSignature);
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
    uploadAttachment: async (file, onProgress) => {
      const url = await generateUploadUrl({});
      const storageId = await uploadWithProgress(url, file, onProgress);
      const result = await registerUpload({ storageId, fileName: file.name });
      if (result.status === "rejected") throw new ConvexError({ code: result.code });
      return { uploadId: result.uploadId, fileName: result.fileName, size: result.size };
    },
    removeAttachment: async (uploadId) => {
      await removeUpload({ uploadId });
    },
    send: (account, input) =>
      sendMail({
        sendCommandId: input.sendCommandId,
        connectionId: account.connectionId,
        accountId: account.accountId,
        mode: input.mode,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        bodyText: input.bodyText,
        ...(input.source ? { source: input.source } : {}),
        uploadIds: input.uploadIds,
        ...(input.mode === "forward" ? { forwardAttachmentIds: input.forwardAttachmentIds } : {}),
      }),
    checkSend: (sendCommandId) => convex.query(api.adminMail.getSendCommand, { sendCommandId }),
    suggestRecipients: (prefix) => convex.query(api.adminMail.suggestRecipients, { prefix }),
    saveSignature: async (account, signatureText) => {
      await updateSignature({ connectionId: account.connectionId, accountId: account.accountId, signatureText });
    },
  }), [
    convex,
    listFolders,
    listMessages,
    getMessage,
    markRead,
    downloadAttachment,
    startConnect,
    disconnect,
    generateUploadUrl,
    registerUpload,
    removeUpload,
    sendMail,
    updateSignature,
  ]);

  if (status === undefined) {
    return (
      <AdminPanel>
        <AdminLoadingState label={dict.pageTitle} />
      </AdminPanel>
    );
  }
  return <MailWorkspace status={status} source={source} initialNotice={initialNotice} />;
}
