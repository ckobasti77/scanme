"use client";

import { useMemo } from "react";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import {
  previewInitialCompose,
  previewInitialMessage,
  previewMailSource,
  previewMailStatus,
  type MailPreviewMessage,
  type MailPreviewState,
} from "./mail-fixtures";
import { MailWorkspace } from "./mail-workspace";

// Admin UX Z1 — /dev/admin-mail-preview: the same workspace over TEST
// fixtures, without Convex and without Zoho.
export function AdminMailPreview({ state, message }: { state: MailPreviewState; message: MailPreviewMessage }) {
  const status = useMemo(() => previewMailStatus(state), [state]);
  const source = useMemo(() => previewMailSource(state), [state]);
  const initialMessage = useMemo(() => previewInitialMessage(message), [message]);
  const initialCompose = useMemo(() => previewInitialCompose(state), [state]);
  return (
    <MailWorkspace
      status={status}
      source={source}
      initialNotice={{ tone: "info", text: dict.previewNotice }}
      initialMessage={initialMessage}
      initialCompose={initialCompose}
      badge={dict.previewBadge}
    />
  );
}
