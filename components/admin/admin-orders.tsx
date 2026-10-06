"use client";

import { useDeferredValue, useMemo, useState, Component, type ReactNode } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  MoreHorizontal,
  PackageCheck,
  Printer,
  Search,
  Send,
  Truck,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { adminOrdersSr as dict } from "@/lib/i18n/sr/admin-orders";
import { adminDomainSr } from "@/lib/i18n/sr/admin-domain";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel, AdminStatus } from "./admin-primitives";
import { AdminDataView, type AdminColumn } from "./admin-ui";

type ListResult = FunctionReturnType<typeof api.adminOrders.list>;
type OrderRow = ListResult["page"][number];
type LiveDetail = NonNullable<FunctionReturnType<typeof api.adminOrders.getDetail>>;
type PaymentState = OrderRow["paymentState"];
type DesignState = OrderRow["designState"];
type FulfillmentState = OrderRow["fulfillmentState"];
type View = OrderRow["view"];
type Sort = "updated_desc" | "updated_asc";
type AdminOption = FunctionReturnType<typeof api.adminTasks.listAdmins>[number];
type DeliveryMethod = LiveDetail["deliveries"][number]["method"];

type DetailView = {
  operation: OrderRow & { note?: string; reversedMinor: number; createdByName?: string };
  lines: Array<{
    id: Id<"orderLines">;
    productLabel: string;
    businessName: string;
    smlCode: string;
    quantity: number;
    lineTotalMinor: number;
    currency: "RSD";
    designKind: "template" | "custom";
    designState: DesignState;
    designRevision: number;
    configSnapshot: unknown;
    approved: boolean;
    smf: number;
    sent: number;
    received: number;
    qcPassed: number;
    qcProblems: number;
    delivered: number;
  }>;
  provisioningCount: number;
  printJobs: LiveDetail["printJobs"];
  printJobLines: LiveDetail["printJobLines"];
  printerReceipts: LiveDetail["printerReceipts"];
  qualityChecks: LiveDetail["qualityChecks"];
  activationSignals: LiveDetail["activationSignals"];
  deliveries: LiveDetail["deliveries"];
  deliveryLines: LiveDetail["deliveryLines"];
  tasks: LiveDetail["tasks"];
};

const paymentLabels: Record<PaymentState, string> = {
  awaiting_payment: dict.paymentAwaiting,
  paid: dict.paymentPaid,
  reversed: dict.paymentReversed,
};
const designLabels: Record<DesignState, string> = {
  template_selected: dict.designTemplateSelected,
  in_progress: dict.designInProgress,
  awaiting_approval: dict.designAwaitingApproval,
  approved: dict.designApproved,
};
const fulfillmentLabels: Record<FulfillmentState, string> = {
  awaiting_conditions: dict.fulfillmentAwaitingConditions,
  smf_assigned: dict.fulfillmentSmfAssigned,
  ready_for_printer: dict.fulfillmentReadyForPrinter,
  at_printer: dict.fulfillmentAtPrinter,
  received: dict.fulfillmentReceived,
  quality_control: dict.fulfillmentQualityControl,
  ready_for_delivery: dict.fulfillmentReadyForDelivery,
  in_delivery: dict.fulfillmentInDelivery,
  delivered: dict.fulfillmentDelivered,
  cancelled: dict.fulfillmentCancelled,
};
const printJobLabels: Record<LiveDetail["printJobs"][number]["state"], string> = {
  draft: dict.printDraft,
  sent: dict.printSent,
  partially_received: dict.printPartiallyReceived,
  received: dict.printReceived,
  cancelled: dict.printCancelled,
};
const deliveryLabels: Record<LiveDetail["deliveries"][number]["state"], string> = {
  draft: dict.deliveryDraft,
  in_delivery: dict.deliveryInDelivery,
  delivered: dict.deliveryDelivered,
  problem: dict.deliveryProblem,
  cancelled: dict.deliveryCancelled,
};
const taskLabels: Record<LiveDetail["tasks"][number]["status"], string> = {
  open: dict.taskOpen,
  in_progress: dict.taskInProgress,
  deferred: dict.taskDeferred,
  completed: dict.taskCompleted,
  cancelled: dict.taskCancelled,
};
const eventLabels: Record<string, string> = {
  migrated: dict.eventMigrated,
  assigned: dict.eventAssigned,
  payment_recorded: dict.eventPaymentRecorded,
  payment_reversed: dict.eventPaymentReversed,
  design_changed: dict.eventDesignChanged,
  design_approved: dict.eventDesignApproved,
  provisioning_requested: dict.eventProvisioningRequested,
  smf_assigned: dict.eventSmfAssigned,
  print_job_created: dict.eventPrintJobCreated,
  sent_to_printer: dict.eventSentToPrinter,
  printer_receipt_recorded: dict.eventPrinterReceiptRecorded,
  quality_control_recorded: dict.eventQualityControlRecorded,
  delivery_created: dict.eventDeliveryCreated,
  delivery_started: dict.eventDeliveryStarted,
  delivery_completed: dict.eventDeliveryCompleted,
  delivery_problem: dict.eventDeliveryProblem,
  cancelled: dict.eventCancelled,
  archived: dict.eventArchived,
  note_changed: dict.eventNoteChanged,
};

function workflowValueLabel(value: string) {
  if (value === "problem") return dict.problems;
  return paymentLabels[value as PaymentState]
    ?? designLabels[value as DesignState]
    ?? fulfillmentLabels[value as FulfillmentState]
    ?? printJobLabels[value as keyof typeof printJobLabels]
    ?? deliveryLabels[value as keyof typeof deliveryLabels]
    ?? (value === "migration_v1" ? dict.migrationVersion : value);
}

const money = new Intl.NumberFormat("sr-Latn-RS", { style: "currency", currency: "RSD", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function commandId() {
  return globalThis.crypto?.randomUUID?.() ?? `admin11-${Date.now()}-${Math.random()}`;
}

function toneFor(state: PaymentState | DesignState | FulfillmentState) {
  if (["paid", "approved", "template_selected", "ready_for_printer", "ready_for_delivery", "delivered"].includes(state)) return "active" as const;
  if (["reversed", "cancelled"].includes(state)) return "problem" as const;
  return "waiting" as const;
}

function nextStep(row: OrderRow) {
  if (row.paymentState !== "paid") return dict.nextPayment;
  if (row.designState === "in_progress" || row.designState === "awaiting_approval") return dict.nextDesign;
  if (row.fulfillmentState === "awaiting_conditions" || row.fulfillmentState === "smf_assigned") return dict.nextProvisioning;
  if (row.fulfillmentState === "ready_for_printer") return dict.nextPrinter;
  if (row.fulfillmentState === "at_printer") return dict.nextReceipt;
  if (row.fulfillmentState === "received" || row.fulfillmentState === "quality_control") return dict.nextQc;
  if (row.fulfillmentState === "ready_for_delivery" || row.fulfillmentState === "in_delivery") return dict.nextDelivery;
  return dict.nextDone;
}

function AxisStack({ row }: { row: OrderRow }) {
  return (
    <div className="flex min-w-[10rem] flex-col items-start gap-1.5">
      <AdminStatus label={paymentLabels[row.paymentState]} tone={toneFor(row.paymentState)} className="min-h-6 px-2 text-[0.68rem]" />
      <AdminStatus label={designLabels[row.designState]} tone={toneFor(row.designState)} className="min-h-6 px-2 text-[0.68rem]" />
      <AdminStatus label={fulfillmentLabels[row.fulfillmentState]} tone={toneFor(row.fulfillmentState)} className="min-h-6 px-2 text-[0.68rem]" />
    </div>
  );
}

function Lines({ detail }: { detail: DetailView }) {
  return (
    <div className="grid gap-2 border-t border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 sm:p-4">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--admin-text-muted)]">{dict.linesTitle}</p>
      {detail.lines.map((line) => (
        <div key={line.id} className="grid gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <strong className="block text-sm">{line.productLabel} · {line.quantity} {dict.quantityShort}</strong>
            <span className="mt-1 block text-xs tabular-nums text-[var(--admin-text-muted)]">{money.format(line.lineTotalMinor / 100)}</span>
            <span className="mt-1 block font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{line.smlCode} · {line.businessName}</span>
          </div>
          <div className="min-w-0 text-xs text-[var(--admin-text-muted)]">
            <span className="block">{dict.lineProgress}</span>
            <span className="mt-1 block font-mono tabular-nums">{line.smf}/{line.quantity} · {line.sent}/{line.quantity} · {line.received}/{line.quantity} · {line.qcPassed}/{line.quantity} · {line.delivered}/{line.quantity}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrdersList({ rows, details, onSelect, onExpand }: { rows: OrderRow[]; details: Record<string, DetailView | undefined>; onSelect: (id: Id<"orderOperations">) => void; onExpand: (id: Id<"orderOperations">) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const columns: AdminColumn<OrderRow>[] = [
    { id: "order", header: dict.colOrder, sortValue: (row) => row.smpCode, cell: (row) => <button type="button" onClick={() => { toggle(row.id); onExpand(row.id); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-expanded={expanded.has(row.id)} aria-label={`${expanded.has(row.id) ? dict.collapseLines : dict.expandLines}: ${row.smpCode}`}><ChevronRight className={cn("size-4 transition-transform motion-reduce:transition-none", expanded.has(row.id) && "rotate-90")} aria-hidden="true" /><span><strong className="block text-sm">{row.smpCode}</strong><span className="mt-1 block font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{row.lineCount} · {row.unitCount} {dict.quantityShort}</span></span></button> },
    { id: "client", header: dict.colClient, sortValue: (row) => row.accountName, className: "max-w-[18rem]", cell: (row) => <><strong className="block text-sm">{row.accountName}</strong><span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{row.primaryBusinessName ?? `${row.lineCount} ${dict.multipleLocations}`}</span><span className="mt-1 block font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{row.smkCode}{row.primarySmlCode ? ` · ${row.primarySmlCode}` : ""}</span></> },
    { id: "state", header: dict.colState, cell: (row) => <AxisStack row={row} /> },
    { id: "next", header: dict.colNext, sortValue: nextStep, className: "max-w-[16rem]", cell: (row) => <span className={row.problemCount ? "font-semibold text-[var(--admin-danger)]" : "font-medium"}>{nextStep(row)}</span> },
    { id: "note", header: dict.colNoteProblem, sortValue: (row) => row.problemCount, className: "max-w-[14rem] text-xs", cell: (row) => <><span className={row.problemCount ? "inline-flex items-center gap-1.5 font-semibold text-[var(--admin-danger)]" : "text-[var(--admin-text-muted)]"}>{row.problemCount ? <><AlertTriangle className="size-3.5" aria-hidden="true" />{row.problemCount} {dict.problems}</> : row.notePreview ?? dict.noNote}</span>{row.problemCount && row.notePreview ? <span className="mt-2 block line-clamp-2 text-[var(--admin-text-muted)]">{row.notePreview}</span> : null}</> },
    { id: "assignee", header: dict.colAssignee, sortValue: (row) => row.assigneeName, cell: (row) => row.assigneeName },
    { id: "updated", header: dict.colUpdated, sortValue: (row) => row.updatedAt, className: "text-xs text-[var(--admin-text-muted)]", cell: (row) => <time dateTime={new Date(row.updatedAt).toISOString()}>{dateTime.format(row.updatedAt)}</time> },
  ];
  return (
    <AdminDataView
      listKey="operativa.porudzbine"
      caption={dict.tableCaption}
      rows={rows}
      getRowId={(row) => row.id}
      columns={columns}
      tableClassName="min-w-[64rem]"
      actionsHeader={dict.openDetail}
      renderCard={(row) => (
        <button type="button" data-order-detail-trigger={row.id} onClick={() => onSelect(row.id)} className="grid min-h-11 w-full gap-4 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--admin-focus)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><strong className="block text-base">{row.smpCode}</strong><span className="mt-1 block truncate text-sm text-[var(--admin-text-muted)]">{row.accountName}</span></div>
            {row.problemCount ? <AdminStatus label={`${row.problemCount} ${dict.problems}`} tone="problem" /> : <ChevronRight className="mt-1 size-5 shrink-0" aria-hidden="true" />}
          </div>
          <p className="text-sm font-semibold">{nextStep(row)}</p>
          <AxisStack row={row} />
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--admin-text-muted)]"><span>{row.assigneeName}</span><time dateTime={new Date(row.updatedAt).toISOString()}>{dateTime.format(row.updatedAt)}</time></div>
        </button>
      )}
      rowActions={(row, context) => (context.view === "kartice" ? (
        <button type="button" onClick={() => { toggle(row.id); onExpand(row.id); }} className="flex min-h-11 w-full items-center justify-between rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-expanded={expanded.has(row.id)}>
          {expanded.has(row.id) ? dict.collapseLines : dict.expandLines}<ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", expanded.has(row.id) && "rotate-180")} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" data-order-detail-trigger={row.id} onClick={() => onSelect(row.id)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.openDetail}: ${row.smpCode}`}><MoreHorizontal className="size-4" aria-hidden="true" /></button>
      ))}
      rowDetail={(row) => (expanded.has(row.id) ? (details[row.id] ? <Lines detail={details[row.id]!} /> : <AdminLoadingState compact />) : null)}
    />
  );
}

function Filters(props: {
  view: View; search: string; assignee: string; admins: AdminOption[]; payment: PaymentState | "all"; design: DesignState | "all"; fulfillment: FulfillmentState | "all"; sort: Sort; problems: boolean;
  onView: (value: View) => void; onSearch: (value: string) => void; onAssignee: (value: string) => void; onPayment: (value: PaymentState | "all") => void; onDesign: (value: DesignState | "all") => void; onFulfillment: (value: FulfillmentState | "all") => void; onSort: (value: Sort) => void; onProblems: (value: boolean) => void;
}) {
  return (
    <AdminPanel className="grid gap-4 p-3 sm:p-4">
      <div className="flex max-w-full gap-1 overflow-hidden rounded-full bg-[var(--admin-surface-muted)] p-1" role="tablist" aria-label={dict.pageTitle}>
        {([['active', dict.tabActive], ['completed', dict.tabCompleted], ['archived', dict.tabArchived]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={props.view === value} onClick={() => props.onView(value)} className={cn("min-h-11 min-w-0 flex-1 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] sm:flex-none sm:px-4 sm:text-sm", props.view === value ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)] shadow-sm" : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]")}>{label}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-[minmax(15rem,1.5fr)_repeat(5,minmax(9.5rem,1fr))_auto]">
        <Label className="relative col-span-2 block lg:col-span-1"><span className="sr-only">{dict.searchLabel}</span><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[var(--admin-text-muted)]" aria-hidden="true" /><Input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder={dict.searchPlaceholder} className="min-h-11 pl-10" /></Label>
        <Select value={props.assignee} onValueChange={props.onAssignee}><SelectTrigger className="min-h-11 w-full" aria-label={dict.filterAssignee}><SelectValue placeholder={dict.filterAssignee} /></SelectTrigger><SelectContent><SelectItem value="all">{dict.assigneeAll}</SelectItem>{props.admins.map((admin) => <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>)}</SelectContent></Select>
        <Select value={props.payment} onValueChange={(value) => props.onPayment(value as PaymentState | "all")}><SelectTrigger className="min-h-11 w-full"><SelectValue placeholder={dict.filterPayment} /></SelectTrigger><SelectContent><SelectItem value="all">{dict.filterPayment}: {dict.filterAll}</SelectItem>{Object.entries(paymentLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={props.design} onValueChange={(value) => props.onDesign(value as DesignState | "all")}><SelectTrigger className="min-h-11 w-full"><SelectValue placeholder={dict.filterDesign} /></SelectTrigger><SelectContent><SelectItem value="all">{dict.filterDesign}: {dict.filterAll}</SelectItem>{Object.entries(designLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={props.fulfillment} onValueChange={(value) => props.onFulfillment(value as FulfillmentState | "all")}><SelectTrigger className="min-h-11 w-full"><SelectValue placeholder={dict.filterFulfillment} /></SelectTrigger><SelectContent>{Object.entries(fulfillmentLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}<SelectItem value="all">{dict.filterFulfillment}: {dict.filterAll}</SelectItem></SelectContent></Select>
        <Select value={props.sort} onValueChange={(value) => props.onSort(value as Sort)} disabled={Boolean(props.search.trim())}><SelectTrigger className="min-h-11 w-full" aria-label={dict.sortLabel} title={props.search.trim() ? dict.sortSearchHint : undefined}><SelectValue placeholder={dict.sortLabel} /></SelectTrigger><SelectContent><SelectItem value="updated_desc">{dict.sortNewest}</SelectItem><SelectItem value="updated_asc">{dict.sortOldest}</SelectItem></SelectContent></Select>
        <button type="button" onClick={() => props.onProblems(!props.problems)} aria-pressed={props.problems} className={cn("min-h-11 rounded-full border px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] sm:px-4 sm:text-sm", props.problems ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]" : "border-[var(--admin-border)]")}>{dict.filterProblems}</button>
      </div>
    </AdminPanel>
  );
}

function normalizeDetail(detail: LiveDetail): DetailView {
  return {
    operation: {
      ...listItemFromOperation(detail.operation),
      note: detail.operation.note,
      reversedMinor: detail.operation.reversedMinor,
      createdByName: detail.operation.createdByName,
    },
    lines: detail.lines.map((line) => ({
      id: line._id,
      productLabel: line.productLabel,
      businessName: line.businessName,
      smlCode: line.smlCode,
      quantity: line.quantity,
      lineTotalMinor: line.lineTotalMinor,
      currency: line.currency,
      designKind: line.designKind,
      designState: line.designState,
      designRevision: line.designRevision,
      configSnapshot: line.configSnapshot,
      approved: Boolean(line.approvedSnapshotId),
      smf: line.smfAssignedCount,
      sent: line.sentToPrinterCount,
      received: line.receivedCount,
      qcPassed: line.qcPassedCount,
      qcProblems: line.qcProblemCount,
      delivered: line.deliveredCount,
    })),
    provisioningCount: detail.provisioningRequests.length,
    printJobs: detail.printJobs,
    printJobLines: detail.printJobLines,
    printerReceipts: detail.printerReceipts,
    qualityChecks: detail.qualityChecks,
    activationSignals: detail.activationSignals,
    deliveries: detail.deliveries,
    deliveryLines: detail.deliveryLines,
    tasks: detail.tasks,
  };
}

function listItemFromOperation(operation: LiveDetail["operation"]): OrderRow {
  return {
    id: operation._id,
    orderId: operation.orderId,
    smpCode: operation.smpCode,
    accountId: operation.accountId,
    accountName: operation.accountName,
    smkCode: operation.smkCode,
    primaryBusinessName: operation.primaryBusinessName ?? null,
    primarySmlCode: operation.primarySmlCode ?? null,
    paymentState: operation.paymentState,
    designState: operation.designState,
    fulfillmentState: operation.fulfillmentState,
    view: operation.view,
    priority: operation.priority,
    assigneeId: operation.assigneeId,
    assigneeName: operation.assigneeName,
    requiredMinor: operation.requiredMinor,
    settledMinor: operation.settledMinor,
    lineCount: operation.lineCount,
    unitCount: operation.unitCount,
    problemCount: operation.problemCount,
    notePreview: operation.note?.slice(0, 120) ?? null,
    provisioningReady: operation.provisioningReady,
    updatedAt: operation.updatedAt,
  };
}

function DetailSection({ title, icon: Icon, children }: { title: string; icon: typeof CircleDollarSign; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-[var(--admin-border)] p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-[var(--admin-text-muted)]" aria-hidden="true" />{title}</h3>
      {children}
    </section>
  );
}

function DetailPanel({ detail, timeline, actions }: { detail: DetailView; timeline: Array<{ _id: string; kind: string; actorUserId: string; fromValue?: string; toValue?: string; reason?: string; createdAt: number }>; actions?: ReactNode }) {
  const row = detail.operation;
  return (
    <div className="min-w-0">
      <section className="grid gap-3 border-b border-[var(--admin-border)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs text-[var(--admin-text-muted)]">{row.smpCode}</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">{row.accountName}</h2><p className="mt-1 text-sm text-[var(--admin-text-muted)]">{row.smkCode}{row.primarySmlCode ? ` · ${row.primarySmlCode}` : ""}</p></div><AdminStatus label={row.problemCount ? `${row.problemCount} ${dict.problems}` : dict.noProblems} tone={row.problemCount ? "problem" : "active"} /></div>
        <p className="text-sm font-semibold">{nextStep(row)}</p>
      </section>
      <DetailSection title={dict.clientSection} icon={CheckCircle2}><div className="grid gap-2 text-sm sm:grid-cols-2"><p><span className="block text-xs text-[var(--admin-text-muted)]">{dict.clientSection}</span><strong>{row.primaryBusinessName ?? row.accountName}</strong></p><p><span className="block text-xs text-[var(--admin-text-muted)]">{dict.assigneeLabel}</span><strong>{row.assigneeName}</strong></p>{row.createdByName ? <p><span className="block text-xs text-[var(--admin-text-muted)]">{dict.createdByLabel}</span><strong>{row.createdByName}</strong></p> : null}</div></DetailSection>
      <DetailSection title={dict.axesSection} icon={ClipboardCheck}><div className="grid gap-2 sm:grid-cols-3"><AdminStatus label={paymentLabels[row.paymentState]} tone={toneFor(row.paymentState)} /><AdminStatus label={designLabels[row.designState]} tone={toneFor(row.designState)} /><AdminStatus label={fulfillmentLabels[row.fulfillmentState]} tone={toneFor(row.fulfillmentState)} /></div></DetailSection>
      <DetailSection title={dict.paymentSection} icon={CircleDollarSign}><div className="flex items-end justify-between gap-4"><div><p className="text-2xl font-semibold tabular-nums">{money.format(row.settledMinor / 100)}</p><p className="text-xs text-[var(--admin-text-muted)]">{dict.paymentOf} {money.format(row.requiredMinor / 100)}{row.reversedMinor ? ` · ${dict.paymentReversedAmount} ${money.format(row.reversedMinor / 100)}` : ""}</p></div></div></DetailSection>
      <DetailSection title={dict.designSection} icon={FileCheck2}>{detail.lines.map((line) => <div key={line.id} className="rounded-xl bg-[var(--admin-surface-muted)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{line.productLabel} · v{line.designRevision}</strong><AdminStatus label={designLabels[line.designState]} tone={toneFor(line.designState)} /></div><p className="mt-2 text-xs text-[var(--admin-text-muted)]">{line.designKind === "template" ? dict.designTemplateSelected : line.approved ? dict.printSnapshot : dict.nextDesign}</p></div>)}</DetailSection>
      <DetailSection title={dict.productionSection} icon={Printer}><Lines detail={detail} /><p className="text-xs text-[var(--admin-text-muted)]">{row.provisioningReady && detail.lines.some((line) => line.smf < line.quantity) ? dict.smfPendingAdmin12 : detail.lines.every((line) => line.smf === line.quantity) ? dict.smfReady : dict.blockedAction}</p>{detail.printJobs.length ? <div className="grid gap-2">{detail.printJobs.map((job) => <div key={job._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--admin-border)] p-3 text-sm"><span><strong>{job.printerName}</strong><span className="ml-2 text-[var(--admin-text-muted)]">{printJobLabels[job.state]}</span></span><span className="text-xs text-[var(--admin-text-muted)]">{dict.printerDestination}{job.expectedAt ? ` · ${dict.expectedReturn}: ${dateTime.format(job.expectedAt)}` : ""}</span></div>)}</div> : <p className="text-sm text-[var(--admin-text-muted)]">{dict.noRecords}</p>}</DetailSection>
      <DetailSection title={dict.qcSection} icon={PackageCheck}>{detail.qualityChecks.length ? <div className="grid gap-2">{detail.qualityChecks.map((check) => <div key={check._id} className="rounded-xl border border-[var(--admin-border)] p-3 text-sm"><div className="flex items-center justify-between gap-2"><strong>{check.result === "pass" ? dict.qcPass : dict.qcProblem}</strong><span>{check.quantity} {dict.quantityShort}</span></div>{check.reason ? <p className="mt-2 text-xs text-[var(--admin-danger)]">{check.reason}</p> : null}</div>)}</div> : <p className="text-sm text-[var(--admin-text-muted)]">{dict.noRecords}</p>}{detail.activationSignals.length ? <p className="text-xs text-[var(--admin-text-muted)]"><strong className="text-[var(--admin-success)]">{dict.activationSignal}.</strong> {dict.activationNotPerformed}</p> : null}</DetailSection>
      <DetailSection title={dict.deliverySection} icon={Truck}>{detail.deliveries.length ? <div className="grid gap-2">{detail.deliveries.map((delivery) => <div key={delivery._id} className="rounded-xl border border-[var(--admin-border)] p-3 text-sm"><div className="flex justify-between gap-2"><strong>{delivery.method === "courier" ? dict.deliveryCourier : dict.deliveryPersonal}</strong><span>{deliveryLabels[delivery.state]}</span></div><p className="mt-2 font-medium">{delivery.businessName} · {delivery.recipientName}</p><p className="mt-1 text-xs text-[var(--admin-text-muted)]">{delivery.address}</p>{delivery.method === "courier" && (delivery.courierService || delivery.courierReference) ? <p className="mt-1 text-xs text-[var(--admin-text-muted)]">{[delivery.courierService, delivery.courierReference].filter(Boolean).join(" · ")}</p> : null}<p className="mt-2 text-xs text-[var(--admin-text-muted)]">{delivery.method === "courier" ? dict.courierFeeNote : dict.personalFeeNote}</p></div>)}</div> : <p className="text-sm text-[var(--admin-text-muted)]">{dict.noRecords}</p>}</DetailSection>
      <DetailSection title={dict.taskSection} icon={CheckCircle2}>{detail.tasks.length ? <div className="grid gap-2">{detail.tasks.map((task) => <div key={task._id} className="rounded-xl border border-[var(--admin-border)] p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><strong>{task.title}</strong><AdminStatus label={taskLabels[task.status]} tone={task.status === "completed" ? "active" : task.status === "cancelled" ? "problem" : "waiting"} /></div><p className="mt-2 text-xs text-[var(--admin-text-muted)]">{dict.assigneeLabel}: {task.assigneeName}</p></div>)}</div> : <p className="text-sm text-[var(--admin-text-muted)]">{dict.noRecords}</p>}{actions}</DetailSection>
      <DetailSection title={dict.notesSection} icon={FileCheck2}><p className="whitespace-pre-wrap text-sm text-[var(--admin-text-muted)]">{row.note || dict.noRecords}</p></DetailSection>
      <DetailSection title={dict.auditSection} icon={ClipboardCheck}>{timeline.length ? <ol className="grid gap-3 border-l border-[var(--admin-border)] pl-4">{timeline.map((event) => <li key={event._id} className="relative text-sm before:absolute before:-left-[1.27rem] before:top-1.5 before:size-2 before:rounded-full before:bg-[var(--admin-accent)]"><strong>{eventLabels[event.kind] ?? event.kind}</strong><p className="mt-1 break-words text-xs text-[var(--admin-text-muted)]">{event.fromValue ? `${workflowValueLabel(event.fromValue)} → ` : ""}{event.toValue ? workflowValueLabel(event.toValue) : ""}{event.reason ? ` · ${event.reason}` : ""}</p><time className="mt-1 block text-[0.68rem] text-[var(--admin-text-muted)]" dateTime={new Date(event.createdAt).toISOString()}>{dateTime.format(event.createdAt)}</time></li>)}</ol> : <p className="text-sm text-[var(--admin-text-muted)]">{dict.noRecords}</p>}</DetailSection>
    </div>
  );
}

function LiveActions({ raw, normalized }: { raw: LiveDetail; normalized: DetailView }) {
  const recordPayment = useMutation(api.adminOrders.recordPayment);
  const setDesignState = useMutation(api.adminOrders.setDesignState);
  const approveDesign = useMutation(api.adminOrders.approveDesign);
  const createPrintJob = useMutation(api.adminOrders.createPrintJob);
  const dispatchPrintJob = useMutation(api.adminOrders.dispatchPrintJob);
  const receivePrintJob = useMutation(api.adminOrders.receivePrintJob);
  const recordQualityCheck = useMutation(api.adminOrders.recordQualityCheck);
  const createDelivery = useMutation(api.adminOrders.createDelivery);
  const startDelivery = useMutation(api.adminOrders.startDelivery);
  const completeDelivery = useMutation(api.adminOrders.completeDelivery);
  const updateNote = useMutation(api.adminOrders.updateNote);
  const savePrinter = useMutation(api.adminOrders.savePrinter);
  const printers = useQuery(api.adminOrders.listPrinters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(normalized.operation.note ?? "");
  const [printerName, setPrinterName] = useState("");
  const [printerContact, setPrinterContact] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("personal");
  const [courierService, setCourierService] = useState("");
  const [courierReference, setCourierReference] = useState("");
  const [courierFeeRsd, setCourierFeeRsd] = useState("");

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try { await work(); } catch { setError(dict.mutationError); } finally { setBusy(false); }
  };
  const remaining = normalized.operation.requiredMinor - normalized.operation.settledMinor;
  const designLine = raw.lines.find((line) => line.designKind === "custom" && line.designState !== "approved");
  const printable = raw.lines.filter((line) => line.smfAssignedCount === line.quantity && line.sentToPrinterCount === 0);
  const draftJob = raw.printJobs.find((job) => job.state === "draft");
  const sentJob = raw.printJobs.find((job) => job.state === "sent" || job.state === "partially_received");
  const sentJobLine = sentJob ? raw.printJobLines.find((line) => line.printJobId === sentJob._id) : undefined;
  const qcJob = raw.printJobs.find((job) => raw.printJobLines.some((jobLine) => {
    if (jobLine.printJobId !== job._id) return false;
    const received = raw.printerReceipts
      .filter((receipt) => receipt.printJobId === job._id && receipt.orderLineId === jobLine.orderLineId)
      .reduce((sum, receipt) => sum + receipt.quantity, 0);
    const checked = raw.qualityChecks
      .filter((check) => check.printJobId === job._id && check.orderLineId === jobLine.orderLineId)
      .reduce((sum, check) => sum + check.quantity, 0);
    return received > checked;
  }));
  const qcJobLine = qcJob ? raw.printJobLines.find((line) => line.printJobId === qcJob._id) : undefined;
  const qcLine = qcJobLine ? raw.lines.find((line) => line._id === qcJobLine.orderLineId) : undefined;
  const qcPending = qcJob && qcLine
    ? raw.printerReceipts.filter((row) => row.printJobId === qcJob._id && row.orderLineId === qcLine._id).reduce((sum, row) => sum + row.quantity, 0)
      - raw.qualityChecks.filter((row) => row.printJobId === qcJob._id && row.orderLineId === qcLine._id).reduce((sum, row) => sum + row.quantity, 0)
    : 0;
  const deliverableLines = raw.lines.filter((line) => line.qcPassedCount - line.deliveredCount - line.inDeliveryCount - line.deliveryReservedCount > 0);
  const deliverable = deliverableLines.length
    ? deliverableLines.filter((line) => line.businessId === deliverableLines[0].businessId)
    : [];
  const parsedCourierFee = courierFeeRsd.trim() === "" ? undefined : Number(courierFeeRsd);
  const courierFeeValid = parsedCourierFee === undefined || (
    Number.isSafeInteger(parsedCourierFee) &&
    parsedCourierFee >= 0 &&
    Number.isSafeInteger(parsedCourierFee * 100)
  );
  const draftDelivery = raw.deliveries.find((delivery) => delivery.state === "draft");
  const activeDelivery = raw.deliveries.find((delivery) => delivery.state === "in_delivery" || delivery.state === "problem");

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" className="min-h-11" disabled={busy || remaining <= 0} onClick={() => void run(() => recordPayment({ operationId: raw.operation._id, amountMinor: remaining, method: "bank_transfer", paidAt: Date.now(), key: commandId() }))}><CircleDollarSign className="size-4" aria-hidden="true" />{dict.payRemaining}</Button>
        {designLine?.designState === "in_progress" ? <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void run(() => setDesignState({ orderLineId: designLine._id, state: "awaiting_approval", commandId: commandId() }))}><FileCheck2 className="size-4" aria-hidden="true" />{dict.moveDesign}</Button> : null}
        {designLine?.designState === "awaiting_approval" ? <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void run(() => approveDesign({ orderLineId: designLine._id, snapshot: designLine.configSnapshot, commandId: commandId() }))}><FileCheck2 className="size-4" aria-hidden="true" />{dict.approveDesign}</Button> : null}
        <Button type="button" variant="outline" className="min-h-11" disabled={busy || printable.length === 0 || !printers?.[0]} onClick={() => void run(() => createPrintJob({ operationId: raw.operation._id, printerId: printers![0]._id, lines: printable.map((line) => ({ orderLineId: line._id, quantity: line.quantity })), commandId: commandId() }))}><Printer className="size-4" aria-hidden="true" />{dict.createPrintJob}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy || !draftJob} onClick={() => draftJob && void run(() => dispatchPrintJob({ printJobId: draftJob._id, commandId: commandId() }))}><Send className="size-4" aria-hidden="true" />{dict.sendToPrinter}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy || !sentJob || !sentJobLine} onClick={() => sentJob && sentJobLine && void run(() => receivePrintJob({ printJobId: sentJob._id, orderLineId: sentJobLine.orderLineId, quantity: sentJobLine.quantity, commandId: commandId() }))}><PackageCheck className="size-4" aria-hidden="true" />{dict.receivePrint}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy || !qcLine || !qcJob || qcPending === 0} onClick={() => qcLine && qcJob && void run(() => recordQualityCheck({ printJobId: qcJob._id, orderLineId: qcLine._id, result: "pass", quantity: qcPending, remakeRequested: false, commandId: commandId() }))}><CheckCircle2 className="size-4" aria-hidden="true" />{dict.qcPass}</Button>
      </div>
      <Label className="grid gap-2 text-sm font-medium">{dict.qcProblem}<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={dict.qcReasonPlaceholder} /></Label>
      <Button type="button" variant="outline" className="min-h-11 justify-self-start text-[var(--admin-danger)]" disabled={busy || !qcLine || !qcJob || qcPending === 0 || !reason.trim()} onClick={() => qcLine && qcJob && void run(() => recordQualityCheck({ printJobId: qcJob._id, orderLineId: qcLine._id, result: "problem", quantity: qcPending, reason, remakeRequested: true, commandId: commandId() }))}><AlertTriangle className="size-4" aria-hidden="true" />{dict.qcProblem}</Button>
      <Label className="grid gap-2 text-sm font-medium">{dict.deliveryAddressLabel}<Input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder={dict.deliveryAddressPlaceholder} className="min-h-11" /></Label>
      <Label className="grid gap-2 text-sm font-medium">{dict.deliveryMethodLabel}<Select value={deliveryMethod} onValueChange={(value) => setDeliveryMethod(value as DeliveryMethod)}><SelectTrigger className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">{dict.deliveryPersonal}</SelectItem><SelectItem value="courier">{dict.deliveryCourier}</SelectItem></SelectContent></Select></Label>
      {deliveryMethod === "courier" ? <div className="grid gap-3 sm:grid-cols-2"><Label className="grid gap-2 text-sm font-medium">{dict.courierServiceLabel}<Input value={courierService} onChange={(event) => setCourierService(event.target.value)} placeholder={dict.courierServicePlaceholder} className="min-h-11" /></Label><Label className="grid gap-2 text-sm font-medium">{dict.courierReferenceLabel}<Input value={courierReference} onChange={(event) => setCourierReference(event.target.value)} placeholder={dict.courierReferencePlaceholder} className="min-h-11" /></Label><Label className="grid gap-2 text-sm font-medium sm:col-span-2">{dict.courierFeeLabel}<Input type="number" min="0" step="1" inputMode="numeric" value={courierFeeRsd} onChange={(event) => setCourierFeeRsd(event.target.value)} className="min-h-11" /></Label></div> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <Button type="button" variant="outline" className="min-h-11" disabled={busy || deliverable.length === 0 || !deliveryAddress.trim() || !courierFeeValid} onClick={() => void run(() => createDelivery({ operationId: raw.operation._id, method: deliveryMethod, address: deliveryAddress, ...(deliveryMethod === "personal" ? { courierFeeMinor: 0 } : { ...(courierService.trim() ? { courierService } : {}), ...(courierReference.trim() ? { courierReference } : {}), ...(parsedCourierFee !== undefined ? { courierFeeMinor: parsedCourierFee * 100 } : {}) }), lines: deliverable.map((line) => ({ orderLineId: line._id, quantity: line.qcPassedCount - line.deliveredCount - line.inDeliveryCount - line.deliveryReservedCount })), commandId: commandId() }))}><Truck className="size-4" aria-hidden="true" />{dict.createDelivery}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy || !draftDelivery} onClick={() => draftDelivery && void run(() => startDelivery({ deliveryId: draftDelivery._id, commandId: commandId() }))}>{dict.startDelivery}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy || !activeDelivery} onClick={() => activeDelivery && void run(() => completeDelivery({ deliveryId: activeDelivery._id, commandId: commandId() }))}>{dict.completeDelivery}</Button>
      </div>
      <Label className="grid gap-2 text-sm font-medium">{dict.notesSection}<Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Label>
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={busy || note === (normalized.operation.note ?? "")} onClick={() => void run(() => updateNote({ operationId: raw.operation._id, note, commandId: commandId() }))}>{busy ? dict.saving : dict.saveNote}</Button>
      {printers?.length === 0 ? <div className="grid gap-3 rounded-xl border border-[var(--admin-border)] p-3"><p className="text-xs text-[var(--admin-text-muted)]">{dict.printerMissing}</p><Label className="grid gap-2 text-sm font-medium">{dict.printerNameLabel}<Input value={printerName} onChange={(event) => setPrinterName(event.target.value)} placeholder={dict.printerNamePlaceholder} className="min-h-11" /></Label><Label className="grid gap-2 text-sm font-medium">{dict.printerContactLabel}<Input value={printerContact} onChange={(event) => setPrinterContact(event.target.value)} placeholder={dict.printerContactPlaceholder} className="min-h-11" /></Label><Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={busy || !printerName.trim()} onClick={() => void run(() => savePrinter({ name: printerName, ...(printerContact.trim() ? { contact: printerContact } : {}) }))}>{dict.savePrinter}</Button></div> : null}
      {error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{error}</p> : null}
    </div>
  );
}

function Header({ preview = false }: { preview?: boolean }) {
  return (
    <>
      {preview ? <div className="flex flex-wrap items-center gap-2"><AdminStatus label={dict.previewBadge} tone="waiting" /><p className="text-xs text-[var(--admin-text-muted)]">{dict.previewDescription}</p></div> : null}
      <header><h1 className="text-[clamp(2.1rem,4vw,3.75rem)] leading-none font-medium tracking-[-0.05em]">{dict.pageTitle}</h1><p className="mt-2 text-sm text-[var(--admin-text-muted)] sm:text-base">{dict.pageSubtitle}</p></header>
    </>
  );
}

function OrdersSheet({ selected, detail, timeline, onClose, actions }: { selected: OrderRow | null; detail?: DetailView | null; timeline: Array<{ _id: string; kind: string; actorUserId: string; fromValue?: string; toValue?: string; reason?: string; createdAt: number }>; onClose: () => void; actions?: ReactNode }) {
  return (
    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="admin-v1 w-full max-w-none overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 sm:max-w-[46rem] motion-reduce:duration-0">
        <SheetHeader className="border-b border-[var(--admin-border)] p-4 pr-14 text-left sm:p-5 sm:pr-14"><SheetTitle>{selected ? `${dict.detailTitle} · ${selected.smpCode}` : dict.detailTitle}</SheetTitle><SheetDescription>{dict.detailDescription}</SheetDescription></SheetHeader>
        {detail === undefined ? <AdminLoadingState label={dict.loading} /> : detail === null ? <AdminErrorState title={dict.errorTitle} body={dict.errorBody} /> : <DetailPanel detail={detail} timeline={timeline} actions={actions} />}
      </SheetContent>
    </Sheet>
  );
}

export function AdminOrdersWorkspace({ initialOrderId }: { initialOrderId?: string }) {
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [assignee, setAssignee] = useState("all");
  const [payment, setPayment] = useState<PaymentState | "all">("all");
  const [design, setDesign] = useState<DesignState | "all">("all");
  const [fulfillment, setFulfillment] = useState<FulfillmentState | "all">("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const [problems, setProblems] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"orderOperations"> | null | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<Id<"orderOperations"> | null>(null);
  const orders = usePaginatedQuery(api.adminOrders.list, {
    view,
    ...(deferredSearch.trim() ? { search: deferredSearch } : {}),
    ...(assignee !== "all" ? { assigneeId: assignee as Id<"users"> } : {}),
    ...(payment !== "all" ? { paymentState: payment } : {}),
    ...(design !== "all" ? { designState: design } : {}),
    ...(fulfillment !== "all" ? { fulfillmentState: fulfillment } : {}),
    ...(!deferredSearch.trim() ? { sort } : {}),
    ...(problems ? { problemsOnly: true } : {}),
  }, { initialNumItems: 20 });
  const admins = useQuery(api.adminTasks.listAdmins) ?? [];
  const initialOperationId = useQuery(api.adminOrders.getOperationIdForOrder, initialOrderId ? { orderId: initialOrderId } : "skip");
  const effectiveSelectedId = selectedId === undefined ? initialOperationId ?? null : selectedId;
  const selectedRaw = useQuery(api.adminOrders.getDetail, effectiveSelectedId ? { operationId: effectiveSelectedId } : "skip");
  const expandedRaw = useQuery(api.adminOrders.getDetail, expandedId && expandedId !== effectiveSelectedId ? { operationId: expandedId } : "skip");
  const timeline = usePaginatedQuery(api.adminOrders.listTimeline, effectiveSelectedId ? { operationId: effectiveSelectedId } : "skip", { initialNumItems: 30 });
  const selectedDetail = selectedRaw === undefined ? undefined : selectedRaw === null ? null : normalizeDetail(selectedRaw);
  const expandedDetail = expandedRaw === undefined || expandedRaw === null ? undefined : normalizeDetail(expandedRaw);
  const details: Record<string, DetailView | undefined> = {};
  if (effectiveSelectedId && selectedDetail) details[effectiveSelectedId] = selectedDetail;
  if (expandedId && expandedDetail) details[expandedId] = expandedDetail;
  const selectedRow = orders.results.find((row) => row.id === effectiveSelectedId) ?? (selectedDetail?.operation ?? null);
  const closeDetail = () => {
    const triggerId = effectiveSelectedId;
    setSelectedId(null);
    if (triggerId) requestAnimationFrame(() => {
      const candidates = document.querySelectorAll<HTMLElement>(`[data-order-detail-trigger="${triggerId}"]`);
      [...candidates].find((element) => element.offsetParent !== null)?.focus();
    });
  };

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <Header />
      <Filters view={view} search={search} assignee={assignee} admins={admins} payment={payment} design={design} fulfillment={fulfillment} sort={sort} problems={problems} onView={setView} onSearch={setSearch} onAssignee={setAssignee} onPayment={setPayment} onDesign={setDesign} onFulfillment={setFulfillment} onSort={setSort} onProblems={setProblems} />
      {orders.status === "LoadingFirstPage" ? <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel> : orders.results.length === 0 ? <AdminPanel><AdminEmptyState title={deferredSearch || assignee !== "all" || payment !== "all" || design !== "all" || fulfillment !== "all" || problems ? dict.noResultsTitle : dict.emptyTitle} body={deferredSearch || assignee !== "all" || payment !== "all" || design !== "all" || fulfillment !== "all" || problems ? dict.noResultsBody : dict.emptyBody} /></AdminPanel> : <OrdersList rows={orders.results} details={details} onSelect={setSelectedId} onExpand={setExpandedId} />}
      {orders.status === "CanLoadMore" || orders.status === "LoadingMore" ? <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={orders.status === "LoadingMore"} onClick={() => orders.loadMore(20)}>{dict.loadMore}</Button> : null}
      <OrdersSheet selected={selectedRow} detail={selectedDetail} timeline={timeline.results} onClose={closeDetail} actions={selectedRaw ? <LiveActions key={selectedRaw.operation._id} raw={selectedRaw} normalized={normalizeDetail(selectedRaw)} /> : undefined} />
    </div>
  );
}

function previewRow(index: number, overrides: Partial<OrderRow>): OrderRow {
  return {
    id: `preview-operation-${index}` as Id<"orderOperations">,
    orderId: `preview-order-${index}` as Id<"orders">,
    smpCode: `SMP-2026091${index}-A${index}B${index}C${index}`,
    accountId: `preview-account-${index}` as Id<"accounts">,
    accountName: ["Bistro Most", "Hotel Vrbak", "Kafić Piano", "Restoran Dunav"][index % 4],
    smkCode: `SMK-${["MOS", "VRB", "PIA", "DUN"][index % 4]}-00${index + 1}`,
    primaryBusinessName: ["Dorćol", "Centar", "Zemun", "Novi Beograd"][index % 4],
    primarySmlCode: `SML-00${index + 1}`,
    paymentState: "paid",
    designState: "approved",
    fulfillmentState: "ready_for_printer",
    view: "active",
    priority: "normal",
    assigneeId: `preview-admin-${index % 2 ? "jovan" : "teodora"}` as Id<"users">,
    assigneeName: index % 2 ? "Jovan" : "Teodora",
    requiredMinor: 240000,
    settledMinor: 240000,
    lineCount: 1,
    unitCount: 2,
    problemCount: 0,
    notePreview: overrides.problemCount ? dict.previewProblemNote : dict.previewStandardNote,
    provisioningReady: true,
    updatedAt: Date.parse(`2026-09-13T${String(index + 6).padStart(2, "0")}:20:00Z`),
    ...overrides,
  };
}

const previewRows: OrderRow[] = [
  previewRow(0, { paymentState: "awaiting_payment", designState: "in_progress", fulfillmentState: "awaiting_conditions", settledMinor: 120000, provisioningReady: false, priority: "high" }),
  previewRow(1, { designState: "awaiting_approval", fulfillmentState: "awaiting_conditions", provisioningReady: false }),
  previewRow(2, { fulfillmentState: "quality_control", problemCount: 1, priority: "urgent" }),
  previewRow(3, { fulfillmentState: "ready_for_delivery" }),
  previewRow(4, { accountName: "Bistro Most", smkCode: "SMK-MOS-001", fulfillmentState: "delivered", view: "completed" }),
];
const previewAdmins: AdminOption[] = [
  { id: "preview-admin-teodora" as Id<"users">, name: "Teodora", email: "teodora@example.invalid" },
  { id: "preview-admin-jovan" as Id<"users">, name: "Jovan", email: "jovan@example.invalid" },
];

function previewDetail(row: OrderRow): DetailView {
  const lineId = `preview-line-${row.id}` as Id<"orderLines">;
  const line = {
    id: lineId,
    productLabel: row.id.endsWith("2") ? adminDomainSr.products.stickers : adminDomainSr.products["two-piece-stand"],
    businessName: row.primaryBusinessName ?? dict.previewMultipleLocations,
    smlCode: row.primarySmlCode ?? "SML-000",
    quantity: row.unitCount,
    lineTotalMinor: row.requiredMinor,
    currency: "RSD" as const,
    designKind: row.designState === "template_selected" ? "template" as const : "custom" as const,
    designState: row.designState,
    designRevision: row.designState === "approved" ? 2 : 1,
    configSnapshot: row.id.endsWith("2")
      ? { productId: "stickers", quantity: row.unitCount, dimension: "medium", shape: "rectangle", design: { kind: "custom", brief: "" } }
      : { productId: "two-piece-stand", quantity: row.unitCount, dimension: "a6", orientation: "portrait", design: { kind: "custom", brief: "" } },
    approved: row.designState === "approved",
    smf: ["awaiting_conditions", "smf_assigned"].includes(row.fulfillmentState) ? 0 : row.unitCount,
    sent: ["at_printer", "received", "quality_control", "ready_for_delivery", "in_delivery", "delivered"].includes(row.fulfillmentState) ? row.unitCount : 0,
    received: ["received", "quality_control", "ready_for_delivery", "in_delivery", "delivered"].includes(row.fulfillmentState) ? row.unitCount : 0,
    qcPassed: ["ready_for_delivery", "in_delivery", "delivered"].includes(row.fulfillmentState) ? row.unitCount : 0,
    qcProblems: row.problemCount,
    delivered: row.fulfillmentState === "delivered" ? row.unitCount : 0,
  };
  return {
    operation: { ...row, reversedMinor: 0, createdByName: "Teodora", note: row.problemCount ? dict.previewProblemNote : dict.previewStandardNote },
    lines: [line],
    provisioningCount: row.provisioningReady ? 1 : 0,
    printJobs: [] as LiveDetail["printJobs"],
    printJobLines: [] as LiveDetail["printJobLines"],
    printerReceipts: [] as LiveDetail["printerReceipts"],
    qualityChecks: [] as LiveDetail["qualityChecks"],
    activationSignals: (row.fulfillmentState === "ready_for_delivery" || row.fulfillmentState === "delivered" ? [{ _id: `preview-signal-${row.id}`, state: "pending_admin_12" }] : []) as unknown as LiveDetail["activationSignals"],
    deliveries: [] as LiveDetail["deliveries"],
    deliveryLines: [] as LiveDetail["deliveryLines"],
    tasks: [] as LiveDetail["tasks"],
  };
}

export function AdminOrdersPreview() {
  const [rows, setRows] = useState(previewRows);
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [payment, setPayment] = useState<PaymentState | "all">("all");
  const [design, setDesign] = useState<DesignState | "all">("all");
  const [fulfillment, setFulfillment] = useState<FulfillmentState | "all">("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const [problems, setProblems] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"orderOperations"> | null>(null);
  const details = useMemo(() => Object.fromEntries(rows.map((row) => [row.id, previewDetail(row)])), [rows]);
  const visible = useMemo(() => {
    const filtered = rows.filter((row) => {
    if (row.view !== view) return false;
    if (assignee !== "all" && row.assigneeId !== assignee) return false;
    if (payment !== "all" && row.paymentState !== payment) return false;
    if (design !== "all" && row.designState !== design) return false;
    if (fulfillment !== "all" && row.fulfillmentState !== fulfillment) return false;
    if (problems && row.problemCount === 0) return false;
    const needle = search.trim().toLocaleLowerCase("sr-Latn-RS");
    return !needle || `${row.smpCode} ${row.accountName} ${row.smkCode} ${row.primaryBusinessName} ${row.primarySmlCode}`.toLocaleLowerCase("sr-Latn-RS").includes(needle);
    });
    return search.trim() ? filtered : [...filtered].sort((left, right) => sort === "updated_desc" ? right.updatedAt - left.updatedAt : left.updatedAt - right.updatedAt);
  }, [rows, view, search, assignee, payment, design, fulfillment, sort, problems]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const selectedDetail = selected ? details[selected.id] : undefined;
  const timeline = selected ? [
    { _id: `preview-event-${selected.id}-2`, kind: selected.fulfillmentState === "quality_control" ? "quality_control_recorded" : "design_approved", actorUserId: selected.assigneeId, toValue: selected.fulfillmentState === "quality_control" ? "problem" : "approved", reason: selected.problemCount ? dict.previewQcReason : undefined, createdAt: selected.updatedAt },
    { _id: `preview-event-${selected.id}-1`, kind: "migrated", actorUserId: selected.assigneeId, toValue: "migration_v1", createdAt: selected.updatedAt - 86_400_000 },
  ] : [];
  const closeDetail = () => {
    const triggerId = selectedId;
    setSelectedId(null);
    if (triggerId) requestAnimationFrame(() => {
      const candidates = document.querySelectorAll<HTMLElement>(`[data-order-detail-trigger="${triggerId}"]`);
      [...candidates].find((element) => element.offsetParent !== null)?.focus();
    });
  };
  const advancePreview = () => {
    if (!selected || selected.problemCount > 0) return;
    setRows((current) => current.map((row) => {
      if (row.id !== selected.id) return row;
      if (row.paymentState !== "paid") return { ...row, paymentState: "paid", settledMinor: row.requiredMinor, updatedAt: Date.now() };
      if (row.designState === "in_progress") return { ...row, designState: "awaiting_approval", updatedAt: Date.now() };
      if (row.designState === "awaiting_approval") return { ...row, designState: "approved", provisioningReady: true, updatedAt: Date.now() };
      if (row.fulfillmentState === "ready_for_delivery") return { ...row, fulfillmentState: "delivered", view: "completed", updatedAt: Date.now() };
      return row;
    }));
  };
  const canAdvance = Boolean(selected && selected.problemCount === 0 && (selected.paymentState !== "paid" || selected.designState === "in_progress" || selected.designState === "awaiting_approval" || selected.fulfillmentState === "ready_for_delivery"));
  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <Header preview />
      <Filters view={view} search={search} assignee={assignee} admins={previewAdmins} payment={payment} design={design} fulfillment={fulfillment} sort={sort} problems={problems} onView={setView} onSearch={setSearch} onAssignee={setAssignee} onPayment={setPayment} onDesign={setDesign} onFulfillment={setFulfillment} onSort={setSort} onProblems={setProblems} />
      {visible.length ? <OrdersList rows={visible} details={details} onSelect={setSelectedId} onExpand={() => undefined} /> : <AdminPanel><AdminEmptyState title={dict.noResultsTitle} body={dict.noResultsBody} /></AdminPanel>}
      <OrdersSheet selected={selected} detail={selectedDetail} timeline={timeline} onClose={closeDetail} actions={<div className="grid gap-3"><Button type="button" disabled={!canAdvance} onClick={advancePreview} className="min-h-11 justify-self-start" title={dict.previewApplyAction}>{selected ? nextStep(selected) : dict.blockedAction}</Button><Button type="button" variant="outline" disabled className="min-h-11 justify-self-start">{dict.blockedAction}</Button><p className="text-xs text-[var(--admin-text-muted)]">{dict.previewDescription}</p></div>} />
    </div>
  );
}

export class AdminOrdersErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} onRetry={() => window.location.reload()} /></AdminPanel>;
    return this.props.children;
  }
}
