"use client";

// TASK-58 (RFC-003 §2.9) — the admin Menu subpage body: the `menu` case of
// SubpageBody in location-admin.tsx. The concierge surface: grant the menu,
// track the migration (primljeno → u izradi → na potvrdi → objavljeno, with
// the two-working-day deadline), enter the client's menu as plain lines
// (lib/menu-import.ts → convex/menuAdmin.ts importDraft), publish on the
// client's behalf, and export PDF / Excel (convex/menuExport.ts — an INTERNAL
// tool pending RFC-003 §5 Q7). Every mutation behind it writes one
// adminAuditLog row. Glass from app/offer-surface.css, like the other admin
// screens; every string through lib/i18n/sr/menu-admin.
//
// Reached today through /dev/menu-admin-preview?businessId=… — the real route
// /admin/customers/<id>/menu stays a 404 while subpageActive("menu") is false
// (TASK-61 flips it).

import { ConvexError } from "convex/values";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Pencil,
  Send,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatBelgrade } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n";
import { menuAdminSr as dict } from "@/lib/i18n/sr/menu-admin";
import { MENU_MAX_ITEMS } from "@/lib/menu-export/rows";
import { parseMenuImport } from "@/lib/menu-import";
import { MIGRATION_STAGES, type MigrationStage } from "@/lib/menu-migration";

const STAGE_LABEL: Record<MigrationStage, string> = {
  received: dict.stageReceived,
  in_progress: dict.stageInProgress,
  review: dict.stageReview,
  published: dict.stagePublished,
};

type Busy = "grant" | "stage" | "import" | "publish" | "pdf" | "xlsx" | null;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback;
}

// The chunked action result → one Blob → a browser download. Nothing is
// parked anywhere; the object URL is revoked right after the click.
function downloadChunks(
  chunks: ArrayBuffer[],
  mimeType: string,
  fileName: string,
) {
  const blob = new Blob(chunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MenuAdminSubpage({ businessId }: { businessId: Id<"businesses"> }) {
  const data = useQuery(api.menuAdmin.overview, { businessId });
  const grantMenu = useMutation(api.menuAdmin.grantMenu);
  const setMigrationStage = useMutation(api.menuAdmin.setMigrationStage);
  const importDraft = useMutation(api.menuAdmin.importDraft);
  const publishForClient = useMutation(api.menuAdmin.publishForClient);
  const exportMenu = useAction(api.menuExport.exportMenu);

  const [busy, setBusy] = useState<Busy>(null);
  const [stagePick, setStagePick] = useState<MigrationStage | null>(null);
  const [importText, setImportText] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [kept, setKept] = useState<string[]>([]);

  const parsed = useMemo(() => parseMenuImport(importText), [importText]);
  const tooLarge = parsed.items > MENU_MAX_ITEMS;

  if (data === undefined) {
    return (
      <div className="offer-frame overflow-hidden">
        <div className="offer-glass offer-glass--panel p-5 sm:p-7">
          <div className="h-7 w-48 animate-pulse rounded bg-secondary" />
          <div className="mt-6 h-40 animate-pulse rounded bg-secondary" />
        </div>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="offer-frame overflow-hidden">
        <div className="offer-glass offer-glass--panel p-5 sm:p-7">
          <p className="text-sm text-muted-foreground">{dict.loadError}</p>
        </div>
      </div>
    );
  }

  const { business, menu } = data;
  const currentStage = menu?.migrationStage ?? null;
  const selectedStage = stagePick ?? currentStage;
  // Evaluated by the overview query (render stays pure).
  const overdue = menu?.overdue ?? false;

  async function run<T>(kind: Busy, work: () => Promise<T>, fallback: string) {
    setBusy(kind);
    try {
      return await work();
    } catch (error) {
      toast.error(errorMessage(error, fallback));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleGrant() {
    const result = await run("grant", () => grantMenu({ businessId }), dict.grantError);
    if (result) toast.success(result.created ? dict.grantSuccess : dict.grantSuccessExisting);
  }

  async function handleStage() {
    if (!menu || !selectedStage || selectedStage === currentStage) return;
    const result = await run(
      "stage",
      () => setMigrationStage({ menuId: menu.id, stage: selectedStage }),
      dict.stageChangeError,
    );
    if (result) {
      setStagePick(null);
      toast.success(dict.stageChangeSuccess);
    }
  }

  async function runImport() {
    if (!menu) return;
    setReplaceOpen(false);
    const result = await run(
      "import",
      () =>
        importDraft({
          menuId: menu.id,
          model: parsed.model as unknown as Parameters<typeof importDraft>[0]["model"],
        }),
      dict.importError,
    );
    if (result) {
      setImportText("");
      toast.success(fmt(dict.importSuccess, { items: result.items }));
    }
  }

  function handleImport() {
    if (!menu) return;
    if (parsed.items === 0) {
      toast.error(dict.importEmpty);
      return;
    }
    if (menu.itemsCount > 0) {
      setReplaceOpen(true);
      return;
    }
    void runImport();
  }

  async function handlePublish() {
    if (!menu) return;
    const result = await run(
      "publish",
      () => publishForClient({ menuId: menu.id }),
      dict.publishForClientError,
    );
    if (result) {
      setKept(result.keptUnavailable.map((item) => item.name));
      toast.success(dict.publishForClientSuccess);
    }
  }

  async function handleExport(format: "pdf" | "xlsx") {
    const result = await run(
      format,
      () => exportMenu({ businessId, format }),
      dict.exportError,
    );
    if (result) {
      downloadChunks(result.chunks, result.mimeType, result.fileName);
      toast.success(dict.exportSuccess);
    }
  }

  const statusText = !menu
    ? dict.menuNone
    : menu.status === "published"
      ? dict.menuPublished
      : dict.menuDraft;

  return (
    <div className="offer-frame overflow-hidden">
      <div className="offer-glass offer-glass--panel p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {dict.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
              {dict.title}
            </h2>
          </div>
          <span className="inline-flex min-h-8 items-center gap-1.5 border border-primary/50 bg-primary/10 px-3 text-xs font-semibold text-primary">
            {dict.statusLabel}: {statusText}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {dict.description}
        </p>

        {/* ---- status / grant ------------------------------------------- */}
        <section className="mt-6 border-t border-border/60 pt-5">
          {menu ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="font-semibold">
                {fmt(dict.groupsCount, { count: menu.groupsCount })}
              </span>
              <span className="font-semibold">
                {fmt(dict.itemsCount, { count: menu.itemsCount })}
              </span>
              <span className="text-muted-foreground">
                {menu.publishedAt
                  ? fmt(dict.lastPublished, { date: formatBelgrade(menu.publishedAt) })
                  : dict.neverPublished}
                {menu.hasUnpublishedChanges ? ` · ${dict.draftDirtyNote}` : ""}
              </span>
            </div>
          ) : (
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleGrant()}
              className="min-h-11"
            >
              {busy === "grant" ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {dict.grantAction}
            </Button>
          )}
        </section>

        {menu ? (
          <>
            {/* ---- migration / SLA -------------------------------------- */}
            <section className="mt-6 border-t border-border/60 pt-5">
              <h3 className="text-base font-semibold">{dict.migrationHeading}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{dict.migrationSlaNote}</p>
              <ol className="mt-4 flex flex-wrap gap-2" aria-label={dict.stageLabel}>
                {MIGRATION_STAGES.map((stage) => {
                  const reached =
                    currentStage !== null &&
                    MIGRATION_STAGES.indexOf(stage) <= MIGRATION_STAGES.indexOf(currentStage);
                  return (
                    <li
                      key={stage}
                      aria-current={stage === currentStage ? "step" : undefined}
                      className={
                        "inline-flex min-h-8 items-center border px-3 text-xs font-semibold " +
                        (stage === currentStage
                          ? "border-primary bg-primary text-primary-foreground"
                          : reached
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground")
                      }
                    >
                      {STAGE_LABEL[stage]}
                    </li>
                  );
                })}
              </ol>
              <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">{dict.receivedLabel}</dt>
                  <dd className="font-semibold">
                    {menu.migrationReceivedAt ? formatBelgrade(menu.migrationReceivedAt) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">{dict.deadlineLabel}</dt>
                  <dd className={overdue ? "font-semibold text-destructive" : "font-semibold"}>
                    {menu.deadlineAt ? formatBelgrade(menu.deadlineAt) : "—"}
                    {overdue ? ` · ${dict.deadlineOverdue}` : ""}
                  </dd>
                </div>
                {menu.migrationStageAt ? (
                  <div className="sm:col-span-2 text-muted-foreground">
                    {fmt(dict.stageChangedAt, { date: formatBelgrade(menu.migrationStageAt) })}
                  </div>
                ) : null}
              </dl>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="menu-admin-stage">{dict.stageLabel}</Label>
                  <Select
                    value={selectedStage ?? undefined}
                    onValueChange={(value) => setStagePick(value as MigrationStage)}
                  >
                    <SelectTrigger id="menu-admin-stage" className="min-h-11 w-56">
                      <SelectValue placeholder={dict.stageLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      {MIGRATION_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {STAGE_LABEL[stage]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy !== null || !selectedStage || selectedStage === currentStage}
                  onClick={() => void handleStage()}
                >
                  {busy === "stage" ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {dict.stageChangeAction}
                </Button>
              </div>
            </section>

            {/* ---- data entry (import) ----------------------------------- */}
            <section className="mt-6 border-t border-border/60 pt-5">
              <h3 className="text-base font-semibold">{dict.importHeading}</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                {dict.importHelp}
              </p>
              <div className="mt-3 grid gap-1.5">
                <Label htmlFor="menu-admin-import">{dict.importHeading}</Label>
                <Textarea
                  id="menu-admin-import"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder={dict.importPlaceholder}
                  spellCheck={false}
                  className="min-h-56 font-mono text-sm"
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
                {fmt(dict.importPreview, {
                  groups: parsed.groups,
                  items: parsed.items,
                  variants: parsed.variants,
                })}
                {parsed.warnings.length > 0
                  ? ` · ${fmt(dict.importWarnings, { count: parsed.warnings.length })}`
                  : ""}
              </p>
              {parsed.warnings.length > 0 ? (
                <ul className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground">
                  {parsed.warnings.slice(0, 20).map((warning) => (
                    <li key={`${warning.line}-${warning.code}`} className="font-mono">
                      {warning.line}: {warning.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              {tooLarge ? (
                <p className="mt-2 text-sm font-semibold text-destructive" role="alert">
                  {fmt(dict.importTooLarge, { count: parsed.items, max: MENU_MAX_ITEMS })}
                </p>
              ) : null}
              <div className="mt-3">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy !== null || tooLarge || parsed.items === 0}
                  onClick={handleImport}
                >
                  {busy === "import" ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="size-4" aria-hidden="true" />
                  )}
                  {dict.importAction}
                </Button>
              </div>
            </section>

            {/* ---- publish on behalf ------------------------------------- */}
            <section className="mt-6 border-t border-border/60 pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy !== null || menu.itemsCount === 0}
                  onClick={() => void handlePublish()}
                >
                  {busy === "publish" ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="size-4" aria-hidden="true" />
                  )}
                  {dict.publishForClientAction}
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link href={`/${business.slug}/meni/editor`} target="_blank" rel="noopener noreferrer">
                    <Pencil className="size-4" aria-hidden="true" />
                    {dict.openEditor}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link href={`/${business.slug}/meni`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" aria-hidden="true" />
                    {dict.openPublic}
                  </Link>
                </Button>
              </div>
              {menu.hasUnpublishedChanges ? (
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                  {dict.unsavedChangesWarning}
                </p>
              ) : null}
              {kept.length > 0 ? (
                <p className="mt-3 text-sm text-muted-foreground" role="status">
                  {fmt(dict.publishForClientKept, { names: kept.join(", ") })}
                </p>
              ) : null}
            </section>

            {/* ---- export ------------------------------------------------- */}
            <section className="mt-6 border-t border-border/60 pt-5">
              <h3 className="text-base font-semibold">{dict.exportHeading}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{dict.exportInternalNote}</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy !== null}
                  onClick={() => void handleExport("pdf")}
                >
                  {busy === "pdf" ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileText className="size-4" aria-hidden="true" />
                  )}
                  {busy === "pdf" ? dict.exportPdfLoading : dict.exportPdfAction}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy !== null}
                  onClick={() => void handleExport("xlsx")}
                >
                  {busy === "xlsx" ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileSpreadsheet className="size-4" aria-hidden="true" />
                  )}
                  {busy === "xlsx" ? dict.exportExcelLoading : dict.exportExcelAction}
                </Button>
              </div>
            </section>
          </>
        ) : null}
      </div>

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.importHeading}</DialogTitle>
            <DialogDescription className="leading-6">
              {fmt(dict.importReplaceConfirm, { count: menu?.itemsCount ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                {dict.deactivateCancel}
              </Button>
            </DialogClose>
            <Button type="button" className="min-h-11" onClick={() => void runImport()}>
              {dict.importAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
