"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { FairLeadForm, type FairLeadStatus } from "@/components/fair/lead-form";
import type { FairLeadDraft, FairLeadFieldErrors, FairLeadOutcome, FairLeadSheetKind } from "@/components/fair/lead-form-model";
import type { FairOpenLeadForm } from "@/components/fair/model-view";
import type { FairModelDict } from "@/lib/i18n";

// N6 — DEV preview of the lead form states inside the real sheet markup, with
// TEST data and a stand-in sender (no request, nothing stored). Never in
// production (the page calls notFound()).

export type FairLeadPreviewState = {
  kind: FairLeadSheetKind;
  form: FairOpenLeadForm;
  draft: FairLeadDraft;
  status: FairLeadStatus;
  fieldErrors?: FairLeadFieldErrors;
  /** What the stand-in sender answers after a short wait. */
  reply: FairLeadOutcome;
};

export function FairLeadFormPreview({
  preview,
  dict,
  modelName,
  exhibitorName,
  fullHeight,
}: {
  preview: FairLeadPreviewState;
  dict: FairModelDict;
  modelName: string;
  exhibitorName: string;
  /** `?ceo=1`: the whole sheet in the page flow (no 720 px cap), for screenshots of the lower part. */
  fullHeight: boolean;
}) {
  const [draft, setDraft] = useState(preview.draft);
  const [status, setStatus] = useState(preview.status);
  const title = preview.kind === "testDrive" ? dict.testDriveSheetTitle : dict.interestSheetTitle;

  return (
    <div className="fair-sheet-backdrop" style={fullHeight ? { position: "static", minHeight: "100dvh", paddingTop: 16 } : undefined}>
      <div className="fair-sheet" role="dialog" aria-modal="true" aria-labelledby="fair-sheet-title" style={fullHeight ? { maxHeight: "none" } : undefined}>
        <header>
          <h2 id="fair-sheet-title">{title}</h2>
          <button type="button" onClick={() => setStatus({ kind: "idle" })}>
            <X aria-hidden="true" />
            <span className="sr-only">{dict.closeSheet}</span>
          </button>
        </header>
        <FairLeadForm
          kind={preview.kind}
          form={preview.form}
          eventModelId="test-preview-model"
          modelName={modelName}
          exhibitorName={exhibitorName}
          dict={dict}
          draft={draft}
          onDraftChange={setDraft}
          status={status}
          onStatusChange={setStatus}
          onClose={() => setStatus({ kind: "idle" })}
          initialFieldErrors={preview.fieldErrors}
          send={() => new Promise((resolve) => window.setTimeout(() => resolve(preview.reply), 1200))}
        />
      </div>
    </div>
  );
}
