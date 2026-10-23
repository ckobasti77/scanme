import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPanel,
  AdminStatus,
  AdminSummaryPill,
  AdminTable,
} from "./admin-primitives";
import { AdminShell } from "./admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export function AdminV1Preview() {
  return (
    <AdminShell
      previewIdentity={adminV1Sr.fixtureIdentity}
      activePathname="/admin"
    >
      <div className="grid gap-6">
        <header className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="inline-flex rounded-full bg-[var(--admin-accent)] px-3 py-1 text-xs font-bold text-[var(--admin-accent-ink)]">
              {adminV1Sr.fixtureBadge}
            </span>
            <h1 className="mt-4 text-[clamp(2.4rem,5vw,4.8rem)] leading-none font-medium tracking-[-0.06em]">
              {adminV1Sr.fixtureTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)] sm:text-base">
              {adminV1Sr.fixtureDescription}
            </p>
          </div>
          <AdminSummaryPill products={12} qr={9} nfc={4} problems={1} />
        </header>

        <AdminPanel className="overflow-hidden">
          <div className="border-b border-[var(--admin-border)] px-5 py-4">
            <h2 className="text-lg font-semibold tracking-[-0.025em]">
              {adminV1Sr.fixturePanelStates}
            </h2>
          </div>
          <div className="grid divide-y divide-[var(--admin-border)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <AdminLoadingState compact />
            <AdminEmptyState className="min-h-52" />
            <AdminErrorState className="min-h-52" />
          </div>
        </AdminPanel>

        <AdminTable caption={adminV1Sr.fixtureTableTitle}>
          <thead className="bg-[var(--admin-surface-muted)] text-xs font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">
            <tr>
              <th className="px-4 py-3" scope="col">
                {adminV1Sr.fixtureTableColumnState}
              </th>
              <th className="px-4 py-3" scope="col">
                {adminV1Sr.fixtureTableColumnPurpose}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--admin-border)]">
            <tr>
              <td className="px-4 py-3"><AdminStatus tone="active" label={adminV1Sr.statusActive} /></td>
              <td className="px-4 py-3">{adminV1Sr.fixtureTableActivePurpose}</td>
            </tr>
            <tr>
              <td className="px-4 py-3"><AdminStatus tone="waiting" label={adminV1Sr.statusWaiting} /></td>
              <td className="px-4 py-3">{adminV1Sr.fixtureTableWaitingPurpose}</td>
            </tr>
            <tr>
              <td className="px-4 py-3"><AdminStatus tone="problem" label={adminV1Sr.statusProblem} /></td>
              <td className="px-4 py-3">{adminV1Sr.fixtureTableProblemPurpose}</td>
            </tr>
          </tbody>
        </AdminTable>
      </div>
    </AdminShell>
  );
}
