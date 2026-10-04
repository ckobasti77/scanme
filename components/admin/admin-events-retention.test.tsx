import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FAIR_PII_PURGE_AT_MS, FAIR_PURGE_CATEGORIES } from "@/lib/fair-contract";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { fmt } from "@/lib/i18n/format";
import { AdminEventsRetention, type RetentionActions, type RetentionView } from "./admin-events-retention";

// Sajam 2026 B7 — the `Brisanje podataka` section of the admin `Događaji` tab.

const actions: RetentionActions = { startDryRun: async () => ({ ok: true }) };
const NOW = Date.parse("2026-10-08T12:00:00+02:00");

const view: RetentionView = {
  purgeAt: FAIR_PII_PURGE_AT_MS,
  capPerCategory: 200,
  preview: FAIR_PURGE_CATEGORIES.map((category, index) => ({ category, count: index === 0 ? 200 : index, capped: index === 0 })),
  runs: [
    {
      id: "r2", mode: "dry_run", trigger: "admin", status: "running", startedAt: NOW, batches: 1, totalRows: 200,
      categories: FAIR_PURGE_CATEGORIES.map((category, index) => ({ category, rows: index === 0 ? 200 : 0, status: index === 0 ? "running" as const : "pending" as const })),
    },
    {
      id: "r1", mode: "dry_run", trigger: "cli", status: "completed", startedAt: NOW - 60_000, finishedAt: NOW - 59_000, batches: 3, totalRows: 412,
      categories: FAIR_PURGE_CATEGORIES.map((category) => ({ category, rows: 1, status: "done" as const })),
    },
  ],
};

describe("B7 admin Brisanje podataka section", () => {
  test("shows the fixed date, what stays, the preview per category in purge order and the audit, all in Serbian", () => {
    const html = renderToStaticMarkup(<AdminEventsRetention view={view} actions={actions} />);
    for (const text of [
      adminEventsSr.retentionScheduleTitle, adminEventsSr.retentionKeptNote, adminEventsSr.retentionPreviewTitle, adminEventsSr.retentionDryRun,
      adminEventsSr.retentionRunsTitle, adminEventsSr.retentionModes.dry_run, adminEventsSr.retentionTriggers.admin, adminEventsSr.retentionRunStatus.running,
      adminEventsSr.retentionRunStatus.completed, fmt(adminEventsSr.retentionCountCapped, { count: 200 }),
      ...FAIR_PURGE_CATEGORIES.map((category) => adminEventsSr.retentionCategories[category]),
    ]) {
      expect(html).toContain(text.replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
    }
    expect(html).toContain("2026");
    const order = FAIR_PURGE_CATEGORIES.map((category) => html.indexOf(adminEventsSr.retentionCategories[category]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // No raw enum or code reaches the page, and there is no delete action.
    expect(html).not.toMatch(/\b(email_deliveries|dry_run|execute|FAIR_[A-Z_]+)\b/);
    expect(html).not.toMatch(/Obriši|Izbriši/);
  });

  test("an empty audit and a missing overview have understandable states", () => {
    expect(renderToStaticMarkup(<AdminEventsRetention view={{ ...view, runs: [] }} actions={actions} />)).toContain(adminEventsSr.retentionRunsEmpty);
    expect(renderToStaticMarkup(<AdminEventsRetention view={undefined} actions={undefined} />)).toContain(adminEventsSr.retentionUnavailable);
  });
});
