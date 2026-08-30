"use client";

// TASK-18 STEP 2 — the admin Memories console. Replaces the app/admin/memories
// AdminPlaceholder with the real screen: two provisioning channels (grant a
// venue subscription; create a celebration), the spaces list across businesses
// AND celebrations, deactivation, and the partner referral ledger. It follows
// components/admin/venue-admin.tsx's conventions (AdminGuard + AdminShell, the
// card/border system) and is its own screen — it touches no other admin
// surface. Every string routes through the typed dictionary (memories-admin).

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ExternalLink,
  Handshake,
  LoaderCircle,
  PartyPopper,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PLAN_LIMITS } from "@/convex/lib/plans";
import { fmt } from "@/lib/i18n";
import { memoriesAdminSr as dict } from "@/lib/i18n/sr/memories-admin";
import { belgradeLocalToEpoch, formatBelgradeDate } from "@/lib/belgrade-time";
import { AdminGuard } from "./admin-guard";
import { AdminShell } from "./admin-shell";

const PLAN_KEYS = Object.keys(PLAN_LIMITS.scanme_memories);

const PLAN_LABEL: Record<string, string> = {
  basic: dict.planBasic,
  standard: dict.planStandard,
  premium: dict.planPremium,
};
function planLabel(key: string | null) {
  return key ? (PLAN_LABEL[key] ?? key) : "—";
}

const CELEBRATION_KINDS = [
  "svadba",
  "rodjendan",
  "krstenje",
  "veridba",
  "ispracaj",
  "maturska",
  "godisnjica",
  "other",
] as const;
const CELEBRATION_KIND_LABEL: Record<string, string> = {
  svadba: dict.celebrationSvadba,
  rodjendan: dict.celebrationRodjendan,
  krstenje: dict.celebrationKrstenje,
  veridba: dict.celebrationVeridba,
  ispracaj: dict.celebrationIspracaj,
  maturska: dict.celebrationMaturska,
  godisnjica: dict.celebrationGodisnjica,
  other: dict.celebrationOther,
};

const CHANNELS = ["direct", "partner", "ads", "other"] as const;
const CHANNEL_LABEL: Record<string, string> = {
  direct: dict.channelDirect,
  partner: dict.channelPartner,
  ads: dict.channelAds,
  other: dict.channelOther,
};

const MODE_LABEL: Record<string, string> = {
  recurring: dict.modeRecurring,
  one_off: dict.modeOneOff,
};
const STATUS_LABEL: Record<string, string> = {
  active: dict.statusActive,
  paused: dict.statusPaused,
  closed: dict.statusClosed,
  archived: dict.statusArchived,
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

export function ScanMeMemoriesAdmin() {
  return (
    <AdminGuard>
      <AdminShell>
        <MemoriesWorkspace />
      </AdminShell>
    </AdminGuard>
  );
}

function MemoriesWorkspace() {
  return (
    <>
      <div className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {dict.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
          {dict.title}
        </h1>
      </div>

      <Tabs defaultValue="spaces" className="mt-6">
        <TabsList className="h-auto min-h-11">
          <TabsTrigger value="spaces" className="min-h-9 px-4">
            {dict.tabSpaces}
          </TabsTrigger>
          <TabsTrigger value="partners" className="min-h-9 px-4">
            {dict.tabPartners}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spaces" className="mt-6">
          <SpacesTab />
        </TabsContent>
        <TabsContent value="partners" className="mt-6">
          <PartnersTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ---------------------------------------------------------------------------
// Spaces tab: grant to a business, create a celebration, list every space.
// ---------------------------------------------------------------------------

function SpacesTab() {
  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <GrantCard />
        <CreateCelebrationCard />
      </div>
      <SpacesList />
    </div>
  );
}

function GrantCard() {
  const businesses = useQuery(api.memoriesAdmin.listGrantableBusinesses);
  const grant = useMutation(api.memoriesAdmin.grantMemories);
  const [businessId, setBusinessId] = useState<Id<"businesses"> | "">("");
  const [name, setName] = useState("");
  const [planKey, setPlanKey] = useState(PLAN_KEYS[0]);
  const [pending, setPending] = useState(false);

  const grantable = (businesses ?? []).filter((b) => !b.hasMemories);

  async function submit() {
    if (!businessId) return;
    setPending(true);
    try {
      const result = await grant({
        businessId,
        planKey,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      toast.success(
        result.created ? dict.grantSuccess : dict.grantSuccessExisting,
      );
      setBusinessId("");
      setName("");
    } catch (error) {
      toast.error(errorMessage(error, dict.grantError));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="min-w-0 border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <Sparkles className="size-4 text-primary" />
        {dict.grantHeading}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {dict.grantBody}
      </p>
      <div className="mt-5 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="grant-business">{dict.grantBusinessLabel}</Label>
          <Select
            value={businessId}
            onValueChange={(v) => setBusinessId(v as Id<"businesses">)}
          >
            <SelectTrigger id="grant-business" className="h-11">
              <SelectValue placeholder={dict.grantBusinessPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {grantable.length ? (
                grantable.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} · /{b.slug}
                  </SelectItem>
                ))
              ) : (
                <div className="px-2 py-3 text-sm text-muted-foreground">
                  {dict.grantNoBusinesses}
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="grant-name">{dict.grantNameLabel}</Label>
          <Input
            id="grant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">{dict.grantNameHint}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="grant-plan">{dict.grantPlanLabel}</Label>
          <Select value={planKey} onValueChange={setPlanKey}>
            <SelectTrigger id="grant-plan" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {planLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void submit()} disabled={pending || !businessId}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {dict.grantAction}
        </Button>
      </div>
    </section>
  );
}

function CreateCelebrationCard() {
  const partnerships = useQuery(api.memoriesAdmin.listPartnerships);
  const create = useMutation(api.memoriesAdmin.createCelebration);
  const [kind, setKind] = useState<(typeof CELEBRATION_KINDS)[number]>("svadba");
  const [title, setTitle] = useState("");
  const [celebrantNames, setCelebrantNames] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [venueName, setVenueName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("direct");
  const [partnerId, setPartnerId] = useState<Id<"businesses"> | "">("");
  const [planKey, setPlanKey] = useState(PLAN_KEYS[0]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const partners = partnerships ?? [];
  const selectedPartner = partners.find((p) => p.partnerBusinessId === partnerId);

  async function submit() {
    setError(null);
    const eventEpoch = belgradeLocalToEpoch(eventDate);
    if (!title.trim()) {
      setError(dict.celebrationTitleRequired);
      return;
    }
    if (!contactName.trim()) {
      setError(dict.celebrationContactRequired);
      return;
    }
    if (eventEpoch === null) {
      setError(dict.celebrationDateRequired);
      return;
    }
    const startEpoch = windowStart ? belgradeLocalToEpoch(windowStart) : null;
    const endEpoch = windowEnd ? belgradeLocalToEpoch(windowEnd) : null;
    setPending(true);
    try {
      const result = await create({
        kind,
        title: title.trim(),
        eventDate: eventEpoch,
        acquisitionChannel: channel,
        contactName: contactName.trim(),
        planKey,
        ...(celebrantNames.trim() ? { celebrantNames: celebrantNames.trim() } : {}),
        ...(venueName.trim() ? { venueName: venueName.trim() } : {}),
        ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
        ...(channel === "partner" && partnerId ? { referredByBusinessId: partnerId } : {}),
        ...(startEpoch !== null ? { windowStartAt: startEpoch } : {}),
        ...(endEpoch !== null ? { windowEndAt: endEpoch } : {}),
      });
      toast.success(fmt(dict.celebrationSuccess, { code: result.code }));
      setTitle("");
      setCelebrantNames("");
      setEventDate("");
      setWindowStart("");
      setWindowEnd("");
      setVenueName("");
      setContactName("");
      setContactPhone("");
      setContactEmail("");
      setPartnerId("");
    } catch (err) {
      setError(errorMessage(err, dict.celebrationError));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="min-w-0 border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <PartyPopper className="size-4 text-primary" />
        {dict.celebrationHeading}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {dict.celebrationBody}
      </p>
      <div className="mt-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cel-kind">{dict.celebrationKindLabel}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger id="cel-kind" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CELEBRATION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {CELEBRATION_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cel-plan">{dict.celebrationPlanLabel}</Label>
            <Select value={planKey} onValueChange={setPlanKey}>
              <SelectTrigger id="cel-plan" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {planLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cel-title">{dict.celebrationTitleLabel}</Label>
          <Input
            id="cel-title"
            value={title}
            placeholder={dict.celebrationTitlePlaceholder}
            onChange={(e) => setTitle(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cel-date">{dict.celebrationDateLabel}</Label>
          <Input
            id="cel-date"
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cel-wstart">
              {dict.celebrationWindowStartLabel}{" "}
              <span className="text-muted-foreground">{dict.optionalSuffix}</span>
            </Label>
            <Input
              id="cel-wstart"
              type="datetime-local"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cel-wend">
              {dict.celebrationWindowEndLabel}{" "}
              <span className="text-muted-foreground">{dict.optionalSuffix}</span>
            </Label>
            <Input
              id="cel-wend"
              type="datetime-local"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {dict.celebrationWindowHint} {dict.timezoneNote}
        </p>
        <div className="grid gap-2">
          <Label htmlFor="cel-contact">{dict.celebrationContactNameLabel}</Label>
          <Input
            id="cel-contact"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cel-phone">
              {dict.celebrationContactPhoneLabel}{" "}
              <span className="text-muted-foreground">{dict.optionalSuffix}</span>
            </Label>
            <Input
              id="cel-phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cel-email">
              {dict.celebrationContactEmailLabel}{" "}
              <span className="text-muted-foreground">{dict.optionalSuffix}</span>
            </Label>
            <Input
              id="cel-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cel-venue">
            {dict.celebrationVenueNameLabel}{" "}
            <span className="text-muted-foreground">{dict.optionalSuffix}</span>
          </Label>
          <Input
            id="cel-venue"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cel-channel">{dict.celebrationChannelLabel}</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
            <SelectTrigger id="cel-channel" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {channel === "partner" ? (
          <div className="grid gap-2">
            <Label htmlFor="cel-partner">{dict.celebrationPartnerLabel}</Label>
            <Select
              value={partnerId}
              onValueChange={(v) => setPartnerId(v as Id<"businesses">)}
            >
              <SelectTrigger id="cel-partner" className="h-11">
                <SelectValue placeholder={dict.celebrationPartnerPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {partners.length ? (
                  partners.map((p) => (
                    <SelectItem key={p.partnerBusinessId} value={p.partnerBusinessId}>
                      {p.name} · {fmt(dict.celebrationCommissionPreview, {
                        percent: p.commissionPercent,
                      })}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    {dict.celebrationPartnerNone}
                  </div>
                )}
              </SelectContent>
            </Select>
            {selectedPartner ? (
              <p className="text-xs text-muted-foreground">
                {fmt(dict.celebrationCommissionPreview, {
                  percent: selectedPartner.commissionPercent,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm leading-6 text-destructive">
            {error}
          </p>
        ) : null}
        <Button onClick={() => void submit()} disabled={pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <PartyPopper className="size-4" />
          )}
          {dict.celebrationCreateAction}
        </Button>
      </div>
    </section>
  );
}

type SpaceRow = FunctionReturnType<
  typeof api.memoriesAdmin.listMemoriesSpaces
>[number];

function SpacesList() {
  const spaces = useQuery(api.memoriesAdmin.listMemoriesSpaces);
  const rows = spaces ?? [];

  return (
    <section className="min-w-0 border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-semibold">{dict.spacesHeading}</h2>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {fmt(dict.spacesCount, { count: rows.length })}
        </span>
      </div>
      {spaces === undefined ? (
        <div className="h-28 animate-pulse bg-secondary" />
      ) : rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-4 py-3 font-semibold">{dict.colName}</th>
                <th className="px-4 py-3 font-semibold">{dict.colKind}</th>
                <th className="px-4 py-3 font-semibold">{dict.colMode}</th>
                <th className="px-4 py-3 font-semibold">{dict.colStatus}</th>
                <th className="px-4 py-3 font-semibold">{dict.colPlan}</th>
                <th className="px-4 py-3 font-semibold">{dict.colChannel}</th>
                <th className="px-4 py-3 font-semibold">{dict.colPartner}</th>
                <th className="px-4 py-3 font-semibold">{dict.colCommission}</th>
                <th className="px-4 py-3 font-semibold">{dict.colCode}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SpaceRowView key={row.spaceId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-sm text-muted-foreground">{dict.spacesEmpty}</div>
      )}
    </section>
  );
}

function SpaceRowView({ row }: { row: SpaceRow }) {
  const deactivate = useMutation(api.memoriesAdmin.deactivateMemories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function runDeactivate() {
    setPending(true);
    try {
      await deactivate({ businessId: row.businessId });
      setDialogOpen(false);
      toast.success(dict.deactivateSuccess);
    } catch (error) {
      toast.error(errorMessage(error, dict.deactivateError));
    } finally {
      setPending(false);
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0 align-top">
      <td className="px-4 py-3">
        <span className="font-medium">{row.name}</span>
        <span className="block text-xs text-muted-foreground">
          {row.tenantName}
          {!row.profileActive ? ` · ${dict.reactivateHint}` : ""}
        </span>
      </td>
      <td className="px-4 py-3">
        {row.tenantKind === "celebration"
          ? dict.tenantCelebration
          : dict.tenantBusiness}
      </td>
      <td className="px-4 py-3">{MODE_LABEL[row.mode]}</td>
      <td className="px-4 py-3">{STATUS_LABEL[row.status]}</td>
      <td className="px-4 py-3">{planLabel(row.planKey)}</td>
      <td className="px-4 py-3">
        {row.celebration
          ? CHANNEL_LABEL[row.celebration.acquisitionChannel]
          : "—"}
      </td>
      <td className="px-4 py-3">{row.celebration?.partnerName ?? "—"}</td>
      <td className="px-4 py-3">
        {row.celebration?.referralCommissionPercent != null
          ? `${row.celebration.referralCommissionPercent}%`
          : "—"}
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/m/${row.code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
        >
          {row.code}
          <ExternalLink className="size-3.5" />
        </Link>
      </td>
      <td className="px-4 py-3 text-right">
        {row.profileActive ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
            >
              {dict.deactivateAction}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{dict.deactivateDialogTitle}</DialogTitle>
                <DialogDescription className="leading-6">
                  {dict.deactivateDialogBody}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" disabled={pending}>
                    {dict.deactivateCancel}
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => void runDeactivate()}
                  disabled={pending}
                >
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  {dict.deactivateConfirm}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Partners tab: add a partnership, and the referral ledger per partner.
// ---------------------------------------------------------------------------

function PartnersTab() {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <AddPartnerCard />
      <PartnersList />
    </div>
  );
}

function AddPartnerCard() {
  const businesses = useQuery(api.memoriesAdmin.listGrantableBusinesses);
  const create = useMutation(api.memoriesAdmin.createPartnership);
  const [businessId, setBusinessId] = useState<Id<"businesses"> | "">("");
  const [commission, setCommission] = useState("10");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!businessId) return;
    const percent = Number(commission);
    setPending(true);
    try {
      await create({
        partnerBusinessId: businessId,
        commissionPercent: percent,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      toast.success(dict.addPartnerSuccess);
      setBusinessId("");
      setNotes("");
    } catch (error) {
      toast.error(errorMessage(error, dict.addPartnerError));
    } finally {
      setPending(false);
    }
  }

  const options = businesses ?? [];

  return (
    <section className="min-w-0 border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <Handshake className="size-4 text-primary" />
        {dict.addPartnerHeading}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {dict.addPartnerBody}
      </p>
      <div className="mt-5 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="partner-business">{dict.partnerBusinessLabel}</Label>
          <Select
            value={businessId}
            onValueChange={(v) => setBusinessId(v as Id<"businesses">)}
          >
            <SelectTrigger id="partner-business" className="h-11">
              <SelectValue placeholder={dict.partnerBusinessPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} · /{b.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="partner-commission">
            {dict.partnerCommissionLabel}
          </Label>
          <Input
            id="partner-commission"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="partner-notes">
            {dict.partnerNotesLabel}{" "}
            <span className="text-muted-foreground">{dict.optionalSuffix}</span>
          </Label>
          <Input
            id="partner-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-11"
          />
        </div>
        <Button onClick={() => void submit()} disabled={pending || !businessId}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Handshake className="size-4" />
          )}
          {dict.addPartnerAction}
        </Button>
      </div>
    </section>
  );
}

function PartnersList() {
  const partnerships = useQuery(api.memoriesAdmin.listPartnerships);
  const rows = partnerships ?? [];

  return (
    <section className="min-w-0 border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-semibold">{dict.partnersHeading}</h2>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {fmt(dict.partnersCount, { count: rows.length })}
        </span>
      </div>
      {partnerships === undefined ? (
        <div className="h-28 animate-pulse bg-secondary" />
      ) : rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((partner) => (
            <li key={partner.partnershipId} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{partner.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {fmt(dict.partnerTermsLabel, {
                    percent: partner.commissionPercent,
                    date: formatBelgradeDate(partner.startedAt),
                  })}
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <span>{dict.partnerReferralsHeading}</span>
                  <span>
                    {dict.partnerOwedLabel}: {partner.owedCount}
                  </span>
                </div>
                {partner.referrals.length ? (
                  <ul className="mt-2 divide-y divide-border border-y border-border">
                    {partner.referrals.map((ref) => (
                      <li
                        key={ref.celebrationId}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{ref.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatBelgradeDate(ref.eventDate)} ·{" "}
                            {STATUS_LABEL[ref.status] ?? ref.status}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold">
                          {ref.commissionPercent != null
                            ? `${ref.commissionPercent}%`
                            : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {dict.partnerReferralsEmpty}
                  </p>
                )}
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {dict.referralSnapshotNote}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-6 text-sm text-muted-foreground">
          {dict.partnersEmpty}
        </div>
      )}
    </section>
  );
}
