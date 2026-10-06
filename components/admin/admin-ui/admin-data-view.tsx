"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { createContext, Fragment, useContext, useState, type MouseEvent, type ReactNode } from "react";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/admin-primitives";
import { AdminViewToggle } from "@/components/admin/admin-ui/admin-view-toggle";
import { useAdminViewMode, useIsWideViewport } from "@/components/admin/admin-ui/use-admin-view-mode";
import { nextSortState, sortRows, type SortState, type SortValue } from "@/lib/admin-v1/table-sort";
import { resolveViewMode, type AdminViewMode } from "@/lib/admin-v1/view-mode";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A1 — every admin list shows the same `Tabela | Kartice` switch
// (right side of the bar above the list). Presentational only: rows, columns
// and the card renderer come from the screen; queries and mutations stay in
// the screen's container. Choice per list is remembered in localStorage
// (`scanme-admin-view:<listKey>`). Without a choice both views are rendered
// and CSS shows Tabela from the list's breakpoint and Kartice below it.

export type AdminDataViewContext = { view: AdminViewMode };

export type AdminColumn<T> = {
  id: string;
  header: string;
  /** Header text only for screen readers (icon columns). */
  headerHidden?: boolean;
  cell: (row: T, context: AdminDataViewContext) => ReactNode;
  /** Present ⇒ the column can be sorted by clicking its header. */
  sortValue?: (row: T) => SortValue;
  align?: "start" | "center" | "end";
  /** Secondary column hidden in a narrow table. */
  hideBelow?: "md" | "lg" | "xl";
  /** `<th scope="row">` — the cell that names the row. */
  rowHeader?: boolean;
  /** Header cell width (e.g. `17%` with `table-fixed`). */
  width?: string;
  className?: string;
};

export type AdminDataViewProps<T> = {
  /** localStorage key suffix, e.g. `klijenti.lista`. */
  listKey: string;
  /** sr-only table caption and label of the card list. */
  caption: string;
  /** undefined = loading. */
  rows: readonly T[] | undefined;
  getRowId: (row: T) => string;
  columns: readonly AdminColumn<T>[];
  renderCard: (row: T, context: AdminDataViewContext) => ReactNode;
  /** The same actions are rendered in the row and in the card. */
  rowActions?: (row: T, context: AdminDataViewContext) => ReactNode;
  actionsHeader?: string;
  /** Extra full-width content under a row / at the bottom of its card (expanded details). */
  rowDetail?: (row: T, context: AdminDataViewContext) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
  /** Kept from screens that open the detail on double click (row and card). */
  onRowDoubleClick?: (row: T, event: MouseEvent<HTMLElement>) => void;
  /** Without a saved choice: Tabela from this width (md 768 px, lg 1024 px). */
  autoBreakpoint?: "md" | "lg";
  /** Left side of the bar above the list (filters, counts). */
  toolbar?: ReactNode;
  /** Under the list (load more). */
  footer?: ReactNode;
  empty?: { title?: string; body?: string } | ReactNode;
  error?: { title?: string; body?: string; onRetry?: () => void } | null;
  loadingLabel?: string;
  /** Controlled view (URL `?prikaz=` from A2 on); wins over the saved choice. */
  view?: AdminViewMode | null;
  onViewChange?: (mode: AdminViewMode) => void;
  defaultSort?: SortState;
  /** Extra classes for `<table>`; the default min width (40rem) keeps a chosen Tabela readable on a phone — the wrapper scrolls, never the page. */
  tableClassName?: string;
  /** Extra classes for the card grid. */
  cardsClassName?: string;
  className?: string;
};

/** Dev previews force one view for every list below (`?prikaz=`). */
const ViewOverrideContext = createContext<AdminViewMode | null>(null);

export function AdminViewModeOverride({ value, children }: { value: AdminViewMode | null; children: ReactNode }) {
  return <ViewOverrideContext.Provider value={value}>{children}</ViewOverrideContext.Provider>;
}

const HIDE_BELOW = { md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" } as const;
const AUTO_TABLE = { md: "hidden md:block", lg: "hidden lg:block" } as const;
const AUTO_CARDS = { md: "md:hidden", lg: "lg:hidden" } as const;
const ALIGN = { start: "text-left", center: "text-center", end: "text-right" } as const;

function isStateProps(value: unknown): value is { title?: string; body?: string } {
  return typeof value === "object" && value !== null && !("$$typeof" in value) && !Array.isArray(value);
}

export function AdminDataView<T>(props: AdminDataViewProps<T>) {
  const {
    listKey,
    caption,
    rows,
    getRowId,
    columns,
    renderCard,
    rowActions,
    rowDetail,
    rowClassName,
    onRowDoubleClick,
    autoBreakpoint = "lg",
    toolbar,
    footer,
    empty,
    error,
    loadingLabel,
    view,
    onViewChange,
    defaultSort = null,
    tableClassName,
    cardsClassName,
    className,
  } = props;
  const override = useContext(ViewOverrideContext);
  const [stored, setStored] = useAdminViewMode(listKey);
  const wide = useIsWideViewport(autoBreakpoint);
  const [sort, setSort] = useState<SortState>(defaultSort);
  const mode = resolveViewMode(view ?? override, stored);
  const effective: AdminViewMode = mode === "auto" ? (wide ? "tabela" : "kartice") : mode;

  function changeView(next: AdminViewMode) {
    setStored(next);
    onViewChange?.(next);
  }

  const sortColumn = sort ? columns.find((column) => column.id === sort.columnId && column.sortValue) : undefined;
  const sorted = rows && sort && sortColumn?.sortValue ? sortRows(rows, sortColumn.sortValue, sort.direction) : rows;

  let body: ReactNode;
  if (error) {
    body = <AdminErrorState title={error.title} body={error.body} onRetry={error.onRetry} />;
  } else if (sorted === undefined) {
    body = <AdminLoadingState compact label={loadingLabel} />;
  } else if (!sorted.length) {
    body = isStateProps(empty) ? <AdminEmptyState title={empty.title} body={empty.body} className="min-h-40" /> : empty ?? <AdminEmptyState className="min-h-40" />;
  } else {
    const showTable = mode === "auto" || mode === "tabela";
    const showCards = mode === "auto" || mode === "kartice";
    body = (
      <>
        {showTable ? (
          <DataTable
            caption={caption}
            rows={sorted}
            getRowId={getRowId}
            columns={columns}
            rowActions={rowActions}
            actionsHeader={props.actionsHeader ?? dict.actionsColumn}
            rowDetail={rowDetail}
            rowClassName={rowClassName}
            onRowDoubleClick={onRowDoubleClick}
            sort={sort}
            onSort={(columnId) => setSort((current) => nextSortState(current, columnId))}
            className={mode === "auto" ? AUTO_TABLE[autoBreakpoint] : undefined}
            tableClassName={tableClassName}
          />
        ) : null}
        {showCards ? (
          <ul aria-label={caption} className={cn("grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3", mode === "auto" && AUTO_CARDS[autoBreakpoint], cardsClassName)}>
            {sorted.map((row) => {
              const context = { view: "kartice" } as const;
              const actions = rowActions?.(row, context);
              const detail = rowDetail?.(row, context);
              return (
                <li key={getRowId(row)} onDoubleClick={onRowDoubleClick ? (event) => onRowDoubleClick(row, event) : undefined} className={cn("flex min-w-0 flex-col gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4", rowClassName?.(row))}>
                  {renderCard(row, context)}
                  {actions ? <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 border-t border-[var(--admin-border)] pt-3">{actions}</div> : null}
                  {detail ? <div className="min-w-0">{detail}</div> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </>
    );
  }

  return (
    <div data-admin-primitive="data-view" data-view-mode={mode} className={cn("@container grid min-w-0 gap-3", className)}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <AdminViewToggle value={effective} onChange={changeView} />
      </div>
      {body}
      {footer}
    </div>
  );
}

function DataTable<T>({
  caption,
  rows,
  getRowId,
  columns,
  rowActions,
  actionsHeader,
  rowDetail,
  rowClassName,
  onRowDoubleClick,
  sort,
  onSort,
  className,
  tableClassName,
}: {
  caption: string;
  rows: readonly T[];
  getRowId: (row: T) => string;
  columns: readonly AdminColumn<T>[];
  rowActions?: (row: T, context: AdminDataViewContext) => ReactNode;
  actionsHeader: string;
  rowDetail?: (row: T, context: AdminDataViewContext) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
  onRowDoubleClick?: (row: T, event: MouseEvent<HTMLElement>) => void;
  sort: SortState;
  onSort: (columnId: string) => void;
  className?: string;
  tableClassName?: string;
}) {
  const context = { view: "tabela" } as const;
  const columnCount = columns.length + (rowActions ? 1 : 0);
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn(
        "max-w-full min-w-0 overflow-x-auto rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))] md:max-h-[70vh] md:overflow-y-auto",
        className,
      )}
    >
      <table className={cn("w-full min-w-[40rem] border-collapse text-left text-sm", tableClassName)}>
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-[1] bg-[var(--admin-surface-muted)] text-[0.67rem] font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">
          <tr>
            {columns.map((column) => {
              const sorted = sort?.columnId === column.id ? sort.direction : null;
              const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn("px-3 py-2.5 whitespace-nowrap", ALIGN[column.align ?? "start"], column.hideBelow && HIDE_BELOW[column.hideBelow])}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.id)}
                      aria-label={fmt(dict.sortBy, { column: column.header })}
                      className={cn("-mx-1 inline-flex min-h-7 items-center gap-1 rounded-md px-1 uppercase hover:text-[var(--admin-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]", sorted && "text-[var(--admin-text)]")}
                    >
                      {column.headerHidden ? <span className="sr-only">{column.header}</span> : column.header}
                      <Icon className={cn("size-3", !sorted && "opacity-50")} aria-hidden="true" />
                      {sorted ? <span className="sr-only">{sorted === "asc" ? dict.sortAscending : dict.sortDescending}</span> : null}
                    </button>
                  ) : column.headerHidden ? (
                    <span className="sr-only">{column.header}</span>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {rowActions ? (
              <th scope="col" className="px-3 py-2.5 text-right">
                <span className="sr-only">{actionsHeader}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            const detail = rowDetail?.(row, context);
            return (
              <Fragment key={id}>
                <tr onDoubleClick={onRowDoubleClick ? (event) => onRowDoubleClick(row, event) : undefined} className={cn("h-10 border-t border-[var(--admin-border)] align-middle", rowClassName?.(row))}>
                  {columns.map((column) => {
                    const Cell = column.rowHeader ? "th" : "td";
                    return (
                      <Cell
                        key={column.id}
                        scope={column.rowHeader ? "row" : undefined}
                        className={cn("min-w-0 px-3 py-2 font-normal break-words", ALIGN[column.align ?? "start"], column.hideBelow && HIDE_BELOW[column.hideBelow], column.className)}
                      >
                        {column.cell(row, context)}
                      </Cell>
                    );
                  })}
                  {rowActions ? (
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">{rowActions(row, context)}</div>
                    </td>
                  ) : null}
                </tr>
                {detail ? (
                  <tr className={rowClassName?.(row)}>
                    <td colSpan={columnCount} className="px-3 pb-3">
                      {detail}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
