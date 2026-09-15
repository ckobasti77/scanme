"use client";

import { Component, type ReactNode, useDeferredValue, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  AdminQrSurface,
  type ChannelDetailMeta,
  type TechnicalChannelRow,
} from "@/components/admin/admin-qr";
import { AdminErrorState, AdminPanel } from "@/components/admin/admin-primitives";
import { getDict } from "@/lib/i18n";

const dict = getDict("admin-products");
const pageSize = 25;

type Filters = {
  search: string;
  binding: "all" | "digital" | "physical";
  kind: "all" | "qr" | "nfc";
  state: "all" | "active" | "inactive" | "problem";
};

function channelColor(row: { state: "active" | "inactive" | "problem"; health: "healthy" | "unverified" | "broken"; redirectEnabled: boolean }) {
  if (row.state === "problem" || row.health === "broken") return "red" as const;
  if (row.state !== "active" || row.health !== "healthy" || !row.redirectEnabled) return "orange" as const;
  return "green" as const;
}

function listText<Row>(rows: readonly Row[] | undefined, line: (row: Row) => string) {
  if (!rows) return dict.loading;
  if (!rows.length) return dict.noHistory;
  return rows.slice(0, 5).map(line).join("\n");
}

export function AdminQrWorkspace() {
  const [filters, setFilters] = useState<Filters>({ search: "", binding: "all", kind: "all", state: "all" });
  const [selected, setSelected] = useState<TechnicalChannelRow | null>(null);
  const search = useDeferredValue(filters.search);
  const channels = usePaginatedQuery(api.adminProductReads.listChannels, {
    ...(search.trim() ? { search } : {}),
    ...(filters.binding !== "all" ? { binding: filters.binding } : {}),
    ...(filters.kind !== "all" ? { kind: filters.kind } : {}),
    ...(filters.state !== "all" ? { state: filters.state } : {}),
    direction: "desc",
  }, { initialNumItems: pageSize });
  const detail = useQuery(api.adminProductReads.getChannelDetail, selected ? { channelId: selected.id as Id<"accessChannels"> } : "skip");
  const destinations = usePaginatedQuery(api.adminProductReads.destinationHistory, detail ? {
    accountId: detail.channel.accountId,
    businessId: detail.channel.businessId,
    subjectId: detail.subject._id,
  } : "skip", { initialNumItems: 5 });
  const history = usePaginatedQuery(api.adminProductReads.channelHistory, detail ? {
    accountId: detail.channel.accountId,
    businessId: detail.channel.businessId,
    channelId: detail.channel._id,
  } : "skip", { initialNumItems: 5 });
  const scans = usePaginatedQuery(api.adminProductReads.dailyMetrics, detail ? {
    accountId: detail.channel.accountId,
    businessId: detail.channel.businessId,
    channelId: detail.channel._id,
  } : "skip", { initialNumItems: 5 });
  const rows: TechnicalChannelRow[] = channels.results.map((row) => ({
    id: row._id,
    accountId: row.accountId,
    businessId: row.businessId,
    resolverCode: row.resolverCode,
    smqCode: row.smqCode,
    smfCode: row.smfCode,
    accountName: row.accountName ?? dict.unknownValue,
    smkCode: row.smkCode ?? dict.unknownValue,
    venueName: row.venueName ?? dict.unknownValue,
    smlCode: row.smlCode ?? dict.unknownValue,
    city: row.city ?? null,
    binding: row.binding,
    kind: row.kind,
    color: channelColor(row),
    state: row.state,
    health: row.health,
    reason: row.problemReason ?? row.manualProblem ?? null,
    updatedAt: row.updatedAt,
  }));
  const detailMeta: ChannelDetailMeta | undefined = detail === undefined ? undefined : {
    destinationHistory: listText(destinations.status === "LoadingFirstPage" ? undefined : destinations.results, (row) => new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short", timeStyle: "short" }).format(row.createdAt)),
    channelHistory: listText(history.status === "LoadingFirstPage" ? undefined : history.results, (row) => new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short", timeStyle: "short" }).format(row.createdAt)),
    scanAttribution: listText(scans.status === "LoadingFirstPage" ? undefined : scans.results, (row) => `${row.dateKey} · ${row.scans}`),
  };
  return <AdminQrSurface
    channels={rows}
    status={channels.status === "LoadingFirstPage" ? "loading" : "ready"}
    canLoadMore={channels.status === "CanLoadMore" || channels.status === "LoadingMore"}
    loadingMore={channels.status === "LoadingMore"}
    onFiltersChange={setFilters}
    onChannelSelected={setSelected}
    onLoadMore={() => channels.loadMore(pageSize)}
    detailMeta={detailMeta}
  />;
}

export class AdminQrErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} /></AdminPanel>;
    return this.props.children;
  }
}
