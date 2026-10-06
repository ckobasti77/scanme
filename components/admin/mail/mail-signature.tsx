"use client";

import { useId } from "react";
import { ADMIN_MAIL_SIGNATURE_MAX_LENGTH } from "@/convex/lib/adminMailContract";
import { adminFieldClass, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { renderScanMeEmail } from "@/lib/email-template/scanme-email";
import { fmt } from "@/lib/i18n/format";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import { cn } from "@/lib/utils";
import { MailHtmlFrame } from "./mail-html-frame";
import type { MailSignatureActions, MailSignatureModel } from "./use-mail-compose";

// Admin UX Z2 — signature per mailbox ("podešavanja Pošte"): plain text with
// [links](…), previewed in the same ScanMe template every message uses.

export function MailSignaturePanel({ model, actions }: { model: MailSignatureModel | null; actions: MailSignatureActions }) {
  return (
    <Sheet open={model !== null} onOpenChange={(open) => (open ? undefined : actions.close())}>
      <SheetContent
        side="right"
        data-reveal="off"
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="admin-v1 w-full max-w-none gap-0 overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-app)] p-0 text-[var(--admin-text)] shadow-[var(--admin-shadow-lg)] sm:max-w-none lg:w-[40rem]"
      >
        {model ? (
          <>
            <div className="border-b border-[var(--admin-border)] px-4 pt-4 pb-3 pr-14 sm:px-6">
              <SheetTitle className="text-xl font-semibold tracking-[-0.02em]">{dict.settings.title}</SheetTitle>
              <SheetDescription className="mt-1 text-sm text-[var(--admin-text-muted)]">{dict.settings.description}</SheetDescription>
            </div>
            <MailSignatureView model={model} actions={actions} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function MailSignatureView({ model, actions }: { model: MailSignatureModel; actions: MailSignatureActions }) {
  const id = useId();
  const account = model.accounts.find((option) => option.key === model.accountKey);
  const preview = renderScanMeEmail({ bodyText: "", signatureText: model.text });
  return (
    <div className="grid gap-4 px-4 py-4 sm:px-6">
      {model.accounts.length > 1 ? (
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-text-muted)]">
          {dict.mailboxLabel}
          <select className={adminFieldClass} value={model.accountKey} onChange={(event) => actions.selectAccount(event.target.value)}>
            {model.accounts.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-potpis`} className="text-xs font-semibold text-[var(--admin-text-muted)]">
          {fmt(dict.settings.signatureLabel, { email: account?.emailAddress ?? "" })}
        </label>
        <textarea
          id={`${id}-potpis`}
          autoFocus
          rows={6}
          maxLength={ADMIN_MAIL_SIGNATURE_MAX_LENGTH}
          value={model.text}
          placeholder={dict.settings.signaturePlaceholder}
          onChange={(event) => actions.setText(event.target.value)}
          className={cn(adminFieldClass, "min-h-36 resize-y py-2.5 leading-6")}
        />
        <p className="text-xs text-[var(--admin-text-muted)]">{dict.compose.formattingHint}</p>
      </div>
      <section aria-label={dict.settings.preview} className="grid gap-2">
        <h3 className="text-xs font-semibold text-[var(--admin-text-muted)]">{dict.settings.preview}</h3>
        <MailHtmlFrame html={preview.html} allowRemoteImages={false} title={dict.settings.preview} className="h-72 min-h-0" />
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={adminSecondaryButtonClass} onClick={actions.close} disabled={model.saving}>{dict.compose.close}</button>
        <button type="button" className={adminPrimaryButtonClass} onClick={actions.save} disabled={model.saving}>
          {model.saving ? dict.settings.saving : dict.settings.save}
        </button>
      </div>
    </div>
  );
}
