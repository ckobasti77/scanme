// Admin UX A4 — the confirmation flow of the QR detail: „Promeni odredište“
// (reassign), „Dodeli model“ (a free code) and „Ukloni vezu“ (release). Every
// change goes edit → confirm → (the screen runs the mutation) → idle, so a
// printed code never changes destination on one click. Pure reducer, shared by
// the detail view and its tests.

import { FAIR_QR_REASON_MAX_LENGTH, FAIR_QR_REASON_MIN_LENGTH } from "@/lib/fair-contract";

export type QrFlowAction = "reassign" | "assign" | "release";

export type QrFlow =
  | { step: "idle" }
  | { step: "edit" | "confirm"; action: QrFlowAction; targetModelId?: string; reason: string };

/** A started change (edit or confirm step). */
export type QrActiveFlow = Exclude<QrFlow, { step: "idle" }>;

export type QrFlowEvent =
  | { type: "start"; action: QrFlowAction }
  | { type: "target"; modelId: string | undefined }
  | { type: "reason"; text: string }
  /** edit → confirm, only when nothing is missing. */
  | { type: "review"; currentModelId: string | null }
  /** confirm → edit, keeps the draft. */
  | { type: "back" }
  /** Any step → idle (Odustani, or the mutation succeeded). */
  | { type: "reset" };

export const QR_FLOW_IDLE: QrFlow = { step: "idle" };

export type QrFlowProblem = "target_missing" | "target_same" | "reason_short" | "reason_long";

/** What still blocks the confirmation step; null = it can be confirmed. */
export function qrFlowProblem(flow: QrFlow, currentModelId: string | null): QrFlowProblem | null {
  if (flow.step === "idle") return null;
  if (flow.action !== "release") {
    if (!flow.targetModelId) return "target_missing";
    if (flow.targetModelId === currentModelId) return "target_same";
  }
  const reason = flow.reason.trim();
  if (reason.length > FAIR_QR_REASON_MAX_LENGTH) return "reason_long";
  // A free code may be assigned without a reason (assignQr); a change or a removal needs one.
  if (flow.action !== "assign" && reason.length < FAIR_QR_REASON_MIN_LENGTH) return "reason_short";
  if (flow.action === "assign" && reason.length > 0 && reason.length < FAIR_QR_REASON_MIN_LENGTH) return "reason_short";
  return null;
}

export function qrFlowReducer(flow: QrFlow, event: QrFlowEvent): QrFlow {
  switch (event.type) {
    case "start":
      return { step: "edit", action: event.action, reason: "" };
    case "reset":
      return QR_FLOW_IDLE;
    case "target":
      return flow.step === "edit" && flow.action !== "release" ? { ...flow, targetModelId: event.modelId } : flow;
    case "reason":
      return flow.step === "edit" ? { ...flow, reason: event.text } : flow;
    case "review":
      return flow.step === "edit" && !qrFlowProblem(flow, event.currentModelId) ? { ...flow, step: "confirm", reason: flow.reason.trim() } : flow;
    case "back":
      return flow.step === "confirm" ? { ...flow, step: "edit" } : flow;
  }
}
