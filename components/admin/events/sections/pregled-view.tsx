"use client";

import type { CatalogView } from "@/components/admin/admin-events";
import { AdminEmptyState, AdminPanel } from "@/components/admin/admin-primitives";
import { AdminDataCard, AdminDataView, type AdminColumn } from "@/components/admin/admin-ui";
import { EntryStatus, SegmentStatus, Section } from "@/components/admin/events/event-ui";
import { EventModelsTable } from "@/components/admin/events/sections/modeli-view";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A2 — `pregled`: until A10 builds the dashboard, the B1 overview
// (days, participations, stands, models) on its own route.

type ParticipationRow = CatalogView["participations"][number];
type StandRow = CatalogView["stands"][number];

const participationColumns: AdminColumn<ParticipationRow>[] = [
  { id: "exhibitor", header: dict.colExhibitor, rowHeader: true, sortValue: (row) => row.exhibitorName, cell: (row) => <strong className="font-semibold">{row.exhibitorName}</strong> },
  { id: "codes", header: dict.colCodes, cell: (row) => <span className="font-mono text-xs">{row.codes}</span> },
  { id: "key", header: dict.fieldExternalKey, hideBelow: "xl", cell: (row) => <span className="font-mono text-xs">{row.externalKey}</span> },
  { id: "segment", header: dict.colSegment, sortValue: (row) => dict.segments[row.segment], cell: (row) => <SegmentStatus segment={row.segment} /> },
  { id: "status", header: dict.colStatus, sortValue: (row) => dict.entryStatus[row.status], cell: (row) => <EntryStatus status={row.status} /> },
];

const standColumns: AdminColumn<StandRow>[] = [
  { id: "stand", header: dict.colStand, rowHeader: true, sortValue: (row) => row.code, cell: (row) => <strong className="font-semibold">{row.displayName} · {row.code}</strong> },
  { id: "exhibitor", header: dict.colExhibitor, sortValue: (row) => row.exhibitorName, cell: (row) => row.exhibitorName },
  { id: "location", header: dict.colMapLocation, cell: (row) => <span className="font-mono text-xs">{row.mapLocationId}</span> },
  { id: "status", header: dict.colStatus, sortValue: (row) => dict.entryStatus[row.status], cell: (row) => <EntryStatus status={row.status} /> },
];

export function EventOverviewView({ catalog, modelHref }: { catalog: CatalogView; modelHref: (modelId: string) => string }) {
  return (
    <div className="grid min-w-0 gap-5">
      <Section title={dict.daysTitle}>
        {catalog.days.length ? (
          <ul className="flex flex-wrap gap-2">
            {catalog.days.map((day) => <li key={day.dateKey} className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-3 py-1.5 text-sm"><strong>{day.label}</strong> <span className="font-mono text-xs text-[var(--admin-text-muted)]">{day.dateKey}</span></li>)}
          </ul>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.noDays}</p>}
      </Section>
      {catalog.participations.length || catalog.models.length ? (
        <>
          <Section title={dict.participationsTitle}>
            <AdminDataView
              listKey="dogadjaji.pregled.ucesca"
              caption={dict.participationsTitle}
              rows={catalog.participations}
              getRowId={(row) => row.id}
              columns={participationColumns}
              renderCard={(row) => <AdminDataCard title={row.exhibitorName} subtitle={<>{row.codes} · <span className="font-mono">{row.externalKey}</span></>} badges={<><SegmentStatus segment={row.segment} /><EntryStatus status={row.status} /></>} />}
            />
          </Section>
          <Section title={dict.standsTitle}>
            <AdminDataView
              listKey="dogadjaji.pregled.standovi"
              caption={dict.standsTitle}
              rows={catalog.stands}
              getRowId={(row) => row.id}
              columns={standColumns}
              renderCard={(row) => <AdminDataCard title={`${row.displayName} · ${row.code}`} subtitle={row.exhibitorName} badges={<EntryStatus status={row.status} />} fields={[{ label: dict.colMapLocation, value: <span className="font-mono">{row.mapLocationId}</span> }]} />}
            />
          </Section>
          <Section title={dict.modelsTitle}>
            <EventModelsTable listKey="dogadjaji.pregled.modeli" models={catalog.models} modelHref={modelHref} />
          </Section>
        </>
      ) : <AdminPanel><AdminEmptyState title={dict.emptyCatalogTitle} body={dict.emptyCatalogBody} /></AdminPanel>}
    </div>
  );
}
