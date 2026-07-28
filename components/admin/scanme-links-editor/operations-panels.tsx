"use client";

import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  MousePointerClick,
  RotateCcw,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { NativeSwitch, EditorPanel, PanelSection } from "./panel-primitives";

export type EditorMetricsRange = "7d" | "30d" | "90d" | "1y" | "all";

export type EditorMetrics = {
  totalScans: number;
  totalPageViews: number;
  totalConvertedSessions: number;
  ctr: number;
  range: EditorMetricsRange;
  rangeLabel: string;
  daily: Array<{ dateKey: string; label: string; count: number }>;
  destinations: Array<{
    id: Id<"serviceDestinations">;
    label: string;
    kind: string;
    state: string;
    totalClicks: number;
    totalDirectVisits: number;
  }>;
};

export function AnalyticsPanel({
  metrics,
  loading,
  range,
  onRangeChange,
  available,
}: {
  metrics: EditorMetrics | null | undefined;
  loading: boolean;
  range: EditorMetricsRange;
  onRangeChange: (range: EditorMetricsRange) => void;
  available: boolean;
}) {
  if (!available) {
    return (
      <EditorPanel
        title="Analitika"
        description="Pregledi i klikovi objavljene ScanMe Links stranice."
      >
        <div className="grid min-h-[360px] place-items-center text-center">
          <div className="max-w-[260px]">
            <BarChart3 className="mx-auto size-8 text-[var(--editor-muted)]" />
            <h2 className="mt-4 text-sm font-semibold">
              Analitika je dostupna administratoru
            </h2>
            <p className="mt-2 text-xs leading-5 text-[var(--editor-muted)]">
              Klijentski editor prikazuje sadržaj i dizajn, bez poslovnih
              metrika.
            </p>
          </div>
        </div>
      </EditorPanel>
    );
  }

  const maxCount = Math.max(1, ...(metrics?.daily.map((row) => row.count) ?? []));

  return (
    <EditorPanel
      title="Analitika"
      description="Pratite skeniranja, posete i klikove na objavljene linkove."
    >
      <Select
        value={range}
        onValueChange={(value) => onRangeChange(value as EditorMetricsRange)}
      >
        <SelectTrigger
          aria-label="Period analitike"
          className="h-11 rounded-xl border-[var(--editor-line)] bg-[var(--editor-surface-raised)]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="7d">Poslednjih 7 dana</SelectItem>
          <SelectItem value="30d">Poslednjih 30 dana</SelectItem>
          <SelectItem value="90d">Poslednja 3 meseca</SelectItem>
          <SelectItem value="1y">Poslednjih godinu dana</SelectItem>
          <SelectItem value="all">Oduvek</SelectItem>
        </SelectContent>
      </Select>

      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-3" aria-label="Učitavanje analitike">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl bg-black/[0.055]"
            />
          ))}
        </div>
      ) : metrics ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MetricCard
              icon={Eye}
              label="Pregledi"
              value={formatNumber(metrics.totalPageViews)}
            />
            <MetricCard
              icon={MousePointerClick}
              label="Klikovi"
              value={formatNumber(metrics.totalConvertedSessions)}
            />
            <MetricCard
              icon={Link2}
              label="Skeniranja"
              value={formatNumber(metrics.totalScans)}
            />
            <MetricCard
              icon={Users}
              label="CTR"
              value={`${(metrics.ctr * 100).toFixed(1)}%`}
            />
          </div>

          <PanelSection
            title={metrics.rangeLabel}
            description="Aktivnost po periodu."
            className="mt-6"
          >
            {metrics.daily.length ? (
              <div className="flex h-40 items-end gap-1.5 rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] p-4">
                {metrics.daily.slice(-30).map((row) => (
                  <div
                    key={row.dateKey}
                    className="group relative flex h-full min-w-0 flex-1 items-end"
                    title={`${row.label}: ${row.count}`}
                  >
                    <span
                      className="w-full min-w-1 rounded-t-sm bg-[var(--editor-lime)] transition-[height]"
                      style={{
                        height: `${Math.max(5, (row.count / maxCount) * 100)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--editor-line-strong)] px-4 py-8 text-center text-xs text-[var(--editor-muted)]">
                Još nema aktivnosti u izabranom periodu.
              </div>
            )}
          </PanelSection>

          <PanelSection title="Linkovi">
            {metrics.destinations.length ? (
              <div className="grid gap-2">
                {metrics.destinations.map((destination) => (
                  <div
                    key={destination.id}
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] px-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {destination.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-[var(--editor-muted)]">
                      {formatNumber(destination.totalClicks)} klikova
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--editor-muted)]">
                Objavite linkove da biste pratili rezultate.
              </p>
            )}
          </PanelSection>
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--editor-line-strong)] px-5 py-8 text-center">
          <BarChart3 className="mx-auto size-7 text-[var(--editor-muted)]" />
          <p className="mt-3 text-xs text-[var(--editor-muted)]">
            Analitika će se pojaviti nakon prvih poseta.
          </p>
        </div>
      )}
    </EditorPanel>
  );
}

export function SettingsPanel({
  publicHref,
  serviceActive,
  clientEditingEnabled,
  isAdmin,
  hasUnpublishedChanges,
  updating,
  onServiceActiveChange,
  onClientEditingChange,
  onDiscard,
}: {
  publicHref: string;
  serviceActive: boolean;
  clientEditingEnabled: boolean;
  isAdmin: boolean;
  hasUnpublishedChanges: boolean;
  updating: boolean;
  onServiceActiveChange: (active: boolean) => void;
  onClientEditingChange: (enabled: boolean) => void;
  onDiscard: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPublicUrl() {
    const url = new URL(publicHref, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast.success("Javna adresa je kopirana.");
    } catch {
      toast.error("Adresa nije kopirana.");
    }
  }

  return (
    <EditorPanel
      title="Podešavanja"
      description="Upravljajte objavljenom stranicom i pristupom editoru."
    >
      <PanelSection
        title="Javna adresa"
        description="Ova adresa i odštampani QR kod nastavljaju da rade posle promene naziva."
      >
        <div className="rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] p-3">
          <p className="truncate text-[10px] text-[var(--editor-muted)]">
            {publicHref}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyPublicUrl()}
              className="h-10 rounded-xl"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Kopirano" : "Kopiraj"}
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-xl"
            >
              <Link href={publicHref} target="_blank">
                <ExternalLink className="size-4" />
                Otvori
              </Link>
            </Button>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Status stranice">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold">Aktivna javna stranica</p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--editor-muted)]">
              Neaktivna stranica ne može da prima nova skeniranja.
            </p>
          </div>
          <NativeSwitch
            checked={serviceActive}
            disabled={!isAdmin || updating}
            onCheckedChange={onServiceActiveChange}
            label="Aktivna javna stranica"
          />
        </div>
      </PanelSection>

      <PanelSection title="Pristup klijenta">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold">Dozvoli uređivanje klijentu</p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--editor-muted)]">
              Klijent koristi isti editor, uz serverski proverene dozvole.
            </p>
          </div>
          <NativeSwitch
            checked={clientEditingEnabled}
            disabled={!isAdmin || updating}
            onCheckedChange={onClientEditingChange}
            label="Dozvoli uređivanje klijentu"
          />
        </div>
      </PanelSection>

      <PanelSection
        title="Nacrt"
        description="Vratite poslednju objavljenu verziju i odbacite sve neobjavljene izmene."
      >
        <Button
          type="button"
          variant="outline"
          onClick={onDiscard}
          disabled={!hasUnpublishedChanges || updating}
          className="h-11 w-full rounded-xl text-[var(--editor-danger)]"
        >
          <RotateCcw className="size-4" />
          Odbaci izmene nacrta
        </Button>
      </PanelSection>

      {!isAdmin ? (
        <p className="mt-5 text-[10px] leading-4 text-[var(--editor-muted)]">
          Status servisa i pristup drugih korisnika menja ScanMe administrator.
        </p>
      ) : null}
    </EditorPanel>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] p-4">
      <Icon className="size-4 text-[var(--editor-muted)]" />
      <p className="mt-4 text-lg font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-[10px] text-[var(--editor-muted)]">{label}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("sr-Latn-RS").format(value);
}
