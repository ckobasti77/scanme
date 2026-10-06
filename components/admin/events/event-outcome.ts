import { ConvexError } from "convex/values";
import type { IssueView, Outcome, Result } from "@/components/admin/admin-events";
import type { InteractionOutcome } from "@/components/admin/admin-events-interactions";
import type { LeadsOutcome } from "@/components/admin/admin-events-leads";

// Sajam 2026 B1A — backend errors arrive as ConvexError({ code, issues? })
// and are shown through the admin-events dictionary. Shared by the section
// containers (moved from admin-events-workspace.tsx in A2).

type FailureData = { code?: unknown; issues?: unknown };

function failure(error: unknown): { ok: false; code: string; issues?: IssueView[] } {
  if (error instanceof ConvexError) {
    const data = error.data as FailureData | string;
    if (typeof data === "object" && data !== null && typeof data.code === "string") {
      return { ok: false, code: data.code, issues: Array.isArray(data.issues) ? (data.issues as IssueView[]) : undefined };
    }
  }
  return { ok: false, code: "ACTION_FAILED" };
}

export async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return failure(error);
  }
}

export async function outcome(run: () => Promise<{ warnings?: IssueView[] } | unknown>): Promise<Outcome> {
  const result = await attempt(run);
  if (!result.ok) return result;
  const value = result.value as { warnings?: IssueView[] } | null;
  return { ok: true, warnings: value && Array.isArray(value.warnings) ? value.warnings : undefined };
}

export async function interactionOutcome(run: () => Promise<unknown>): Promise<InteractionOutcome> {
  const result = await attempt(run);
  if (!result.ok) return { ok: false, code: result.code };
  const value = result.value as { problem?: unknown; questionId?: unknown; surveyId?: unknown; version?: unknown } | null;
  // A6 — the saved question/survey id lets "Sačuvaj i objavi" publish it right away.
  const id = value && typeof value.questionId === "string" ? value.questionId : value && typeof value.surveyId === "string" ? value.surveyId : undefined;
  return {
    ok: true,
    problem: value && typeof value.problem === "string" ? value.problem : null,
    ...(id ? { id } : {}),
    ...(value && typeof value.version === "number" ? { version: value.version } : {}),
  };
}

export async function leadsOutcome(run: () => Promise<unknown>): Promise<LeadsOutcome> {
  const result = await attempt(run);
  return result.ok ? { ok: true } : { ok: false, code: result.code };
}
