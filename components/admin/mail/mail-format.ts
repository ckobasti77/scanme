import { ConvexError } from "convex/values";
import type { AdminMailFolder } from "@/convex/lib/adminMailContract";
import { isAdminMailErrorCode } from "@/convex/lib/adminMailContract";
import { fmt } from "@/lib/i18n/format";
import { postaSr as dict } from "@/lib/i18n/sr/posta";

// Admin UX Z1 — formatting and error text of Pošta (pure; shared by view,
// container and preview).

export type MailFailure = { code: string; retryAfterSeconds: number | null };

/** A backend error as a stable code (ConvexError({ code })), else ACTION_FAILED. */
export function mailFailure(error: unknown): MailFailure {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown; retryAfterSeconds?: unknown } | string;
    if (data && typeof data === "object" && isAdminMailErrorCode(data.code)) {
      return { code: data.code, retryAfterSeconds: typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : null };
    }
  }
  return { code: "ACTION_FAILED", retryAfterSeconds: null };
}

export function mailErrorText(failure: MailFailure) {
  const base = isAdminMailErrorCode(failure.code) ? dict.errors[failure.code] : dict.errors.ACTION_FAILED;
  return failure.retryAfterSeconds ? `${base} ${fmt(dict.retryAfter, { seconds: failure.retryAfterSeconds })}` : base;
}

/** The result of the OAuth callback redirect (`?status=povezano|greska&kod=`). */
export function mailCallbackNotice(
  status: string | undefined,
  code: string | undefined,
): { tone: "success" | "error"; text: string } | null {
  if (status === "povezano") return { tone: "success", text: dict.connectedNotice };
  if (status === "greska") {
    return { tone: "error", text: mailErrorText({ code: isAdminMailErrorCode(code) ? code : "ACTION_FAILED", retryAfterSeconds: null }) };
  }
  return null;
}

export function mailFolderLabel(folder: AdminMailFolder) {
  return (dict.folderNames as Record<string, string>)[folder.type] ?? folder.name;
}

const dayFormatter = new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("sr-Latn-RS", { hour: "2-digit", minute: "2-digit" });
const fullFormatter = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" });

/** Today → "14:05"; otherwise "06.10.2026." */
export function mailListTime(at: number, now: number) {
  if (!at) return "";
  return dayFormatter.format(at) === dayFormatter.format(now) ? timeFormatter.format(at) : dayFormatter.format(at);
}

export function mailFullTime(at: number | null) {
  return at ? fullFormatter.format(at) : "";
}

const sizeFormatter = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 1 });

export function mailSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormatter.format(bytes / 1024)} KB`;
  return `${sizeFormatter.format(bytes / (1024 * 1024))} MB`;
}
