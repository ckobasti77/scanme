"use client";

import { useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { AdminMailComposeMode, AdminMailMessage, AdminMailSendStatus } from "@/convex/lib/adminMailContract";
import { normalizeRecipient } from "@/convex/lib/adminMailCompose";
import { adminMailAttachmentMimeType } from "@/convex/lib/zohoMailClient";
import { fmt } from "@/lib/i18n/format";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import {
  attachmentProblem,
  clearMailDraft,
  composeReadiness,
  initialComposeDraft,
  mailDraftKey,
  newSendCommandId,
  readMailDraft,
  renderComposePreview,
  writeMailDraft,
  type ComposeReadiness,
  type MailComposeAttachment,
  type MailComposeDraft,
  type MailComposeSource,
} from "./compose-logic";
import { mailErrorText, mailFailure, type MailFailure } from "./mail-format";
import type { MailAccountOption, MailNotice, MailSource } from "./use-mail-workspace";

// Admin UX Z2 — state of the compose window and of the signature editor. The
// text draft is kept in localStorage (never attachments); attachments go to
// Convex storage at once and are removed when the window closes; one send
// attempt = one new sendCommandId, and an uncertain outcome is never resent
// without the admin's explicit confirmation.

export type RecipientField = "to" | "cc" | "bcc";

export type MailComposeState = {
  mode: AdminMailComposeMode;
  accountKey: string;
  source: MailComposeSource | null;
  draft: MailComposeDraft;
  attachments: MailComposeAttachment[];
  /** Forward: the original attachments that go along. */
  forwardIds: string[];
  tab: "write" | "preview";
  sending: boolean;
  outcome: { kind: "failed" | "uncertain"; failure: MailFailure } | null;
  problem: string | null;
  draftKey: string;
};

export type MailComposeModel = {
  state: MailComposeState;
  accounts: MailAccountOption[];
  account: MailAccountOption | null;
  readiness: ComposeReadiness;
  preview: { html: string; text: string; subject: string };
};

export type MailComposeActions = {
  setAccount(key: string): void;
  updateDraft(patch: Partial<MailComposeDraft>): void;
  addRecipients(field: RecipientField, values: string[]): void;
  removeRecipient(field: RecipientField, index: number): void;
  addFiles(files: File[]): void;
  removeAttachment(localId: string): void;
  toggleForward(attachmentId: string): void;
  setTab(tab: "write" | "preview"): void;
  send(): void;
  close(): void;
  discard(): void;
  suggest(prefix: string): Promise<{ email: string; name: string }[]>;
};

export type MailSignatureModel = { accounts: MailAccountOption[]; accountKey: string; text: string; saving: boolean };
export type MailSignatureActions = { selectAccount(key: string): void; setText(text: string): void; save(): void; close(): void };

export type MailComposeInitial = {
  compose?: {
    mode: AdminMailComposeMode;
    source: MailComposeSource | null;
    draft: MailComposeDraft;
    attachments?: MailComposeAttachment[];
    tab?: "write" | "preview";
  };
  signatureOpen?: boolean;
};

function draftStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const UNCERTAIN: AdminMailSendStatus[] = ["needs_reconciliation", "pending", "sending"];

export function useMailCompose({
  source,
  accounts,
  controls,
  initial,
}: {
  source: MailSource;
  accounts: MailAccountOption[];
  controls: {
    account: MailAccountOption | null;
    message: AdminMailMessage | null;
    selected: { folderId: string; messageId: string } | null;
    notify(notice: MailNotice): void;
    refreshList(): void;
  };
  initial?: MailComposeInitial;
}) {
  const [compose, setCompose] = useState<MailComposeState | null>(() => {
    const start = initial?.compose;
    const account = accounts[0];
    if (!start || !account) return null;
    return {
      mode: start.mode,
      accountKey: account.key,
      source: start.source,
      draft: start.draft,
      attachments: start.attachments ?? [],
      forwardIds: [],
      tab: start.tab ?? "write",
      sending: false,
      outcome: null,
      problem: null,
      draftKey: mailDraftKey(account.key, start.mode, start.source?.messageId ?? null),
    };
  });
  const [signature, setSignature] = useState<{ accountKey: string; text: string; saving: boolean } | null>(() => {
    const account = accounts[0];
    return initial?.signatureOpen && account ? { accountKey: account.key, text: account.signatureText ?? "", saving: false } : null;
  });
  const liveUploads = useRef(new Set<string>());
  const localCounter = useRef(0);

  // The text draft follows every change (localStorage only; attachments never).
  const draftKey = compose?.draftKey ?? null;
  const draft = compose?.draft ?? null;
  useEffect(() => {
    if (draftKey && draft) writeMailDraft(draftStorage(), draftKey, draft);
  }, [draftKey, draft]);

  const patch = (update: (state: MailComposeState) => MailComposeState) => setCompose((state) => (state ? update(state) : state));

  const dropUploads = (attachments: MailComposeAttachment[]) => {
    for (const item of attachments) {
      liveUploads.current.delete(item.localId);
      if (item.uploadId) source.removeAttachment(item.uploadId).catch(() => {});
    }
  };

  function open(mode: AdminMailComposeMode) {
    const account = controls.account ?? accounts[0];
    if (!account) return;
    const message = mode === "new" ? null : controls.message;
    if (mode !== "new" && (!message || !controls.selected)) return;
    const key = mailDraftKey(account.key, mode, message?.messageId ?? null);
    const base = initialComposeDraft(mode, message, accounts.map((option) => option.emailAddress));
    const saved = readMailDraft(draftStorage(), key);
    setCompose({
      mode,
      accountKey: account.key,
      source: message && controls.selected ? { folderId: controls.selected.folderId, messageId: message.messageId, message } : null,
      draft: saved ? { ...base, ...saved, showCc: saved.cc.length > 0 || base.showCc, showBcc: saved.bcc.length > 0 } : base,
      attachments: [],
      forwardIds: mode === "forward" && message
        ? message.attachments.filter((item) => !item.inline && adminMailAttachmentMimeType(item.fileName)).map((item) => item.attachmentId)
        : [],
      tab: "write",
      sending: false,
      outcome: null,
      problem: null,
      draftKey: key,
    });
  }

  const forwarded = (state: MailComposeState) =>
    state.source ? state.source.message.attachments.filter((item) => state.forwardIds.includes(item.attachmentId)) : [];

  const actions: MailComposeActions = {
    setAccount: (key) => patch((state) => ({ ...state, accountKey: key, draftKey: mailDraftKey(key, state.mode, state.source?.messageId ?? null) })),
    updateDraft: (change) => patch((state) => ({ ...state, draft: { ...state.draft, ...change }, problem: null })),
    addRecipients: (field, values) =>
      patch((state) => {
        const current = state.draft[field];
        const next = [...current];
        for (const raw of values) {
          const value = normalizeRecipient(raw) ?? raw.trim();
          if (value && !next.includes(value)) next.push(value);
        }
        return { ...state, draft: { ...state.draft, [field]: next }, problem: null };
      }),
    removeRecipient: (field, index) =>
      patch((state) => ({ ...state, draft: { ...state.draft, [field]: state.draft[field].filter((_, position) => position !== index) } })),
    addFiles(files) {
      if (!compose) return;
      let attachments = [...compose.attachments];
      const extra = forwarded(compose);
      const forwardedBytes = extra.reduce((sum, item) => sum + item.size, 0);
      const added: MailComposeAttachment[] = [];
      for (const file of files) {
        const localId = `prilog-${++localCounter.current}`;
        const problem = attachmentProblem(file, attachments, forwardedBytes, extra.length);
        const entry: MailComposeAttachment = {
          localId,
          fileName: file.name,
          size: file.size,
          progress: 0,
          status: problem ? "error" : "uploading",
          uploadId: null,
          errorCode: problem,
        };
        attachments = [...attachments, entry];
        added.push(entry);
        if (problem) continue;
        liveUploads.current.add(localId);
        source
          .uploadAttachment(file, (fraction) =>
            patch((state) => ({ ...state, attachments: state.attachments.map((item) => (item.localId === localId ? { ...item, progress: fraction } : item)) })),
          )
          .then(
            (result) => {
              if (!liveUploads.current.has(localId)) {
                source.removeAttachment(result.uploadId).catch(() => {});
                return;
              }
              patch((state) => ({
                ...state,
                attachments: state.attachments.map((item) =>
                  item.localId === localId ? { ...item, status: "ready", progress: 1, uploadId: result.uploadId, size: result.size, fileName: result.fileName } : item,
                ),
              }));
            },
            (error: unknown) => {
              liveUploads.current.delete(localId);
              const code = mailFailure(error).code;
              patch((state) => ({
                ...state,
                attachments: state.attachments.map((item) => (item.localId === localId ? { ...item, status: "error", errorCode: code } : item)),
              }));
            },
          );
      }
      patch((state) => ({ ...state, attachments: [...state.attachments, ...added], problem: null }));
    },
    removeAttachment(localId) {
      const item = compose?.attachments.find((attachment) => attachment.localId === localId);
      if (item) dropUploads([item]);
      patch((state) => ({ ...state, attachments: state.attachments.filter((attachment) => attachment.localId !== localId) }));
    },
    toggleForward: (attachmentId) =>
      patch((state) => ({
        ...state,
        forwardIds: state.forwardIds.includes(attachmentId) ? state.forwardIds.filter((id) => id !== attachmentId) : [...state.forwardIds, attachmentId],
      })),
    setTab: (tab) => patch((state) => ({ ...state, tab })),
    send() {
      const state = compose;
      if (!state || state.sending) return;
      const account = accounts.find((option) => option.key === state.accountKey);
      if (!account) return;
      const readiness = composeReadiness(state.mode, state.draft, state.attachments);
      const problem = !readiness.recipients.ok
        ? readiness.recipients.reason === "invalid"
          ? fmt(dict.compose.invalidRecipient, { address: readiness.recipients.invalid[0] })
          : readiness.recipients.reason === "missing_to"
            ? dict.compose.missingRecipient
            : dict.errors.ZOHO_RECIPIENT_INVALID
        : readiness.subjectMissing
          ? dict.compose.subjectMissing
          : readiness.uploading
            ? dict.compose.waitForUploads
            : null;
      if (problem || !readiness.recipients.ok) {
        patch((current) => ({ ...current, problem, tab: "write" }));
        return;
      }
      if (state.outcome?.kind === "uncertain" && !window.confirm(dict.compose.resendConfirm)) return;
      const sendCommandId = newSendCommandId();
      const uploadIds = state.attachments.filter((item) => item.status === "ready" && item.uploadId).map((item) => item.uploadId as Id<"adminMailUploads">);
      patch((current) => ({ ...current, sending: true, problem: null }));
      const attempt = source
        .send(account, {
          sendCommandId,
          mode: state.mode,
          to: readiness.recipients.to,
          cc: readiness.recipients.cc,
          bcc: readiness.recipients.bcc,
          subject: state.draft.subject,
          bodyText: state.draft.body,
          source: state.source ? { folderId: state.source.folderId, messageId: state.source.messageId } : null,
          uploadIds,
          forwardAttachmentIds: state.mode === "forward" ? state.forwardIds : [],
        })
        .then(
          (result) => ({ status: result.status, errorCode: result.errorCode }),
          async (error: unknown) => {
            const failure = mailFailure(error);
            // A stable code = refused before anything was sent. A lost connection: ask what happened to this attempt.
            if (failure.code !== "ACTION_FAILED") return { status: "failed" as const, errorCode: failure.code };
            const stored = await source.checkSend(sendCommandId).catch(() => null);
            return stored ?? { status: "needs_reconciliation" as const, errorCode: "ZOHO_SEND_UNCERTAIN" };
          },
        );
      attempt.then((outcome) => {
        if (outcome.status === "sent") {
          clearMailDraft(draftStorage(), state.draftKey);
          liveUploads.current.clear();
          setCompose(null);
          controls.notify({ tone: "success", text: dict.compose.sent, action: "openSent" });
          controls.refreshList();
          return;
        }
        const failure: MailFailure = { code: outcome.errorCode ?? "ACTION_FAILED", retryAfterSeconds: null };
        if (UNCERTAIN.includes(outcome.status)) {
          // The server removed the temporary files; a new attempt needs them again.
          liveUploads.current.clear();
          patch((current) => ({ ...current, sending: false, attachments: [], outcome: { kind: "uncertain", failure: { code: "ZOHO_SEND_UNCERTAIN", retryAfterSeconds: null } } }));
          return;
        }
        patch((current) => ({ ...current, sending: false, outcome: { kind: "failed", failure } }));
      });
    },
    close() {
      if (!compose || compose.sending) return;
      dropUploads(compose.attachments);
      setCompose(null);
    },
    discard() {
      if (!compose || compose.sending) return;
      const dirty = compose.draft.body.trim() || compose.attachments.length > 0 || (compose.mode === "new" && compose.draft.to.length > 0);
      if (dirty && !window.confirm(dict.compose.discardConfirm)) return;
      clearMailDraft(draftStorage(), compose.draftKey);
      dropUploads(compose.attachments);
      setCompose(null);
    },
    suggest: (prefix) => source.suggestRecipients(prefix),
  };

  const account = compose ? accounts.find((option) => option.key === compose.accountKey) ?? null : null;
  const model: MailComposeModel | null = compose
    ? {
        state: compose,
        accounts,
        account,
        readiness: composeReadiness(compose.mode, compose.draft, compose.attachments),
        preview: renderComposePreview({ mode: compose.mode, draft: compose.draft, source: compose.source?.message ?? null, signatureText: account?.signatureText ?? null }),
      }
    : null;

  const signatureActions: MailSignatureActions = {
    selectAccount(key) {
      const option = accounts.find((item) => item.key === key);
      if (option) setSignature({ accountKey: key, text: option.signatureText ?? "", saving: false });
    },
    setText: (text) => setSignature((state) => (state ? { ...state, text } : state)),
    save() {
      const state = signature;
      const option = state ? accounts.find((item) => item.key === state.accountKey) : null;
      if (!state || !option || state.saving) return;
      setSignature({ ...state, saving: true });
      source.saveSignature(option, state.text).then(
        () => {
          setSignature(null);
          controls.notify({ tone: "success", text: dict.settings.saved });
        },
        (error: unknown) => {
          setSignature((current) => (current ? { ...current, saving: false } : current));
          controls.notify({ tone: "error", text: mailErrorText(mailFailure(error)) });
        },
      );
    },
    close: () => setSignature((state) => (state?.saving ? state : null)),
  };

  return {
    model,
    actions,
    open,
    signatureModel: signature ? { accounts, accountKey: signature.accountKey, text: signature.text, saving: signature.saving } : null,
    signatureActions,
    openSignature() {
      const option = controls.account ?? accounts[0];
      if (option) setSignature({ accountKey: option.key, text: option.signatureText ?? "", saving: false });
    },
  };
}
