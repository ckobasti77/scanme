"use client";

// TASK-72 — the admin console for printed cards. Builds on already-shipped Convex
// functions: it lists a business's cards (convex/cardsAdmin.listBusinessCards),
// and creates / batch-creates / retargets / disables them through the audited
// requireAdmin mutations in convex/cardsAdmin.ts. It adds NO enforcement and
// duplicates NO server validation — every refusal (Links→Memories, unsafe URL,
// splitter bounds, cross-tenant, …) surfaces verbatim as its Serbian ConvexError
// sentence through `errorMessage`. Every string routes through the typed
// `cards-admin` dictionary.

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Ban,
  Check,
  Copy,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { CardQr } from "@/components/admin/cards/card-qr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { cardsAdminSr as dict } from "@/lib/i18n/sr/cards-admin";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

// --- target model (mirrors convex cardTargetSpecValidator) ------------------

const TARGET_KINDS = [
  "memories_space",
  "venue",
  "event",
  "service_page",
  "url",
  "splitter",
  "menu",
  "table_ordering",
] as const;
type TargetKind = (typeof TARGET_KINDS)[number];

// Splitter buttons: the 6 base kinds (no nesting, no menu — schema cardSplitterItem).
const SPLITTER_KINDS = [
  "memories_space",
  "venue",
  "event",
  "service_page",
  "url",
  "table_ordering",
] as const;
type SplitterKind = (typeof SPLITTER_KINDS)[number];

const KIND_LABEL: Record<TargetKind, string> = {
  memories_space: dict.kindMemoriesSpace,
  venue: dict.kindVenue,
  event: dict.kindEvent,
  service_page: dict.kindServicePage,
  url: dict.kindUrl,
  splitter: dict.kindSplitter,
  menu: dict.kindMenu,
  table_ordering: dict.kindTableOrdering,
};

// A base reference is stored as strings in the form and assembled at submit.
type RefValues = {
  spaceId: string;
  eventId: string;
  serviceProfileId: string;
  url: string;
};
type SplitterDraft = RefValues & { kind: SplitterKind; label: string };
type TargetDraft = RefValues & { kind: TargetKind; splitterItems: SplitterDraft[] };

type TargetSpec = {
  kind: TargetKind;
  spaceId?: Id<"memoriesSpaces">;
  eventId?: Id<"events">;
  serviceProfileId?: Id<"serviceProfiles">;
  url?: string;
  splitterItems?: Array<{
    kind: SplitterKind;
    label: string;
    spaceId?: Id<"memoriesSpaces">;
    eventId?: Id<"events">;
    serviceProfileId?: Id<"serviceProfiles">;
    url?: string;
  }>;
};

const emptyRef = (): RefValues => ({
  spaceId: "",
  eventId: "",
  serviceProfileId: "",
  url: "",
});
const emptySplitterItem = (): SplitterDraft => ({
  ...emptyRef(),
  kind: "venue",
  label: "",
});
const emptyDraft = (kind: TargetKind): TargetDraft => ({
  ...emptyRef(),
  kind,
  splitterItems: [emptySplitterItem(), emptySplitterItem()],
});

function baseRefComplete(kind: TargetKind | SplitterKind, v: RefValues): boolean {
  switch (kind) {
    case "memories_space":
      return v.spaceId !== "";
    case "event":
      return v.eventId !== "";
    case "service_page":
      return v.serviceProfileId !== "";
    case "url":
      return v.url.trim() !== "";
    default:
      return true; // venue / menu / table_ordering — no reference
  }
}

// Client-side completeness only guards against empty required refs (which would
// otherwise fail Convex ARG validation with a generic message). Semantic
// refusals stay the backend's job and surface readably.
function canBuild(d: TargetDraft): boolean {
  if (d.kind === "splitter") {
    if (d.splitterItems.length < 2 || d.splitterItems.length > 8) return false;
    return d.splitterItems.every(
      (it) => it.label.trim() !== "" && baseRefComplete(it.kind, it),
    );
  }
  return baseRefComplete(d.kind, d);
}

type RefSpec = {
  spaceId?: Id<"memoriesSpaces">;
  eventId?: Id<"events">;
  serviceProfileId?: Id<"serviceProfiles">;
  url?: string;
};

function buildRef(kind: TargetKind | SplitterKind, v: RefValues): RefSpec {
  switch (kind) {
    case "memories_space":
      return { spaceId: v.spaceId as Id<"memoriesSpaces"> };
    case "event":
      return { eventId: v.eventId as Id<"events"> };
    case "service_page":
      return { serviceProfileId: v.serviceProfileId as Id<"serviceProfiles"> };
    case "url":
      return { url: v.url.trim() };
    default:
      return {};
  }
}

function buildSpec(d: TargetDraft): TargetSpec {
  if (d.kind === "splitter") {
    return {
      kind: "splitter",
      splitterItems: d.splitterItems.map((it) => ({
        kind: it.kind,
        label: it.label.trim(),
        ...buildRef(it.kind, it),
      })),
    };
  }
  return { kind: d.kind, ...buildRef(d.kind, d) };
}

// --- derived Convex types ---------------------------------------------------

type OptionsData = NonNullable<
  FunctionReturnType<typeof api.cardsAdmin.listCardTargetOptions>
>;
type CardsData = NonNullable<
  FunctionReturnType<typeof api.cardsAdmin.listBusinessCards>
>;
type CardRow = CardsData["cards"][number];

// ---------------------------------------------------------------------------

export function CardsAdmin() {
  return (
    <AdminGuard>
      <AdminShell>
        <CardsWorkspace />
      </AdminShell>
    </AdminGuard>
  );
}

function CardsWorkspace() {
  const businesses = useQuery(api.admin.listBusinesses);
  const [businessId, setBusinessId] = useState<Id<"businesses"> | null>(null);

  const cardsData = useQuery(
    api.cardsAdmin.listBusinessCards,
    businessId ? { businessId } : "skip",
  );
  const options = useQuery(
    api.cardsAdmin.listCardTargetOptions,
    businessId ? { businessId } : "skip",
  );

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {dict.pageTitle}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {dict.pageIntro}
        </p>
      </header>

      <div className="grid max-w-sm gap-2">
        <Label htmlFor="cards-business">{dict.businessLabel}</Label>
        {businesses === undefined ? (
          <p className="text-sm text-muted-foreground">{dict.businessLoading}</p>
        ) : (
          <Select
            value={businessId ?? undefined}
            onValueChange={(value) => setBusinessId(value as Id<"businesses">)}
          >
            <SelectTrigger id="cards-business" className="min-h-11">
              <SelectValue placeholder={dict.businessPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {businesses.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!businessId ? (
        <p className="text-sm text-muted-foreground">
          {dict.selectBusinessPrompt}
        </p>
      ) : (
        <BusinessCards
          businessId={businessId}
          cardsData={cardsData ?? undefined}
          options={options ?? undefined}
        />
      )}
    </div>
  );
}

function BusinessCards({
  businessId,
  cardsData,
  options,
}: {
  businessId: Id<"businesses">;
  cardsData: CardsData | undefined;
  options: OptionsData | undefined;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [retargetFor, setRetargetFor] = useState<CardRow | null>(null);
  const [printFor, setPrintFor] = useState<CardRow | null>(null);

  const rows = cardsData?.cards ?? [];

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold">
          {cardsData
            ? fmt(dict.cardsCount, { count: rows.length })
            : dict.cardsHeading}
        </h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {dict.createAction}
        </Button>
        <Button variant="secondary" onClick={() => setBatchOpen(true)}>
          <LayoutGrid className="size-4" />
          {dict.batchAction}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
          {dict.emptyCards}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">{dict.colLabel}</th>
                <th className="py-2 pr-4 font-semibold">{dict.colTarget}</th>
                <th className="py-2 pr-4 font-semibold">{dict.colScans}</th>
                <th className="py-2 pr-4 font-semibold">{dict.colStatus}</th>
                <th className="py-2 font-semibold">{dict.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((card) => (
                <tr
                  key={card.cardId}
                  className="border-b border-border align-top last:border-b-0"
                >
                  <td className="py-3 pr-4">
                    <div className="font-medium">{card.label}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {card.cardCode}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <TargetCell target={card.target} />
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{card.totalScans}</td>
                  <td className="py-3 pr-4">
                    {card.status === "disabled" ? (
                      <span className="text-muted-foreground">
                        {dict.statusDisabled}
                      </span>
                    ) : (
                      <span className="text-primary">{dict.statusActive}</span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="h-9 px-2"
                        onClick={() => setPrintFor(card)}
                      >
                        <QrCode className="size-4" />
                        {dict.printAction}
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-9 px-2"
                        onClick={() => setRetargetFor(card)}
                      >
                        <Link2 className="size-4" />
                        {dict.retargetAction}
                      </Button>
                      {card.status === "active" ? (
                        <DisableButton cardId={card.cardId} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <CreateCardDialog
          businessId={businessId}
          options={options}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
      {batchOpen ? (
        <BatchCreateDialog
          businessId={businessId}
          options={options}
          onClose={() => setBatchOpen(false)}
        />
      ) : null}
      {retargetFor ? (
        <RetargetDialog
          card={retargetFor}
          options={options}
          onClose={() => setRetargetFor(null)}
        />
      ) : null}
      {printFor ? (
        <PrintDialog card={printFor} onClose={() => setPrintFor(null)} />
      ) : null}
    </section>
  );
}

function TargetCell({ target }: { target: CardRow["target"] }) {
  if (!target) {
    return <span className="text-muted-foreground">{dict.targetUnset}</span>;
  }
  const kindLabel = KIND_LABEL[target.kind as TargetKind];
  if (target.kind === "splitter") {
    return (
      <div>
        <div className="font-medium">{kindLabel}</div>
        <div className="text-xs text-muted-foreground">
          {dict.splitterButtonsLabel}: {(target.buttons ?? []).join(" · ")}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="font-medium">{kindLabel}</div>
      <div className="text-xs text-muted-foreground">
        {target.detail ?? dict.targetBusinessPage}
      </div>
    </div>
  );
}

function DisableButton({ cardId }: { cardId: Id<"cards"> }) {
  const disableCard = useMutation(api.cardsAdmin.disableCard);
  const [pending, setPending] = useState(false);
  async function run() {
    if (!window.confirm(dict.disableConfirm)) return;
    setPending(true);
    try {
      await disableCard({ cardId });
      toast.success(dict.disableSuccess);
    } catch (error) {
      toast.error(errorMessage(error, dict.genericError));
    } finally {
      setPending(false);
    }
  }
  return (
    <Button
      variant="secondary"
      className="h-9 px-2"
      disabled={pending}
      onClick={() => void run()}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Ban className="size-4" />
      )}
      {dict.disableAction}
    </Button>
  );
}

// --- shared target fields ---------------------------------------------------

function BaseRefFields({
  kind,
  options,
  values,
  onChange,
  idPrefix,
}: {
  kind: TargetKind | SplitterKind;
  options: OptionsData | undefined;
  values: RefValues;
  onChange: (patch: Partial<RefValues>) => void;
  idPrefix: string;
}) {
  const spaces = options?.spaces ?? [];
  const events = options?.events ?? [];
  const profiles = options?.serviceProfiles ?? [];

  if (kind === "memories_space") {
    if (spaces.length === 0)
      return <FieldHint>{dict.noSpacesHint}</FieldHint>;
    return (
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-space`}>{dict.referenceLabel}</Label>
        <Select
          value={values.spaceId || undefined}
          onValueChange={(v) => onChange({ spaceId: v })}
        >
          <SelectTrigger id={`${idPrefix}-space`} className="min-h-11">
            <SelectValue placeholder={dict.spacePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {spaces.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} ({s.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (kind === "event") {
    if (events.length === 0)
      return <FieldHint>{dict.noEventsHint}</FieldHint>;
    return (
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-event`}>{dict.referenceLabel}</Label>
        <Select
          value={values.eventId || undefined}
          onValueChange={(v) => onChange({ eventId: v })}
        >
          <SelectTrigger id={`${idPrefix}-event`} className="min-h-11">
            <SelectValue placeholder={dict.eventPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (kind === "service_page") {
    if (profiles.length === 0)
      return <FieldHint>{dict.noProfilesHint}</FieldHint>;
    return (
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-profile`}>{dict.referenceLabel}</Label>
        <Select
          value={values.serviceProfileId || undefined}
          onValueChange={(v) => onChange({ serviceProfileId: v })}
        >
          <SelectTrigger id={`${idPrefix}-profile`} className="min-h-11">
            <SelectValue placeholder={dict.profilePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                /{p.slug} · {p.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (kind === "url") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-url`}>{dict.urlLabel}</Label>
        <Input
          id={`${idPrefix}-url`}
          value={values.url}
          placeholder={dict.urlPlaceholder}
          onChange={(e) => onChange({ url: e.target.value })}
          className="h-11"
        />
      </div>
    );
  }
  // venue / menu / table_ordering — no reference
  return (
    <FieldHint>
      {dict.noReferenceNeeded}
      {kind === "table_ordering" && options && !options.hasOrderingConfig
        ? ` ${dict.orderingMissingHint}`
        : ""}
    </FieldHint>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-border bg-secondary/20 p-3 text-xs leading-5 text-muted-foreground">
      {children}
    </p>
  );
}

function TargetFields({
  draft,
  setDraft,
  options,
  idPrefix,
}: {
  draft: TargetDraft;
  setDraft: (d: TargetDraft) => void;
  options: OptionsData | undefined;
  idPrefix: string;
}) {
  if (draft.kind === "splitter") {
    return (
      <SplitterBuilder
        items={draft.splitterItems}
        setItems={(splitterItems) => setDraft({ ...draft, splitterItems })}
        options={options}
        idPrefix={idPrefix}
      />
    );
  }
  return (
    <BaseRefFields
      kind={draft.kind}
      options={options}
      values={draft}
      onChange={(patch) => setDraft({ ...draft, ...patch })}
      idPrefix={idPrefix}
    />
  );
}

function SplitterBuilder({
  items,
  setItems,
  options,
  idPrefix,
}: {
  items: SplitterDraft[];
  setItems: (items: SplitterDraft[]) => void;
  options: OptionsData | undefined;
  idPrefix: string;
}) {
  function patchItem(index: number, patch: Partial<SplitterDraft>) {
    setItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{dict.splitterHeading}</span>
        <Button
          type="button"
          variant="secondary"
          className="h-9 px-2"
          disabled={items.length >= 8}
          onClick={() => setItems([...items, emptySplitterItem()])}
        >
          <Plus className="size-4" />
          {dict.addButton}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{dict.splitterHint}</p>
      {items.map((item, index) => (
        <div key={index} className="grid gap-2 border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-item-${index}-kind`}>
                {dict.splitterButtonKindLabel}
              </Label>
              <Select
                value={item.kind}
                onValueChange={(v) =>
                  patchItem(index, { kind: v as SplitterKind })
                }
              >
                <SelectTrigger
                  id={`${idPrefix}-item-${index}-kind`}
                  className="min-h-11"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPLITTER_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-item-${index}-label`}>
                {dict.splitterButtonTextLabel}
              </Label>
              <Input
                id={`${idPrefix}-item-${index}-label`}
                value={item.label}
                placeholder={dict.splitterButtonTextPlaceholder}
                onChange={(e) => patchItem(index, { label: e.target.value })}
                className="h-11"
              />
            </div>
          </div>
          <BaseRefFields
            kind={item.kind}
            options={options}
            values={item}
            onChange={(patch) => patchItem(index, patch)}
            idPrefix={`${idPrefix}-item-${index}`}
          />
          {items.length > 2 ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-2 text-destructive"
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
                {dict.removeButton}
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function KindSelect({
  value,
  onChange,
  id,
  label,
}: {
  value: TargetKind;
  onChange: (kind: TargetKind) => void;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as TargetKind)}>
        <SelectTrigger id={id} className="min-h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TARGET_KINDS.map((k) => (
            <SelectItem key={k} value={k}>
              {KIND_LABEL[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// --- create -----------------------------------------------------------------

function CreateCardDialog({
  businessId,
  options,
  onClose,
}: {
  businessId: Id<"businesses">;
  options: OptionsData | undefined;
  onClose: () => void;
}) {
  const createCard = useMutation(api.cardsAdmin.createCard);
  const [label, setLabel] = useState("");
  const [draft, setDraft] = useState<TargetDraft>(() => emptyDraft("venue"));
  const [pending, setPending] = useState(false);

  const ready = label.trim() !== "" && canBuild(draft);

  async function submit() {
    setPending(true);
    try {
      await createCard({
        businessId,
        label: label.trim(),
        target: buildSpec(draft),
      });
      toast.success(dict.createSuccess);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, dict.genericError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dict.createTitle}</DialogTitle>
          <DialogDescription>{dict.createDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="create-label">{dict.labelLabel}</Label>
            <Input
              id="create-label"
              value={label}
              placeholder={dict.labelPlaceholder}
              onChange={(e) => setLabel(e.target.value)}
              className="h-11"
            />
          </div>
          <KindSelect
            id="create-kind"
            label={dict.kindLabel}
            value={draft.kind}
            onChange={(kind) => setDraft({ ...emptyDraft(kind) })}
          />
          <TargetFields
            draft={draft}
            setDraft={setDraft}
            options={options}
            idPrefix="create"
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => void submit()}
            disabled={pending || !ready}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {dict.submitCreate}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- batch ------------------------------------------------------------------

function BatchCreateDialog({
  businessId,
  options,
  onClose,
}: {
  businessId: Id<"businesses">;
  options: OptionsData | undefined;
  onClose: () => void;
}) {
  const createBatch = useMutation(api.cardsAdmin.createCardBatch);
  const [prefix, setPrefix] = useState<string>(dict.batchDefaultPrefix);
  const [count, setCount] = useState("20");
  const [start, setStart] = useState("1");
  const [draft, setDraft] = useState<TargetDraft>(() =>
    emptyDraft("table_ordering"),
  );
  const [pending, setPending] = useState(false);

  const n = Number(count);
  const s = Number(start);
  const startNum = Number.isFinite(s) && s >= 1 ? Math.floor(s) : 1;
  const countNum = Number.isInteger(n) && n >= 1 && n <= 50 ? n : 0;
  const preview = useMemo(() => {
    if (countNum < 1) return null;
    return {
      first: `${prefix.trim()} ${startNum}`,
      last: `${prefix.trim()} ${startNum + countNum - 1}`,
    };
  }, [prefix, startNum, countNum]);

  const ready = prefix.trim() !== "" && countNum >= 1 && canBuild(draft);

  async function submit() {
    setPending(true);
    try {
      const result = await createBatch({
        businessId,
        count: countNum,
        startIndex: startNum,
        labelPrefix: prefix.trim(),
        target: buildSpec(draft),
      });
      toast.success(fmt(dict.batchSuccess, { count: result.created.length }));
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, dict.genericError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dict.batchTitle}</DialogTitle>
          <DialogDescription>{dict.batchDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="batch-prefix">{dict.batchPrefixLabel}</Label>
              <Input
                id="batch-prefix"
                value={prefix}
                placeholder={dict.batchPrefixPlaceholder}
                onChange={(e) => setPrefix(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="batch-count">{dict.batchCountLabel}</Label>
              <Input
                id="batch-count"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="batch-start">{dict.batchStartLabel}</Label>
              <Input
                id="batch-start"
                type="number"
                min={1}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          {preview ? (
            <p className="text-xs text-muted-foreground">
              {fmt(dict.batchPreview, {
                first: preview.first,
                last: preview.last,
              })}
            </p>
          ) : null}
          <KindSelect
            id="batch-kind"
            label={dict.batchKindLabel}
            value={draft.kind}
            onChange={(kind) => setDraft({ ...emptyDraft(kind) })}
          />
          <TargetFields
            draft={draft}
            setDraft={setDraft}
            options={options}
            idPrefix="batch"
          />
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={pending || !ready}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <LayoutGrid className="size-4" />
            )}
            {dict.submitBatch}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- retarget ---------------------------------------------------------------

function RetargetDialog({
  card,
  options,
  onClose,
}: {
  card: CardRow;
  options: OptionsData | undefined;
  onClose: () => void;
}) {
  const retargetCard = useMutation(api.cardsAdmin.retargetCard);
  const [draft, setDraft] = useState<TargetDraft>(() =>
    emptyDraft((card.target?.kind as TargetKind) ?? "venue"),
  );
  const [pending, setPending] = useState(false);

  const ready = canBuild(draft);

  async function submit() {
    setPending(true);
    try {
      await retargetCard({ cardId: card.cardId, target: buildSpec(draft) });
      toast.success(dict.retargetSuccess);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, dict.genericError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dict.retargetTitle}</DialogTitle>
          <DialogDescription>
            {card.label} · {card.cardCode}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <p className="border border-destructive/40 bg-destructive/10 p-3 text-xs leading-5 text-foreground">
            {dict.retargetWarning}
          </p>
          <KindSelect
            id="retarget-kind"
            label={dict.kindLabel}
            value={draft.kind}
            onChange={(kind) => setDraft({ ...emptyDraft(kind) })}
          />
          <TargetFields
            draft={draft}
            setDraft={setDraft}
            options={options}
            idPrefix="retarget"
          />
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={pending || !ready}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            {dict.submitRetarget}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- print / QR -------------------------------------------------------------

function PrintDialog({
  card,
  onClose,
}: {
  card: CardRow;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${card.cardCode}`
      : `/r/${card.cardCode}`;

  function copy() {
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.printTitle}</DialogTitle>
          <DialogDescription>
            {card.label} · {card.cardCode}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="mx-auto w-48">
            <CardQr
              url={url}
              title={fmt(dict.qrAlt, { label: card.label })}
              className="w-full"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="print-url">{dict.urlHeading}</Label>
            <div className="flex gap-2">
              <Input
                id="print-url"
                readOnly
                value={url}
                className="h-11 font-mono text-xs"
              />
              <Button
                variant="secondary"
                className="h-11 shrink-0"
                onClick={copy}
                aria-label={`${dict.copyAria} ${card.cardCode}`}
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? dict.copied : dict.copyLink}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
