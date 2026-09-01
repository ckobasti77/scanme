"use client";

// TASK-40 (RFC-002 §2.6, §4 task 12) — the operational customers table. NOT a
// directory of who exists: a work list of WHO TO CALL TODAY. Default sort is by
// next renewal, and the churn predictor ("plaćeno ali nikad podešeno") sorts to
// the very top. The four statuses are DERIVED by the TASK-32 billing module
// (billing.billingOverview → deriveBillingStatus); this screen only displays and
// labels them, never recomputes them. Enterprise is ONE expandable row over its
// locations; a solo customer is a full-width row. Every activation/deactivation
// and every recorded payment writes exactly one adminAuditLog row on the server.
//
// Visual language is the shared glass of app/offer-surface.css (TASK-44) —
// .offer-frame / .offer-glass--panel / .offer-dock — never a new glass layer.
// Only the four status pills (customers-admin.module.css) are this screen's own.

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Phone,
  Plus,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { adminCustomersSr as dict } from "@/lib/i18n/sr/admin-customers";
import { formatRsd } from "@/lib/scanme-pricing";
import { cn } from "@/lib/utils";
import { AdminGuard } from "./admin-guard";
import { AdminShell } from "./admin-shell";
import styles from "./customers-admin.module.css";

export type CustomerRow = FunctionReturnType<typeof api.admin.customers>[number];
type CustomerLocation = Extract<CustomerRow, { kind: "solo" }>["location"];
type ServiceType = CustomerLocation["services"][number]["type"];
export type BillingRow = FunctionReturnType<typeof api.billing.billingOverview>[number];
type BillingStatus = BillingRow["status"];

const SERVICE_LABEL: Record<ServiceType, string> = {
  scanme_links: dict.serviceScanmeLinks,
  google_review: dict.serviceGoogleReview,
  scanme_venue: dict.serviceVenue,
  scanme_memories: dict.serviceMemories,
};

const PLAN_LABEL: Record<"basic" | "premium" | "enterprise", string> = {
  basic: dict.planBasic,
  premium: dict.planPremium,
  enterprise: dict.planEnterprise,
};

const dateFmt = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("sr-Latn-RS", {
  dateStyle: "medium",
  timeStyle: "short",
});
const timeFmt = new Intl.DateTimeFormat("sr-Latn-RS", { timeStyle: "short" });

function money(amount: number) {
  return `${formatRsd(amount)} RSD`;
}

function reasonMessage(reason: unknown, fallback: string) {
  return reason instanceof ConvexError && typeof reason.data === "string"
    ? reason.data
    : reason instanceof Error
      ? reason.message
      : fallback;
}

function activeServiceTypes(location: CustomerLocation): ServiceType[] {
  return location.services
    .filter((service) => service.status === "active")
    .map((service) => service.type);
}

// --- Row model: merge the grouping row with its billing facts -----------------

export type MergedRow = {
  key: string;
  customer: CustomerRow;
  billing: BillingRow | null;
  accountId: Id<"accounts"> | null;
  name: string;
  locations: CustomerLocation[];
  isEnterprise: boolean;
};

export function mergeRows(
  customers: CustomerRow[],
  billingByAccount: Map<string, BillingRow>,
): MergedRow[] {
  const merged = customers.map<MergedRow>((customer) => {
    if (customer.kind === "enterprise") {
      return {
        key: customer.account.id,
        customer,
        billing: billingByAccount.get(customer.account.id) ?? null,
        accountId: customer.account.id,
        name: customer.account.name,
        locations: customer.locations,
        isEnterprise: true,
      };
    }
    const accountId = customer.account?.id ?? null;
    return {
      key: accountId ?? customer.location.id,
      customer,
      billing: accountId ? (billingByAccount.get(accountId) ?? null) : null,
      accountId,
      name: customer.account?.name ?? customer.location.name,
      locations: [customer.location],
      isEnterprise: false,
    };
  });

  // The work queue: churn predictor first, then by next renewal ascending
  // (dateless last), then account-less legacy locations at the very bottom.
  const group = (row: MergedRow) => {
    if (!row.billing) return 3;
    if (row.billing.status === "paid_never_configured") return 0;
    return 1;
  };
  return merged.sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;
    const da = a.billing?.nextBillingAt ?? Number.POSITIVE_INFINITY;
    const db = b.billing?.nextBillingAt ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, "sr-Latn", { sensitivity: "base" });
  });
}

// --- Presentational atoms -----------------------------------------------------

function StatusPill({ billing }: { billing: BillingRow | null }) {
  if (!billing) {
    return (
      <span className={cn(styles.pill, styles.pillNoAccount)}>
        {dict.statusNoAccount}
      </span>
    );
  }
  // A suspended account reads as "expired" from deriveBillingStatus (capability
  // is cut), but the raw state distinguishes an admin decision from a lapse.
  if (billing.status === "expired" && billing.accountStatus === "suspended") {
    return (
      <span className={cn(styles.pill, styles.pillSuspended)}>
        {dict.statusSuspended}
      </span>
    );
  }
  const map: Record<BillingStatus, { cls: string; label: string; icon?: boolean }> = {
    active: { cls: styles.pillActive, label: dict.statusActive },
    expiring_soon: { cls: styles.pillExpiring, label: dict.statusExpiringSoon },
    expired: { cls: styles.pillExpired, label: dict.statusExpired },
    paid_never_configured: {
      cls: styles.pillChurn,
      label: dict.statusPaidNeverConfigured,
      icon: true,
    },
  };
  const entry = map[billing.status];
  return (
    <span className={cn(styles.pill, entry.cls)}>
      {entry.icon ? <AlertTriangle className="size-3.5" aria-hidden="true" /> : null}
      {entry.label}
    </span>
  );
}

function NextBillingCell({ billing }: { billing: BillingRow | null }) {
  if (!billing || billing.nextBillingAt === null) {
    return <span className="text-muted-foreground">{dict.billingNone}</span>;
  }
  const days = billing.daysLeft ?? 0;
  let relative: string;
  if (days === 0) relative = dict.billingDueToday;
  else if (days < 0) relative = fmt(dict.billingOverdueDays, { count: -days });
  else relative = fmt(dict.billingDueInDays, { count: days });
  return (
    <div className="flex flex-col">
      <span className={cn(styles.money, "text-sm")}>
        {dateFmt.format(new Date(billing.nextBillingAt))}
      </span>
      <span
        className={cn(
          "text-xs",
          days < 0 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {relative}
      </span>
    </div>
  );
}

function ServicesCell({ locations }: { locations: CustomerLocation[] }) {
  const active = new Set<ServiceType>();
  for (const location of locations) {
    for (const type of activeServiceTypes(location)) active.add(type);
  }
  if (active.size === 0) {
    return <span className="text-xs text-muted-foreground">{dict.servicesNoneActive}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {[...active].map((type) => (
        <span
          key={type}
          className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium"
        >
          {SERVICE_LABEL[type]}
        </span>
      ))}
    </div>
  );
}

// --- The table ----------------------------------------------------------------

export function CustomersAdmin() {
  return (
    <AdminGuard>
      <AdminShell>
        <CustomersWorkspace />
      </AdminShell>
    </AdminGuard>
  );
}

function CustomersWorkspace() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const customers = useQuery(api.admin.customers);
  const billing = useQuery(api.billing.billingOverview, { now });
  const [detail, setDetail] = useState<MergedRow | null>(null);

  const billingByAccount = useMemo(() => {
    const map = new Map<string, BillingRow>();
    for (const row of billing ?? []) map.set(row.accountId, row);
    return map;
  }, [billing]);

  const rows = useMemo(
    () => (customers ? mergeRows(customers, billingByAccount) : null),
    [customers, billingByAccount],
  );

  // Keep the open detail drawer in sync with fresh query data.
  const liveDetail = useMemo(() => {
    if (!detail || !rows) return detail;
    return rows.find((row) => row.key === detail.key) ?? null;
  }, [detail, rows]);

  return (
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
        {rows ? (
          <p className="text-xs text-muted-foreground">
            {fmt(dict.count, { count: rows.length })} ·{" "}
            {fmt(dict.refreshedAt, { time: timeFmt.format(new Date(now)) })}
          </p>
        ) : null}
      </div>

      {customers === undefined ? (
        <div className="mt-6 h-64 animate-pulse rounded-[var(--os-radius)] bg-secondary" />
      ) : rows && rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">{dict.empty}</p>
      ) : rows ? (
        <CustomersTable rows={rows} onOpenDetail={setDetail} />
      ) : null}

      <CustomerDetailDialog
        row={liveDetail}
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        now={now}
      />
    </div>
  );
}

// The table itself — presentational, data-in-props, so both the live admin
// workspace and the /dev fixture preview render the exact same markup.
export function CustomersTable({
  rows,
  onOpenDetail,
}: {
  rows: MergedRow[];
  onOpenDetail: (row: MergedRow) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpand(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return (
    <div className="offer-frame mt-6 overflow-hidden">
      <div className="offer-glass offer-glass--panel overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border/70 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <th className="px-4 py-3 font-semibold">{dict.colName}</th>
              <th className="px-4 py-3 font-semibold">{dict.colPhone}</th>
              <th className="px-4 py-3 font-semibold">{dict.colServices}</th>
              <th className="px-4 py-3 font-semibold">{dict.colPlan}</th>
              <th className="px-4 py-3 font-semibold">{dict.colPeriod}</th>
              <th className="px-4 py-3 font-semibold">{dict.colStatus}</th>
              <th className="px-4 py-3 font-semibold">{dict.colNextBilling}</th>
              <th className="px-4 py-3 text-right font-semibold">{dict.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <CustomerRows
                key={row.key}
                row={row}
                expanded={expanded.has(row.key)}
                onToggle={() => toggleExpand(row.key)}
                onOpenDetail={() => onOpenDetail(row)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function planLabel(plan: "basic" | "premium" | "enterprise") {
  return PLAN_LABEL[plan];
}

function periodLabel(period: "monthly" | "annual" | null | undefined) {
  if (period === "monthly") return dict.periodMonthly;
  if (period === "annual") return dict.periodAnnual;
  return dict.periodNone;
}

function CustomerRows({
  row,
  expanded,
  onToggle,
  onOpenDetail,
}: {
  row: MergedRow;
  expanded: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
}) {
  const account = row.customer.account;
  const isChurn = row.billing?.status === "paid_never_configured";
  const soloLocation = row.isEnterprise ? null : row.locations[0];

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/60 align-top",
          isChurn && styles.churnRow,
        )}
      >
        <td className="px-4 py-4">
          <div className="flex items-start gap-2">
            {row.isEnterprise ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-label={fmt(expanded ? dict.collapseAria : dict.expandAria, {
                  name: row.name,
                })}
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {expanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
            ) : (
              <span className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <span className="flex items-center gap-2 font-semibold">
                {row.isEnterprise ? (
                  <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
                {soloLocation ? (
                  // Drill into the per-location admin (subpages + sidebar, TASK-41).
                  <Link
                    href={`/admin/customers/${soloLocation.id}`}
                    className="truncate underline-offset-2 hover:text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                ) : (
                  <span className="truncate">{row.name}</span>
                )}
              </span>
              {row.isEnterprise ? (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {dict.enterpriseBadge} ·{" "}
                  {fmt(dict.enterpriseLocations, { count: row.locations.length })}
                </span>
              ) : soloLocation?.contactName ? (
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {soloLocation.contactName}
                </span>
              ) : null}
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          {soloLocation?.phone ? (
            <a
              href={`tel:${soloLocation.phone}`}
              className="inline-flex items-center gap-1.5 text-sm hover:text-primary"
            >
              <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {soloLocation.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">{dict.phoneNone}</span>
          )}
        </td>
        <td className="px-4 py-4">
          <ServicesCell locations={row.locations} />
        </td>
        <td className="px-4 py-4">
          {account ? (
            <span className="font-medium">{planLabel(account.plan)}</span>
          ) : (
            <span className="text-muted-foreground">{dict.billingNone}</span>
          )}
        </td>
        <td className="px-4 py-4 text-muted-foreground">
          {account ? periodLabel(account.planPeriod) : dict.periodNone}
        </td>
        <td className="px-4 py-4">
          <StatusPill billing={row.billing} />
          {isChurn && row.billing?.unconfiguredServices.length ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              {fmt(dict.unconfiguredNote, {
                services: row.billing.unconfiguredServices
                  .map((type) => SERVICE_LABEL[type as ServiceType] ?? type)
                  .join(", "),
              })}
            </span>
          ) : null}
        </td>
        <td className="px-4 py-4">
          <NextBillingCell billing={row.billing} />
        </td>
        <td className="px-4 py-4">
          <div className="flex justify-end gap-2">
            {soloLocation ? (
              <Button size="sm" variant="outline" className="min-h-9" asChild>
                <Link
                  href={`/${soloLocation.slug}/client-panel`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={fmt(dict.openLocationAria, { name: soloLocation.name })}
                >
                  <ExternalLink className="size-3.5" />
                  {dict.openLocation}
                </Link>
              </Button>
            ) : null}
            <Button size="sm" className="min-h-9" onClick={onOpenDetail}>
              <Wallet className="size-3.5" />
              {dict.detailsAction}
            </Button>
          </div>
        </td>
      </tr>

      {row.isEnterprise && expanded
        ? row.locations.map((location) => (
            <tr key={location.id} className="border-b border-border/40 bg-secondary/30">
              <td className="px-4 py-3 pl-12" colSpan={3}>
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/admin/customers/${location.id}`}
                    className="w-fit font-medium underline-offset-2 hover:text-primary hover:underline"
                  >
                    {location.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {location.phone ? (
                      <a
                        href={`tel:${location.phone}`}
                        className="inline-flex items-center gap-1 hover:text-primary"
                      >
                        <Phone className="size-3" aria-hidden="true" />
                        {location.phone}
                      </a>
                    ) : null}
                    <ServicesCell locations={[location]} />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground" colSpan={4}>
                {location.contactName ?? dict.contactNone}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="min-h-9" asChild>
                    <Link
                      href={`/${location.slug}/client-panel`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={fmt(dict.openLocationAria, { name: location.name })}
                    >
                      <ExternalLink className="size-3.5" />
                      {dict.openLocation}
                    </Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))
        : null}
    </>
  );
}

// --- Detail drawer: services toggles + payment history + manual entry ---------

function CustomerDetailDialog({
  row,
  open,
  onOpenChange,
  now,
}: {
  row: MergedRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="offer-surface max-h-[88dvh] max-w-3xl overflow-y-auto border-border bg-card"
      >
        {row ? <CustomerDetail row={row} now={now} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetail({ row, now }: { row: MergedRow; now: number }) {
  const account = row.customer.account;
  const payments = useQuery(
    api.billing.listPayments,
    row.accountId ? { accountId: row.accountId } : "skip",
  );
  const audit = useQuery(
    api.billing.listAuditLog,
    row.accountId ? { accountId: row.accountId } : "skip",
  );
  const setServiceActive = useMutation(api.admin.setServiceProfileActive);
  const recordPayment = useMutation(api.billing.recordManualPayment);
  const voidPayment = useMutation(api.billing.voidPayment);
  const [pending, setPending] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const needsCoversUntil = account?.planPeriod == null; // no tracked period on file

  async function toggleService(
    location: CustomerLocation,
    service: CustomerLocation["services"][number],
  ) {
    const active = service.status !== "active";
    if (!active) {
      const ok = window.confirm(
        `${fmt(dict.deactivateDialogTitle, { service: SERVICE_LABEL[service.type] })}\n\n${dict.deactivateDialogBody}`,
      );
      if (!ok) return;
    }
    setPending(service.id);
    try {
      const result = await setServiceActive({
        serviceProfileId: service.id,
        active,
      });
      if (result.changed) {
        toast.success(
          fmt(active ? dict.activateSuccess : dict.deactivateSuccess, {
            service: SERVICE_LABEL[service.type],
            location: location.name,
          }),
        );
      }
    } catch (reason) {
      toast.error(reasonMessage(reason, dict.serviceToggleError));
    } finally {
      setPending(null);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row.accountId) return;
    const data = new FormData(event.currentTarget);
    const amountRsd = Number(data.get("amount"));
    const paidAtRaw = String(data.get("paidAt") ?? "");
    const reference = String(data.get("reference") ?? "").trim();
    const coversRaw = String(data.get("coversUntil") ?? "");
    const paidAt = paidAtRaw ? new Date(paidAtRaw).getTime() : now;
    setPending("payment");
    try {
      const result = await recordPayment({
        accountId: row.accountId,
        amountRsd,
        paidAt,
        ...(reference ? { reference } : {}),
        ...(coversRaw ? { coversUntil: new Date(coversRaw).getTime() } : {}),
      });
      setShowPaymentForm(false);
      toast.success(
        result.coversUntil
          ? fmt(dict.paymentSuccess, {
              date: dateFmt.format(new Date(result.coversUntil)),
            })
          : dict.paymentSuccessNoCycle,
      );
    } catch (reason) {
      toast.error(reasonMessage(reason, dict.paymentError));
    } finally {
      setPending(null);
    }
  }

  async function doVoid(paymentId: Id<"payments">) {
    const ok = window.confirm(`${dict.voidDialogTitle}\n\n${dict.voidDialogBody}`);
    if (!ok) return;
    setPending(`void:${paymentId}`);
    try {
      await voidPayment({ paymentId });
      toast.success(dict.voidSuccess);
    } catch (reason) {
      toast.error(reasonMessage(reason, dict.voidError));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-2xl tracking-[-0.03em]">
          {row.isEnterprise ? (
            <Building2 className="size-5 text-primary" aria-hidden="true" />
          ) : null}
          {fmt(dict.detailHeading, { name: row.name })}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">
          {account ? (
            <>
              <span>{planLabel(account.plan)}</span>
              <span aria-hidden="true">·</span>
              <span>{periodLabel(account.planPeriod)}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <StatusPill billing={row.billing} />
        </DialogDescription>
      </DialogHeader>

      {/* Services per location — activate / deactivate (each writes one audit row). */}
      <section className="mt-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {dict.detailServicesHeading}
        </h3>
        <div className="mt-3 grid gap-3">
          {row.locations.map((location) => (
            <div key={location.id} className="border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{location.name}</span>
                <Link
                  href={`/${location.slug}/client-panel`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  aria-label={fmt(dict.openLocationAria, { name: location.name })}
                >
                  <ExternalLink className="size-3.5" />
                  {dict.openLocation}
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {location.services.map((service) => {
                  const active = service.status === "active";
                  return (
                    <Button
                      key={service.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="min-h-9"
                      disabled={pending === service.id}
                      aria-label={fmt(
                        active ? dict.deactivateAria : dict.activateAria,
                        { service: SERVICE_LABEL[service.type], location: location.name },
                      )}
                      onClick={() => void toggleService(location, service)}
                    >
                      {pending === service.id ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : null}
                      {SERVICE_LABEL[service.type]}
                      <span className="text-xs opacity-70">
                        · {active ? dict.deactivateService : dict.activateService}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Billing — the manual payment entry is the MAIN flow, plus the history. */}
      {row.accountId ? (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {dict.paymentsHeading}
            </h3>
            <Button
              type="button"
              size="sm"
              className="min-h-9"
              onClick={() => setShowPaymentForm((current) => !current)}
            >
              <Plus className="size-3.5" />
              {dict.recordPaymentAction}
            </Button>
          </div>

          {showPaymentForm ? (
            <form
              onSubmit={submitPayment}
              className="offer-dock mt-3 grid gap-3 rounded-[var(--os-radius)] p-4 sm:grid-cols-2"
            >
              <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                {dict.paymentDialogBody}
              </p>
              <div className="form-field">
                <Label htmlFor="payment-amount">{dict.paymentAmountLabel}</Label>
                <Input
                  id="payment-amount"
                  name="amount"
                  type="number"
                  min={1}
                  step={1}
                  required
                  className="form-control h-11"
                />
              </div>
              <div className="form-field">
                <Label htmlFor="payment-date">{dict.paymentDateLabel}</Label>
                <Input
                  id="payment-date"
                  name="paidAt"
                  type="date"
                  defaultValue={new Date(now).toISOString().slice(0, 10)}
                  required
                  className="form-control h-11"
                />
              </div>
              <div className="form-field sm:col-span-2">
                <Label htmlFor="payment-reference">{dict.paymentReferenceLabel}</Label>
                <Input
                  id="payment-reference"
                  name="reference"
                  maxLength={120}
                  className="form-control h-11"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {dict.paymentReferenceHint}
                </p>
              </div>
              {needsCoversUntil ? (
                <div className="form-field sm:col-span-2">
                  <Label htmlFor="payment-covers">{dict.paymentCoversLabel}</Label>
                  <Input
                    id="payment-covers"
                    name="coversUntil"
                    type="date"
                    required
                    className="form-control h-11"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    {dict.paymentCoversHint}
                  </p>
                </div>
              ) : null}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" size="sm" disabled={pending === "payment"}>
                  {pending === "payment" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {dict.paymentSubmit}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPaymentForm(false)}
                >
                  {dict.paymentCancel}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="mt-3">
            {payments === undefined ? (
              <div className="h-16 animate-pulse bg-secondary" />
            ) : payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{dict.paymentsEmpty}</p>
            ) : (
              <div className="overflow-x-auto border border-border">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">{dict.paymentColDate}</th>
                      <th className="px-3 py-2 font-semibold">{dict.paymentColAmount}</th>
                      <th className="px-3 py-2 font-semibold">{dict.paymentColMethod}</th>
                      <th className="px-3 py-2 font-semibold">{dict.paymentColCovers}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const voided = payment.voidedAt !== undefined;
                      return (
                        <tr
                          key={payment._id}
                          className={cn(
                            "border-b border-border/60",
                            voided && "text-muted-foreground line-through",
                          )}
                        >
                          <td className="px-3 py-2">
                            {dateFmt.format(new Date(payment.paidAt))}
                          </td>
                          <td className={cn("px-3 py-2", styles.money)}>
                            {money(payment.amountRsd)}
                          </td>
                          <td className="px-3 py-2">
                            {payment.method === "manual"
                              ? dict.paymentMethodManual
                              : dict.paymentMethodProvider}
                            {payment.reference ? (
                              <span className="block text-xs text-muted-foreground no-underline">
                                {payment.reference}
                              </span>
                            ) : null}
                          </td>
                          <td className={cn("px-3 py-2 text-xs", styles.money)}>
                            {payment.coversUntil
                              ? dateFmt.format(new Date(payment.coversUntil))
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {voided ? (
                              <span className="text-xs no-underline">
                                {dict.paymentVoidedTag}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void doVoid(payment._id)}
                                disabled={pending === `void:${payment._id}`}
                                className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                              >
                                {dict.voidAction}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* The who/what/when trail — every manual change lands here. */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {dict.auditHeading}
            </h3>
            {audit === undefined ? (
              <div className="mt-3 h-12 animate-pulse bg-secondary" />
            ) : audit.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{dict.auditEmpty}</p>
            ) : (
              <ol className="mt-3 grid gap-1.5">
                {audit.slice(0, 12).map((entry) => (
                  <li
                    key={entry._id}
                    className="flex items-center justify-between gap-3 border border-border/70 px-3 py-1.5 text-xs"
                  >
                    <span>{auditLabel(entry.action)}</span>
                    <time className="text-muted-foreground">
                      {dateTimeFmt.format(new Date(entry.createdAt))}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      ) : (
        <p className="mt-6 border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          {dict.detailNoAccountNote}
        </p>
      )}
    </>
  );
}

function auditLabel(action: string): string {
  switch (action) {
    case "record_payment":
      return dict.auditRecordPayment;
    case "void_payment":
      return dict.auditVoidPayment;
    case "set_next_billing":
      return dict.auditSetNextBilling;
    case "activate_service":
      return dict.auditActivateService;
    case "deactivate_service":
      return dict.auditDeactivateService;
    case "create_order":
      return dict.auditCreateOrder;
    case "set_plan":
      return dict.auditSetPlan;
    default:
      return fmt(dict.auditGeneric, { action });
  }
}
