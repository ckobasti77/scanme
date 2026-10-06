"use client";

import { AlertTriangle, Bold, Link2, Paperclip, Send, Trash2, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { normalizeRecipient } from "@/convex/lib/adminMailCompose";
import {
  ADMIN_MAIL_SEND_MAX_ATTACHMENTS,
  ADMIN_MAIL_SEND_TOTAL_MAX_BYTES,
} from "@/convex/lib/adminMailContract";
import { adminFieldClass, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { fmt } from "@/lib/i18n/format";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import { cn } from "@/lib/utils";
import { applyBold, applyLink, splitRecipientInput } from "./compose-logic";
import { MailHtmlFrame } from "./mail-html-frame";
import { mailErrorText, mailSize } from "./mail-format";
import type { MailComposeActions, MailComposeModel, RecipientField as RecipientFieldName } from "./use-mail-compose";

// Admin UX Z2 — the compose window: a sheet on the right (full screen on a
// phone). MailComposeView is the content (props + local field state only) so
// it renders in tests and the preview without the dialog.

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";
const chipButton = cn("grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--admin-surface-muted)]", focusRing);
const toolButton = cn(
  "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-2.5 text-xs font-semibold",
  focusRing,
);

export function MailComposePanel({ model, actions }: { model: MailComposeModel | null; actions: MailComposeActions }) {
  return (
    <Sheet open={model !== null} onOpenChange={(open) => (open ? undefined : actions.close())}>
      <SheetContent
        side="right"
        data-reveal="off"
        // Focus goes to the field where writing starts (autoFocus below), not to the first tab.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="admin-v1 w-full max-w-none gap-0 border-[var(--admin-border)] bg-[var(--admin-app)] p-0 text-[var(--admin-text)] shadow-[var(--admin-shadow-lg)] sm:max-w-none lg:w-[46rem] lg:max-w-[calc(100vw-2rem)]"
      >
        {model ? (
          <>
            <div className="border-b border-[var(--admin-border)] px-4 pt-4 pb-3 pr-14 sm:px-6">
              <SheetTitle className="text-xl font-semibold tracking-[-0.02em]">{dict.compose.titles[model.state.mode]}</SheetTitle>
              <SheetDescription className="mt-1 text-xs text-[var(--admin-text-muted)]">{dict.compose.draftSaved}</SheetDescription>
            </div>
            <MailComposeView model={model} actions={actions} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function MailComposeView({ model, actions }: { model: MailComposeModel; actions: MailComposeActions }) {
  const id = useId();
  const state = model.state;
  const writeId = `${id}-pisanje`;
  const previewId = `${id}-pregled`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={dict.compose.tabsLabel} className="flex gap-1 border-b border-[var(--admin-border)] px-4 pt-2 sm:px-6">
        {(["write", "preview"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`${id}-tab-${tab}`}
            aria-selected={state.tab === tab}
            aria-controls={tab === "write" ? writeId : previewId}
            tabIndex={state.tab === tab ? 0 : -1}
            onClick={() => actions.setTab(tab)}
            // the global `button { border-radius }` would round the underline
            style={{ borderRadius: 0 }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                actions.setTab(tab === "write" ? "preview" : "write");
              }
            }}
            className={cn(
              "-mb-px min-h-10 border-b-2 px-3 text-sm font-semibold",
              state.tab === tab ? "border-[var(--admin-ink)] text-[var(--admin-text)]" : "border-transparent text-[var(--admin-text-muted)]",
              focusRing,
            )}
          >
            {tab === "write" ? dict.compose.tabWrite : dict.compose.tabPreview}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {state.tab === "write" ? (
          <div role="tabpanel" id={writeId} aria-labelledby={`${id}-tab-write`} className="grid min-w-0 gap-4">
            <ComposeFields model={model} actions={actions} idPrefix={id} />
          </div>
        ) : (
          <div role="tabpanel" id={previewId} aria-labelledby={`${id}-tab-preview`} className="grid min-w-0 gap-3">
            <MailHtmlFrame html={model.preview.html} allowRemoteImages={false} title={fmt(dict.compose.previewTitle, { subject: model.preview.subject })} className="h-[60vh]" />
            <details className="rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold">{dict.compose.textVersion}</summary>
              <pre className="mt-2 max-h-72 overflow-auto font-[inherit] text-sm leading-6 break-words whitespace-pre-wrap">{model.preview.text}</pre>
            </details>
          </div>
        )}
      </div>

      <ComposeFooter model={model} actions={actions} />
    </div>
  );
}

function ComposeFields({ model, actions, idPrefix }: { model: MailComposeModel; actions: MailComposeActions; idPrefix: string }) {
  const state = model.state;
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function edit(apply: (text: string, start: number, end: number) => { text: string; selectionStart: number; selectionEnd: number }) {
    const element = bodyRef.current;
    const start = element?.selectionStart ?? state.draft.body.length;
    const end = element?.selectionEnd ?? start;
    const next = apply(state.draft.body, start, end);
    actions.updateDraft({ body: next.text });
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  return (
    <>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-od`} className="text-xs font-semibold text-[var(--admin-text-muted)]">{dict.compose.from}</label>
        {model.accounts.length > 1 ? (
          <select id={`${idPrefix}-od`} className={adminFieldClass} value={state.accountKey} onChange={(event) => actions.setAccount(event.target.value)}>
            {model.accounts.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        ) : (
          <output id={`${idPrefix}-od`} className="text-sm font-medium">{model.account?.emailAddress}</output>
        )}
      </div>

      <RecipientInput id={`${idPrefix}-za`} label={dict.compose.to} values={state.draft.to} field="to" actions={actions} autoFocus={state.mode === "new"} />
      {state.draft.showCc ? <RecipientInput id={`${idPrefix}-cc`} label={dict.compose.cc} values={state.draft.cc} field="cc" actions={actions} /> : null}
      {state.draft.showBcc ? <RecipientInput id={`${idPrefix}-bcc`} label={dict.compose.bcc} values={state.draft.bcc} field="bcc" actions={actions} /> : null}
      {!state.draft.showCc || !state.draft.showBcc ? (
        <div className="-mt-2 flex gap-2">
          {!state.draft.showCc ? (
            <button type="button" className={toolButton} onClick={() => actions.updateDraft({ showCc: true })}>{dict.compose.addCc}</button>
          ) : null}
          {!state.draft.showBcc ? (
            <button type="button" className={toolButton} onClick={() => actions.updateDraft({ showBcc: true })}>{dict.compose.addBcc}</button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-naslov`} className="text-xs font-semibold text-[var(--admin-text-muted)]">{dict.compose.subject}</label>
        <input
          id={`${idPrefix}-naslov`}
          className={adminFieldClass}
          value={state.draft.subject}
          maxLength={300}
          onChange={(event) => actions.updateDraft({ subject: event.target.value })}
        />
      </div>

      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${idPrefix}-telo`} className="text-xs font-semibold text-[var(--admin-text-muted)]">{dict.compose.body}</label>
          <div role="toolbar" aria-label={dict.compose.toolbarLabel} className="flex gap-1.5">
            <button type="button" className={toolButton} onClick={() => edit((text, start, end) => applyBold(text, start, end, dict.compose.bold.toLowerCase()))}>
              <Bold className="size-3.5" aria-hidden="true" />
              {dict.compose.bold}
            </button>
            <button
              type="button"
              className={toolButton}
              onClick={() => {
                const url = window.prompt(dict.compose.linkPrompt, "https://")?.trim();
                if (url && /^(https?:\/\/|mailto:)\S+$/i.test(url)) edit((text, start, end) => applyLink(text, start, end, url));
              }}
            >
              <Link2 className="size-3.5" aria-hidden="true" />
              {dict.compose.link}
            </button>
          </div>
        </div>
        <textarea
          id={`${idPrefix}-telo`}
          ref={bodyRef}
          autoFocus={state.mode !== "new"}
          rows={12}
          maxLength={50_000}
          value={state.draft.body}
          placeholder={dict.compose.bodyPlaceholder}
          onChange={(event) => actions.updateDraft({ body: event.target.value })}
          className={cn(adminFieldClass, "min-h-56 resize-y py-2.5 leading-6")}
        />
        <p className="text-xs text-[var(--admin-text-muted)]">{dict.compose.formattingHint}</p>
      </div>

      <p className="text-xs leading-5 text-[var(--admin-text-muted)]">
        {model.account?.signatureText ? dict.compose.signatureNote : dict.compose.noSignature}
        {state.mode === "reply" || state.mode === "reply_all" ? ` ${dict.compose.quoteNote.reply}` : null}
        {state.mode === "forward" ? ` ${dict.compose.quoteNote.forward}` : null}
      </p>

      {state.mode === "forward" && state.source && state.source.message.attachments.some((item) => !item.inline) ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-semibold text-[var(--admin-text-muted)]">{dict.compose.forwardAttachments}</legend>
          {state.source.message.attachments.filter((item) => !item.inline).map((item) => (
            <label key={item.attachmentId} className="flex min-w-0 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={state.forwardIds.includes(item.attachmentId)} onChange={() => actions.toggleForward(item.attachmentId)} />
              <Paperclip className="size-3.5 shrink-0 text-[var(--admin-text-muted)]" aria-hidden="true" />
              <span className="min-w-0 truncate">{item.fileName}</span>
              <span className="shrink-0 text-xs text-[var(--admin-text-muted)]">{mailSize(item.size)}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <AttachmentZone model={model} actions={actions} idPrefix={idPrefix} />
    </>
  );
}

function RecipientInput({
  id,
  label,
  values,
  field,
  actions,
  autoFocus = false,
}: {
  id: string;
  label: string;
  values: string[];
  field: RecipientFieldName;
  actions: MailComposeActions;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<{ email: string; name: string }[]>([]);
  const [active, setActive] = useState(-1);
  const suggestRef = useRef(actions.suggest);
  useEffect(() => {
    suggestRef.current = actions.suggest;
  });
  useEffect(() => {
    const prefix = input.trim();
    if (prefix.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      suggestRef.current(prefix).then(
        (found) => {
          if (!live) return;
          setOptions(found.filter((option) => !values.includes(option.email)));
          setActive(-1);
        },
        () => {},
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [input, values]);
  const listId = `${id}-predlozi`;
  const visible = input.trim().length >= 2 && options.length > 0;
  const invalid = values.filter((value) => !normalizeRecipient(value));

  function commit(raw: string) {
    const parts = splitRecipientInput(raw);
    if (parts.length) actions.addRecipients(field, parts);
    setInput("");
    setOptions([]);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && visible) {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp" && visible) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if ((event.key === "Enter" || event.key === "," || event.key === ";" || (event.key === "Tab" && input.trim())) && (input.trim() || active >= 0)) {
      event.preventDefault();
      commit(visible && active >= 0 ? options[active].email : input);
    } else if (event.key === "Escape" && visible) {
      event.preventDefault();
      setOptions([]);
    } else if (event.key === "Backspace" && !input && values.length > 0) {
      actions.removeRecipient(field, values.length - 1);
    }
  }

  return (
    <div className="relative grid gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[var(--admin-text-muted)]">{label}</label>
      <div className="flex min-h-11 w-full min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--admin-focus,var(--admin-ink))]">
        {values.map((value, index) => {
          const bad = !normalizeRecipient(value);
          return (
            <span
              key={`${value}:${index}`}
              data-invalid={bad ? "true" : undefined}
              title={bad ? fmt(dict.compose.invalidRecipient, { address: value }) : undefined}
              className={cn(
                "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-2.5 text-xs font-medium",
                bad
                  ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]"
                  : "border-[var(--admin-border)] bg-[var(--admin-surface-muted)]",
              )}
            >
              <span className="min-w-0 truncate">{value}</span>
              <button type="button" className={chipButton} aria-label={fmt(dict.compose.removeRecipient, { address: value })} onClick={() => actions.removeRecipient(field, index)}>
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <input
          id={id}
          type="text"
          inputMode="email"
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={invalid.length > 0 || undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={input}
          placeholder={values.length ? undefined : dict.compose.recipientPlaceholder}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,;\n]/.test(value)) commit(value);
            else setInput(value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (input.trim()) commit(input);
          }}
          className="min-h-8 min-w-[10rem] flex-1 bg-transparent px-1 text-sm outline-none"
        />
      </div>
      {invalid.length > 0 ? (
        <p className="text-xs font-medium text-[var(--admin-danger)]">{fmt(dict.compose.invalidRecipient, { address: invalid[0] })}</p>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label={dict.compose.suggestionsLabel}
        hidden={!visible}
        className="absolute top-full right-0 left-0 z-10 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1 shadow-[var(--admin-shadow-md)]"
      >
        {options.map((option, index) => (
          <li
            key={option.email}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => {
              event.preventDefault();
              commit(option.email);
            }}
            className={cn("cursor-pointer rounded-md px-2.5 py-2 text-sm", index === active && "bg-[var(--admin-surface-muted)]")}
          >
            <span className="font-medium">{option.name}</span> <span className="text-[var(--admin-text-muted)]">&lt;{option.email}&gt;</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttachmentZone({ model, actions, idPrefix }: { model: MailComposeModel; actions: MailComposeActions; idPrefix: string }) {
  const [dragging, setDragging] = useState(false);
  const inputId = `${idPrefix}-prilozi`;
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) actions.addFiles(Array.from(event.dataTransfer.files));
  };
  return (
    <section aria-label={dict.compose.attachments} className="grid gap-2">
      <h3 className="text-xs font-semibold text-[var(--admin-text-muted)]">{dict.compose.attachments}</h3>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "grid justify-items-center gap-1 rounded-[var(--admin-radius-control)] border border-dashed px-4 py-5 text-center text-sm",
          dragging ? "border-[var(--admin-ink)] bg-[var(--admin-surface-muted)]" : "border-[var(--admin-border)] bg-[var(--admin-surface)]",
        )}
      >
        <Upload className="size-5 text-[var(--admin-text-muted)]" aria-hidden="true" />
        <p>
          {dict.compose.dropzone}{" "}
          <label htmlFor={inputId} className="cursor-pointer font-semibold underline underline-offset-2">{dict.compose.chooseFiles}</label>
        </p>
        <p className="text-xs text-[var(--admin-text-muted)]">
          {fmt(dict.compose.attachmentLimits, { count: ADMIN_MAIL_SEND_MAX_ATTACHMENTS, size: mailSize(ADMIN_MAIL_SEND_TOTAL_MAX_BYTES) })}
        </p>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) actions.addFiles(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
      </div>
      {model.state.attachments.length > 0 ? (
        <ul className="grid gap-2">
          {model.state.attachments.map((item) => (
            <li
              key={item.localId}
              className={cn(
                "grid min-w-0 gap-1.5 rounded-[var(--admin-radius-control)] border px-3 py-2",
                item.status === "error" ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]" : "border-[var(--admin-border)] bg-[var(--admin-surface)]",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="size-3.5 shrink-0 text-[var(--admin-text-muted)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.fileName}</span>
                <span className="shrink-0 text-xs text-[var(--admin-text-muted)]">{mailSize(item.size)}</span>
                <button type="button" className={chipButton} aria-label={fmt(dict.compose.removeAttachment, { name: item.fileName })} onClick={() => actions.removeAttachment(item.localId)}>
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              {item.status === "uploading" ? (
                <div
                  role="progressbar"
                  aria-label={fmt(dict.compose.uploading, { name: item.fileName, percent: Math.round(item.progress * 100) })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(item.progress * 100)}
                  className="h-1.5 overflow-hidden rounded-full bg-[var(--admin-surface-muted)]"
                >
                  <div className="h-full rounded-full bg-[var(--admin-ink)] transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                </div>
              ) : null}
              {item.status === "error" ? (
                <p className="text-xs font-medium text-[var(--admin-danger)]">
                  {dict.compose.attachmentFailed}: {mailErrorText({ code: item.errorCode ?? "ACTION_FAILED", retryAfterSeconds: null })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ComposeFooter({ model, actions }: { model: MailComposeModel; actions: MailComposeActions }) {
  const state = model.state;
  const alert = state.outcome
    ? state.outcome.kind === "uncertain"
      ? dict.compose.uncertain
      : mailErrorText(state.outcome.failure)
    : state.problem;
  return (
    <div className="grid gap-3 border-t border-[var(--admin-border)] bg-[var(--admin-app)] px-4 py-3 sm:px-6">
      {alert ? (
        <p
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-[var(--admin-radius-control)] border px-3 py-2 text-sm font-medium",
            state.outcome?.kind === "uncertain"
              ? "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]"
              : "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {alert}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={adminSecondaryButtonClass} onClick={actions.discard} disabled={state.sending}>
          <Trash2 className="size-4" aria-hidden="true" />
          {dict.compose.discard}
        </button>
        <button type="button" className={adminPrimaryButtonClass} onClick={actions.send} disabled={state.sending} aria-busy={state.sending || undefined}>
          <Send className="size-4" aria-hidden="true" />
          {state.sending ? dict.compose.sending : state.outcome?.kind === "uncertain" ? dict.compose.sendAgain : dict.compose.send}
        </button>
      </div>
    </div>
  );
}
