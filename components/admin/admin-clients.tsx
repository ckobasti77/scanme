"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ExternalLink,
  Link2,
  Mail,
  MoreHorizontal,
  Phone,
  Search,
  ShieldAlert,
  Star,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Component,
  useDeferredValue,
  useState,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";
import { adminSearchSr } from "@/lib/i18n/sr/admin-search";
import { cn } from "@/lib/utils";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel, AdminTable } from "./admin-primitives";
import { AdminTooltip } from "./admin-tooltip";

type ClientRow = FunctionReturnType<typeof api.adminReadModels.listClients>["page"][number];
type VenueServiceRow = FunctionReturnType<typeof api.adminReadModels.clientVenueServices>["page"][number];
type ServiceKey = keyof ClientRow["serviceSummaries"];
type ServiceState = NonNullable<ClientRow["serviceSummaries"][ServiceKey]["worst"]>;
type Sort = "urgency" | "name" | "recent";
type Status = "all" | "active" | "archived";

const SERVICE_META: Record<
  ServiceKey,
  { label: string; icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> }
> = {
  scanme_links: { label: dict.clientsServiceLinks, icon: Link2 },
  google_review: { label: dict.clientsServiceReview, icon: Star },
  scanme_menu: { label: dict.clientsServiceMenu, icon: UtensilsCrossed },
};

const SERVICE_KEYS = Object.keys(SERVICE_META) as ServiceKey[];

const STATE_LABEL: Record<ServiceState, string> = {
  active: dict.clientsServiceActive,
  warning: dict.clientsServiceWarning,
  grace: dict.clientsServiceGrace,
  suspended: dict.clientsServiceSuspended,
  inactive: dict.clientsServiceInactive,
  problem: dict.clientsServiceProblem,
};

const STATE_CLASS: Record<ServiceState, string> = {
  active: "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
  warning: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  grace: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  suspended: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
  inactive: "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]",
  problem: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
};

function serviceSummaryText(summary: ClientRow["serviceSummaries"][ServiceKey]) {
  if (summary.total === 0) return dict.clientsServiceAbsent;
  const parts: string[] = [];
  for (const state of ["active", "grace", "warning", "suspended", "inactive", "problem"] as const) {
    if (summary[state] > 0) parts.push(`${summary[state]} ${STATE_LABEL[state]}`);
  }
  return parts.join(" / ");
}

function signalLabel(signal: ClientRow["signal"]) {
  if (signal.severity === "blocking") return dict.clientsSignalBlocking;
  if (signal.severity === "warning") return dict.clientsSignalWarning;
  if (signal.severity === "information") return dict.clientsSignalInformation;
  return dict.clientsSignalNone;
}

function activityLabel(signal: ClientRow["signal"]) {
  if (signal.severity === "blocking") return dict.clientsActivityBlocking;
  if (signal.severity === "warning") return dict.clientsActivityWarning;
  if (signal.severity === "information") return dict.clientsActivityInformation;
  return dict.clientsActivityNone;
}

function Signal({ signal }: { signal: ClientRow["signal"] }) {
  const label = signalLabel(signal);
  return (
    <AdminTooltip label={label}>
      <span
        role="img"
        aria-label={label}
        className={cn(
          "block size-2.5 rounded-full border border-current/20",
          signal.severity === "blocking" && "bg-[var(--admin-danger)] text-[var(--admin-danger)]",
          signal.severity === "warning" && "bg-[var(--admin-warning)] text-[var(--admin-warning)]",
          signal.severity === "information" && "bg-[var(--admin-text-muted)] text-[var(--admin-text-muted)]",
          signal.severity === null && "bg-transparent text-[var(--admin-text-muted)]",
        )}
      />
    </AdminTooltip>
  );
}

function Identity({ row }: { row: ClientRow }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/admin/klijenti/${row.accountId}`}
        title={row.ownerDisplayName}
        className="block w-fit max-w-full truncate font-semibold tracking-[-0.015em] underline-offset-4 hover:underline"
      >
        {row.ownerDisplayName}
      </Link>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <span className="font-mono text-[0.69rem] text-[var(--admin-text-muted)]">{row.smkCode}</span>
        {row.premiumStatus ? (
          <span
            data-premium={row.premiumStatus}
            className={cn(
              "inline-flex min-h-5 shrink-0 items-center rounded-full border px-1.5 text-[0.625rem] font-bold tracking-[0.04em] uppercase",
              row.premiumStatus === "active"
                ? "border-[var(--admin-success-border)] bg-[var(--admin-accent)] text-[var(--admin-accent-ink)]"
                : "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
            )}
          >
            {row.premiumStatus === "active" ? dict.clientsPremiumActive : dict.clientsPremiumGrace}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Contact({ row }: { row: ClientRow }) {
  if (!row.defaultContactEmail && !row.defaultContactPhone) {
    return <span className="text-xs text-[var(--admin-text-muted)]">{dict.clientsContactMissing}</span>;
  }
  return (
    <div className="grid min-w-0 gap-1 text-xs">
      {row.defaultContactEmail ? (
        <a href={`mailto:${row.defaultContactEmail}`} className="flex min-w-0 items-center gap-1.5 hover:underline" aria-label={`${dict.clientsEmailLabel}: ${row.defaultContactEmail}`}>
          <Mail className="size-3.5 shrink-0 text-[var(--admin-text-muted)]" aria-hidden="true" />
          <span className="truncate">{row.defaultContactEmail}</span>
        </a>
      ) : null}
      {row.defaultContactPhone ? (
        <a href={`tel:${row.defaultContactPhone}`} className="flex min-w-0 items-center gap-1.5 hover:underline" aria-label={`${dict.clientsPhoneLabel}: ${row.defaultContactPhone}`}>
          <Phone className="size-3.5 shrink-0 text-[var(--admin-text-muted)]" aria-hidden="true" />
          <span>{row.defaultContactPhone}</span>
        </a>
      ) : null}
    </div>
  );
}

function Venues({ row }: { row: ClientRow }) {
  return (
    <div className="min-w-0 text-sm">
      <span className="block truncate">{row.firstVenueName ?? "—"}</span>
      {row.venueCount > 1 ? (
        <span className="mt-0.5 block text-xs font-semibold text-[var(--admin-text-muted)]">
          {fmt(dict.clientsMoreVenues, { count: row.venueCount - 1 })}
        </span>
      ) : null}
    </div>
  );
}

function ServiceButtons({ row, expanded, onToggle }: { row: ClientRow; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {SERVICE_KEYS.map((key) => {
        const meta = SERVICE_META[key];
        const Icon = meta.icon;
        const summary = row.serviceSummaries[key];
        const description = `${meta.label}: ${serviceSummaryText(summary)}`;
        const state = summary.worst;
        return (
          <AdminTooltip key={key} label={description}>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={`${description}. ${fmt(expanded ? dict.clientsServiceCollapse : dict.clientsServiceExpand, { name: row.ownerDisplayName })}`}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl border transition-colors xl:size-9",
                state ? STATE_CLASS[state] : "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          </AdminTooltip>
        );
      })}
    </div>
  );
}

function Activity({ signal }: { signal: ClientRow["signal"] }) {
  const label = activityLabel(signal);
  return (
    <span className={cn("text-xs leading-5", signal.severity ? "text-[var(--admin-text)]" : "text-[var(--admin-text-muted)]")}>
      {label}
    </span>
  );
}

function Actions({ row }: { row: ClientRow }) {
  const router = useRouter();
  const startDebug = useMutation(api.adminSupport.start);
  const [starting, setStarting] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="grid size-11 place-items-center rounded-xl hover:bg-[var(--admin-surface-muted)] xl:size-10" aria-label={fmt(dict.clientsActions, { name: row.ownerDisplayName })}>
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="admin-v1 min-w-56 rounded-xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1.5 shadow-[var(--admin-shadow-md)]">
        <DropdownMenuItem asChild className="min-h-11 rounded-lg p-0 focus:bg-[var(--admin-surface-muted)]">
          <Link href={`/admin/klijenti/${row.accountId}`} className="flex w-full items-center gap-2 px-3">
            <UserRound className="size-4" aria-hidden="true" />
            {dict.clientsOpenProfile}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11 rounded-lg p-0 focus:bg-[var(--admin-surface-muted)]">
          <button
            type="button"
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              try {
                const result = await startDebug({ accountId: row.accountId });
                router.push(`/admin/debug/${result.contextId}`);
              } catch {
                toast.error(adminSearchSr.debugStartError);
              } finally {
                setStarting(false);
              }
            }}
            className="flex w-full items-center gap-2 px-3 text-left disabled:opacity-60"
          >
            <ShieldAlert className="size-4" aria-hidden="true" />
            {starting ? adminSearchSr.debugStarting : adminSearchSr.debugOpen}
          </button>
        </DropdownMenuItem>
        {row.firstVenueSlug ? (
          <DropdownMenuItem asChild className="min-h-11 rounded-lg p-0 focus:bg-[var(--admin-surface-muted)]">
            <Link href={`/${row.firstVenueSlug}/client-panel`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2 px-3">
              <ExternalLink className="size-4" aria-hidden="true" />
              {dict.clientsOpenPanel}
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className="min-h-11 rounded-lg px-3">
            <ExternalLink className="size-4" aria-hidden="true" />
            {dict.clientsPanelUnavailable}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function rowDoubleClick(
  event: MouseEvent<HTMLElement>,
  row: ClientRow,
  navigate: (href: string) => void,
) {
  if ((event.target as HTMLElement).closest("a,button,input,select,[role='menuitem']")) return;
  navigate(`/admin/klijenti/${row.accountId}`);
}

function StateBadge({ state }: { state: ServiceState | null }) {
  const label = state ? STATE_LABEL[state] : dict.clientsServiceAbsent;
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2 text-[0.68rem] font-semibold", state ? STATE_CLASS[state] : "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]")}>
      {label}
    </span>
  );
}

function ServiceDetailsTable({ rows, canLoadMore, loadingMore, onLoadMore }: { rows: VenueServiceRow[]; canLoadMore: boolean; loadingMore: boolean; onLoadMore: () => void }) {
  return (
    <div className="border-t border-[var(--admin-border)] bg-[var(--admin-surface-muted)]/55 px-3 py-3 sm:px-5">
      <h3 className="text-xs font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">{dict.clientsServiceDetailsTitle}</h3>
      <div className="mt-2 grid gap-2">
        {rows.map((venue) => (
          <div key={venue.businessId} className="grid min-w-0 gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 py-2.5 sm:grid-cols-[minmax(10rem,1fr)_repeat(3,minmax(7rem,auto))] sm:items-center">
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold">{venue.venueName}</span>
              <span className="font-mono text-[0.66rem] text-[var(--admin-text-muted)]">{venue.smlCode}</span>
            </div>
            {SERVICE_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between gap-2 sm:grid sm:justify-items-start">
                <span className="text-xs text-[var(--admin-text-muted)]">{SERVICE_META[key].label}</span>
                <StateBadge state={venue.services[key]} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {canLoadMore ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} className="mt-3 min-h-10 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-4 text-xs font-semibold">
          {loadingMore ? dict.clientsLoadingMore : dict.clientsLoadMore}
        </button>
      ) : null}
    </div>
  );
}

function LiveServiceDetails({ accountId }: { accountId: Id<"accounts"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.adminReadModels.clientVenueServices,
    { accountId },
    { initialNumItems: 12 },
  );
  if (status === "LoadingFirstPage") return <AdminLoadingState compact label={dict.loadingLabel} />;
  return <ServiceDetailsTable rows={results} canLoadMore={status === "CanLoadMore"} loadingMore={status === "LoadingMore"} onLoadMore={() => loadMore(12)} />;
}

function DesktopRow({ row, details }: { row: ClientRow; details?: VenueServiceRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  return (
    <>
      <tr onDoubleClick={(event) => rowDoubleClick(event, row, router.push)} className="border-b border-[var(--admin-border)] align-middle last:border-b-0 hover:bg-[var(--admin-surface-muted)]/45">
        <td className="w-10 px-3 py-3 text-center"><Signal signal={row.signal} /></td>
        <td className="min-w-40 px-3 py-3"><Identity row={row} /></td>
        <td className="min-w-44 max-w-56 px-3 py-3"><Contact row={row} /></td>
        <td className="min-w-32 max-w-44 px-3 py-3"><Venues row={row} /></td>
        <td className="px-3 py-3"><ServiceButtons row={row} expanded={expanded} onToggle={() => setExpanded((value) => !value)} /></td>
        <td className="min-w-36 max-w-52 px-3 py-3"><Activity signal={row.signal} /></td>
        <td className="w-14 px-2 py-2 text-right"><Actions row={row} /></td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={7} className="p-0">
            {details ? <ServiceDetailsTable rows={details} canLoadMore={false} loadingMore={false} onLoadMore={() => undefined} /> : <LiveServiceDetails accountId={row.accountId} />}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MobileCard({ row, details }: { row: ClientRow; details?: VenueServiceRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  return (
    <article onDoubleClick={(event) => rowDoubleClick(event, row, router.push)} className="min-w-0 overflow-hidden rounded-[var(--admin-radius-panel)] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--admin-shadow-xs)]">
      <div className="grid min-w-0 gap-4 p-4">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
          <span className="pt-2"><Signal signal={row.signal} /></span>
          <Identity row={row} />
          <Actions row={row} />
        </div>
        <div className="grid min-w-0 gap-3 border-t border-[var(--admin-border)] pt-3">
          <Contact row={row} />
          <Venues row={row} />
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 border-t border-[var(--admin-border)] pt-3">
          <ServiceButtons row={row} expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
          <Activity signal={row.signal} />
        </div>
      </div>
      {expanded ? (details ? <ServiceDetailsTable rows={details} canLoadMore={false} loadingMore={false} onLoadMore={() => undefined} /> : <LiveServiceDetails accountId={row.accountId} />) : null}
    </article>
  );
}

function ClientResults({ rows, detailsByAccount }: { rows: ClientRow[]; detailsByAccount?: Record<string, VenueServiceRow[]> }) {
  return (
    <>
      <div className="hidden xl:block">
        <AdminTable caption={dict.clientsTableCaption} tableClassName="table-fixed text-[0.82rem]">
          <colgroup>
            <col className="w-[3.5%]" /><col className="w-[17%]" /><col className="w-[22%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[22%]" /><col className="w-[5.5%]" />
          </colgroup>
          <thead className="bg-[var(--admin-surface-muted)] text-[0.67rem] font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">
            <tr>
              <th className="px-3 py-3 text-center" scope="col"><span className="sr-only">{dict.clientsColSignal}</span></th>
              <th className="px-3 py-3" scope="col">{dict.clientsColClient}</th>
              <th className="px-3 py-3" scope="col">{dict.clientsColContact}</th>
              <th className="px-3 py-3" scope="col">{dict.clientsColVenues}</th>
              <th className="px-3 py-3" scope="col">{dict.clientsColServices}</th>
              <th className="px-3 py-3" scope="col">{dict.clientsColActivity}</th>
              <th className="px-2 py-3 text-right" scope="col"><span className="sr-only">{dict.clientsColActions}</span></th>
            </tr>
          </thead>
          <tbody>{rows.map((row) => <DesktopRow key={row.accountId} row={row} details={detailsByAccount?.[row.accountId]} />)}</tbody>
        </AdminTable>
      </div>
      <div className="grid min-w-0 gap-3 xl:hidden">
        {rows.map((row) => <MobileCard key={row.accountId} row={row} details={detailsByAccount?.[row.accountId]} />)}
      </div>
    </>
  );
}

function Toolbar({ search, onSearch, status, onStatus, sort, onSort }: { search: string; onSearch: (value: string) => void; status: Status; onStatus: (value: Status) => void; sort: Sort; onSort: (value: Sort) => void }) {
  const selectClass = "min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold";
  return (
    <div className="grid min-w-0 gap-2 border-b border-[var(--admin-border)] p-3 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:p-4">
      <label className="relative min-w-0">
        <span className="sr-only">{dict.clientsSearchLabel}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
        <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={dict.clientsSearchPlaceholder} className="min-h-11 rounded-xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pl-9" />
      </label>
      <label className="grid">
        <span className="sr-only">{dict.clientsStatusLabel}</span>
        <select value={status} onChange={(event) => onStatus(event.target.value as Status)} className={selectClass}>
          <option value="all">{dict.clientsStatusAll}</option><option value="active">{dict.clientsStatusActive}</option><option value="archived">{dict.clientsStatusArchived}</option>
        </select>
      </label>
      <label className="grid">
        <span className="sr-only">{dict.clientsSortLabel}</span>
        <select value={sort} onChange={(event) => onSort(event.target.value as Sort)} className={selectClass}>
          <option value="urgency">{dict.clientsSortUrgency}</option><option value="name">{dict.clientsSortName}</option><option value="recent">{dict.clientsSortRecent}</option>
        </select>
      </label>
    </div>
  );
}

export function AdminClientsWorkspace() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>("urgency");
  const deferredSearch = useDeferredValue(search.trim());
  const { results, status, loadMore } = usePaginatedQuery(
    api.adminReadModels.listClients,
    { search: deferredSearch || undefined, status: statusFilter, sort },
    { initialNumItems: 20 },
  );
  const loadingFirst = status === "LoadingFirstPage";
  return (
    <div className="grid min-w-0 gap-5">
      <header>
        <h1 className="text-[clamp(2.2rem,4.5vw,4.4rem)] leading-none font-medium tracking-[-0.055em]">{dict.clientsTitle}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)] sm:text-base">{dict.clientsSubtitle}</p>
      </header>
      <AdminPanel className="min-w-0 overflow-hidden">
        <Toolbar search={search} onSearch={setSearch} status={statusFilter} onStatus={setStatusFilter} sort={sort} onSort={setSort} />
        {loadingFirst ? <AdminLoadingState /> : results.length === 0 ? <AdminEmptyState title={deferredSearch || statusFilter !== "all" ? dict.clientsNoResultsTitle : dict.clientsEmptyTitle} body={deferredSearch || statusFilter !== "all" ? dict.clientsNoResultsBody : dict.clientsEmptyBody} /> : <div className="min-w-0 p-3 sm:p-4"><ClientResults rows={results} /></div>}
        {status !== "LoadingFirstPage" && results.length > 0 && status !== "Exhausted" ? (
          <div className="border-t border-[var(--admin-border)] p-3 text-center">
            <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(20)} className="min-h-11 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 text-sm font-semibold hover:border-[var(--admin-ink)] disabled:opacity-60">
              {status === "LoadingMore" ? dict.clientsLoadingMore : dict.clientsLoadMore}
            </button>
          </div>
        ) : null}
      </AdminPanel>
    </div>
  );
}

export class AdminClientsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <AdminPanel className="overflow-hidden">
        <AdminErrorState title={dict.clientsErrorTitle} body={dict.clientsErrorBody} />
        <div className="border-t border-[var(--admin-border)] p-3 text-center">
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 text-sm font-semibold">{dict.clientsRetry}</button>
        </div>
      </AdminPanel>
    );
  }
}

export function AdminClientsPreview({ mode = "loaded" }: { mode?: "loaded" | "loading" | "empty" | "error" }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>("urgency");
  const filtered = FIXTURE_CLIENTS.filter((row) => !search || `${row.ownerDisplayName} ${row.smkCode} ${row.firstVenueName} ${row.defaultContactEmail} ${row.defaultContactPhone}`.toLocaleLowerCase("sr-Latn").includes(search.toLocaleLowerCase("sr-Latn")));
  return (
    <div className="grid min-w-0 gap-5">
      <header className="grid gap-2">
        <span className="w-fit rounded-full bg-[var(--admin-accent)] px-2.5 py-1 text-[0.68rem] font-bold text-[var(--admin-accent-ink)]">{dict.clientsFixtureBadge}</span>
        <h1 className="text-[clamp(2.2rem,4.5vw,4.4rem)] leading-none font-medium tracking-[-0.055em]">{dict.clientsTitle}</h1>
        <p className="text-sm text-[var(--admin-text-muted)]">{dict.clientsFixtureDescription}</p>
      </header>
      <AdminPanel className="min-w-0 overflow-hidden">
        <Toolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} sort={sort} onSort={setSort} />
        {mode === "loading" ? <AdminLoadingState /> : mode === "error" ? <><AdminErrorState title={dict.clientsErrorTitle} body={dict.clientsErrorBody} /><div className="border-t border-[var(--admin-border)] p-3 text-center"><button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 text-sm font-semibold">{dict.clientsRetry}</button></div></> : mode === "empty" || filtered.length === 0 ? <AdminEmptyState title={search ? dict.clientsNoResultsTitle : dict.clientsEmptyTitle} body={search ? dict.clientsNoResultsBody : dict.clientsEmptyBody} /> : <div className="min-w-0 p-3 sm:p-4"><ClientResults rows={filtered} detailsByAccount={FIXTURE_DETAILS} /></div>}
      </AdminPanel>
    </div>
  );
}

const FIXTURE_CLIENTS: ClientRow[] = [
  {
    accountId: "fixture-account-premium" as Id<"accounts">,
    smkCode: "SMK-ANA-014",
    accountName: "Ana Petrović Studio",
    ownerDisplayName: "Ana Petrović sa veoma dugim poslovnim imenom",
    defaultContactEmail: "ana@bistrozelen.rs",
    defaultContactPhone: "+381 64 123 45 67",
    firstVenueName: "Bistro Zelen",
    firstVenueSlug: "bistro-zelen",
    venueCount: 3,
    clientStatus: "active",
    signal: { severity: "warning", causeId: "fixture-warning" },
    premiumStatus: "grace",
    serviceSummaries: {
      scanme_links: { total: 3, active: 2, grace: 1, warning: 0, suspended: 0, inactive: 0, problem: 0, worst: "grace" },
      google_review: { total: 3, active: 3, grace: 0, warning: 0, suspended: 0, inactive: 0, problem: 0, worst: "active" },
      scanme_menu: { total: 2, active: 1, grace: 0, warning: 0, suspended: 0, inactive: 0, problem: 1, worst: "problem" },
    },
    updatedAt: Date.parse("2026-09-11T10:00:00Z"),
  },
  {
    accountId: "fixture-account-starter" as Id<"accounts">,
    smkCode: "SMK-ANA-027",
    accountName: "Ana Petrović PR",
    ownerDisplayName: "Ana Petrović",
    defaultContactEmail: "kontakt@malaterasa.rs",
    defaultContactPhone: "+381 63 555 80 11",
    firstVenueName: "Mala terasa",
    firstVenueSlug: "mala-terasa",
    venueCount: 1,
    clientStatus: "active",
    signal: { severity: null, causeId: null },
    premiumStatus: null,
    serviceSummaries: {
      scanme_links: { total: 1, active: 1, grace: 0, warning: 0, suspended: 0, inactive: 0, problem: 0, worst: "active" },
      google_review: { total: 0, active: 0, grace: 0, warning: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
      scanme_menu: { total: 1, active: 0, grace: 0, warning: 0, suspended: 0, inactive: 1, problem: 0, worst: "inactive" },
    },
    updatedAt: Date.parse("2026-09-10T10:00:00Z"),
  },
];

const FIXTURE_DETAILS: Record<string, VenueServiceRow[]> = {
  "fixture-account-premium": [
    { businessId: "fixture-venue-1" as Id<"businesses">, venueName: "Bistro Zelen", smlCode: "SML-BZE-001", services: { scanme_links: "active", google_review: "active", scanme_menu: "active" } },
    { businessId: "fixture-venue-2" as Id<"businesses">, venueName: "Bistro Zelen Dorćol", smlCode: "SML-BZE-002", services: { scanme_links: "active", google_review: "active", scanme_menu: "problem" } },
    { businessId: "fixture-venue-3" as Id<"businesses">, venueName: "Bistro Zelen Novi Beograd", smlCode: "SML-BZE-003", services: { scanme_links: "grace", google_review: "active", scanme_menu: null } },
  ],
};
