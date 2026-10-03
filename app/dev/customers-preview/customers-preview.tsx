"use client";

// Dev-only preview of the TASK-40 customers table: renders the REAL
// CustomersTable (components/admin/customers-admin.tsx) with fixture data so the
// four statuses, the enterprise-expandable row, the solo/legacy rows and the
// work-queue sort can be exercised in a browser without Convex or admin auth
// (the live /admin/customers sits behind the convex-auth middleware, which
// crashes on Node v24.8.0 — see docs/tasks/BLOCKED.md). Not shipped in prod
// (the page gate mirrors app/dev/venue-preview).

import { useMemo, useState } from "react";
import {
  CustomersTable,
  mergeRows,
  type BillingRow,
  type CustomerRow,
  type MergedRow,
} from "@/components/admin/customers-admin";
import { AdminShell } from "@/components/admin/admin-shell";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { adminCustomersSr as dict } from "@/lib/i18n/sr/admin-customers";

const DAY = 24 * 60 * 60 * 1000;
const timeFmt = new Intl.DateTimeFormat("sr-Latn-RS", { timeStyle: "short" });

const bid = (v: string) => v as Id<"businesses">;
const aid = (v: string) => v as Id<"accounts">;
const sid = (v: string) => v as Id<"serviceProfiles">;

type SvcType = "scanme_links" | "google_review" | "scanme_venue" | "scanme_memories";

function svc(id: string, type: SvcType, active: boolean) {
  return { id: sid(id), type, status: active ? ("active" as const) : ("inactive" as const) };
}

function buildFixtures(now: number): { customers: CustomerRow[]; billing: BillingRow[] } {
  const customers: CustomerRow[] = [
    // Enterprise — one row over three locations, active.
    {
      kind: "enterprise",
      account: {
        id: aid("acc_ent"),
        name: "Kafanski lanac d.o.o.",
        plan: "premium",
        planPeriod: "annual",
        status: "active",
        planValidUntil: now + 40 * DAY,
      },
      locations: [
        {
          id: bid("b_ent_1"),
          name: "Lanac — Centar",
          slug: "lanac-centar",
          status: "active",
          archivedAt: null,
          contactName: "Petar Petrović",
          phone: "0641112233",
          services: [svc("s_e1_l", "scanme_links", true), svc("s_e1_v", "scanme_venue", true)],
        },
        {
          id: bid("b_ent_2"),
          name: "Lanac — Dorćol",
          slug: "lanac-dorcol",
          status: "active",
          archivedAt: null,
          contactName: "Petar Petrović",
          phone: "0641112244",
          services: [svc("s_e2_l", "scanme_links", true), svc("s_e2_m", "scanme_memories", true)],
        },
        {
          id: bid("b_ent_3"),
          name: "Lanac — Zemun",
          slug: "lanac-zemun",
          status: "active",
          archivedAt: null,
          contactName: "Milica Jović",
          phone: "0641112255",
          services: [svc("s_e3_r", "google_review", true), svc("s_e3_v", "scanme_venue", false)],
        },
      ],
    },
    // Solo — expiring in 9 days.
    {
      kind: "solo",
      account: {
        id: aid("acc_baja"),
        name: "Bistro Kod Baje",
        plan: "premium",
        planPeriod: "monthly",
        status: "active",
        planValidUntil: now + 9 * DAY,
      },
      location: {
        id: bid("b_baja"),
        name: "Bistro Kod Baje",
        slug: "bistro-kod-baje",
        status: "active",
        archivedAt: null,
        contactName: "Bajo Bajić",
        phone: "0655551020",
        services: [svc("s_baja_l", "scanme_links", true), svc("s_baja_r", "google_review", true)],
      },
    },
    // Solo — PAID BUT NEVER CONFIGURED (the churn predictor). Sorts to the top.
    {
      kind: "solo",
      account: {
        id: aid("acc_zito"),
        name: "Pekara Žito",
        plan: "basic",
        planPeriod: null,
        status: "active",
        planValidUntil: null,
      },
      location: {
        id: bid("b_zito"),
        name: "Pekara Žito",
        slug: "pekara-zito",
        status: "active",
        archivedAt: null,
        contactName: "Žika Žikić",
        phone: "0603334455",
        services: [svc("s_zito_l", "scanme_links", true)],
      },
    },
    // Solo — expired (past the grace window).
    {
      kind: "solo",
      account: {
        id: aid("acc_mrak"),
        name: "Klub Mrak",
        plan: "premium",
        planPeriod: "annual",
        status: "active",
        planValidUntil: now - 20 * DAY,
      },
      location: {
        id: bid("b_mrak"),
        name: "Klub Mrak",
        slug: "klub-mrak",
        status: "active",
        archivedAt: null,
        contactName: "Mara Marić",
        phone: "0649998877",
        services: [svc("s_mrak_m", "scanme_memories", true)],
      },
    },
    // Solo — suspended (an admin decision, distinct from a lapse).
    {
      kind: "solo",
      account: {
        id: aid("acc_lux"),
        name: "Salon Lux",
        plan: "premium",
        planPeriod: "annual",
        status: "suspended",
        planValidUntil: now + 100 * DAY,
      },
      location: {
        id: bid("b_lux"),
        name: "Salon Lux",
        slug: "salon-lux",
        status: "active",
        archivedAt: null,
        contactName: "Lena Lukić",
        phone: "0627776655",
        services: [svc("s_lux_r", "google_review", true)],
      },
    },
    // Legacy — an account-less location (pre-backfill). No billing row.
    {
      kind: "solo",
      account: null,
      location: {
        id: bid("b_legacy"),
        name: "Stari Kafe",
        slug: "stari-kafe",
        status: "active",
        archivedAt: null,
        contactName: null,
        phone: null,
        services: [svc("s_leg_l", "scanme_links", true)],
      },
    },
  ];

  const billing: BillingRow[] = [
    {
      accountId: aid("acc_ent"),
      name: "Kafanski lanac d.o.o.",
      plan: "premium",
      planPeriod: "annual",
      accountStatus: "active",
      status: "active",
      nextBillingAt: now + 40 * DAY,
      daysLeft: 40,
      lastPaymentAt: now - 325 * DAY,
      lastPaymentAmountRsd: 23900,
      unconfiguredServices: [],
    },
    {
      accountId: aid("acc_baja"),
      name: "Bistro Kod Baje",
      plan: "premium",
      planPeriod: "monthly",
      accountStatus: "active",
      status: "expiring_soon",
      nextBillingAt: now + 9 * DAY,
      daysLeft: 9,
      lastPaymentAt: now - 21 * DAY,
      lastPaymentAmountRsd: 4990,
      unconfiguredServices: [],
    },
    {
      accountId: aid("acc_zito"),
      name: "Pekara Žito",
      plan: "basic",
      planPeriod: null,
      accountStatus: "active",
      status: "paid_never_configured",
      nextBillingAt: null,
      daysLeft: null,
      lastPaymentAt: null,
      lastPaymentAmountRsd: null,
      unconfiguredServices: ["scanme_links"],
    },
    {
      accountId: aid("acc_mrak"),
      name: "Klub Mrak",
      plan: "premium",
      planPeriod: "annual",
      accountStatus: "active",
      status: "expired",
      nextBillingAt: now - 20 * DAY,
      daysLeft: -20,
      lastPaymentAt: now - 385 * DAY,
      lastPaymentAmountRsd: 9990,
      unconfiguredServices: [],
    },
    {
      accountId: aid("acc_lux"),
      name: "Salon Lux",
      plan: "premium",
      planPeriod: "annual",
      accountStatus: "suspended",
      status: "expired",
      nextBillingAt: now + 100 * DAY,
      daysLeft: 100,
      lastPaymentAt: now - 30 * DAY,
      lastPaymentAmountRsd: 9990,
      unconfiguredServices: [],
    },
  ];

  return { customers, billing };
}

export function CustomersPreview() {
  const [now] = useState(() => Date.now());
  const rows: MergedRow[] = useMemo(() => {
    const { customers, billing } = buildFixtures(now);
    const map = new Map<string, BillingRow>();
    for (const row of billing) map.set(row.accountId, row);
    return mergeRows(customers, map);
  }, [now]);

  return (
    <AdminShell>
      <div className="offer-surface">
        <div className="flex flex-col gap-3 border-b border-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {dict.eyebrow}
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {dict.title}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {dict.subtitle}
          </p>
          <p className="text-xs text-muted-foreground">
            {fmt(dict.count, { count: rows.length })} ·{" "}
            {fmt(dict.refreshedAt, { time: timeFmt.format(new Date(now)) })}
          </p>
        </div>
        <CustomersTable rows={rows} onOpenDetail={() => {}} />
      </div>
    </AdminShell>
  );
}
