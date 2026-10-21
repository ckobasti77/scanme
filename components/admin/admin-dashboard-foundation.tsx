"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckSquare2,
  CircleDollarSign,
  Clock3,
  Inbox,
  Pause,
  QrCode,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Component,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { adminPrimaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { AdminOdometer } from "@/components/admin/admin-ui/admin-odometer";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { useAdminUrlState } from "@/components/admin/admin-ui/use-admin-query-state";
import { Constellation, type ConstellationHandle } from "@/components/admin/dashboard/constellation";
import { dashboardHeroStore } from "@/components/admin/dashboard/hero-choice";
import { BossBar } from "@/components/admin/game/boss-bar";
import { ComboMeter } from "@/components/admin/game/combo-meter";
import { useGame, useGameApi } from "@/components/admin/game/game-context";
import { GameTeam } from "@/components/admin/game/game-parts";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import { prefersReducedMotion, useAdminGsap } from "@/components/admin/frame/use-admin-gsap";
import { ADMIN_NAV_INTENT_EVENT } from "@/components/admin/reveal/admin-reveal-root";
import { adminMotion } from "@/components/admin/reveal/gsap-plugins";
import { AdminRingMask } from "@/components/admin/reveal/reveal-marks";
import { useAdminSidebarLive } from "@/components/admin/frame/admin-sidebar-store";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { backlogRing } from "@/lib/admin-v2/constellation/layout";
import type { BacklogRing, ConstellationItem, OrbitIndex, Star } from "@/lib/admin-v2/constellation/types";
import { bossView } from "@/lib/admin-v2/game/boss";
import { ceremonySignal } from "@/lib/admin-v2/game/ceremony-signal";
import type { BossView } from "@/lib/admin-v2/game/types";
import { dashboardScope, inboxMissions, reactionMissions, taskMissions } from "@/lib/admin-v2/lists/dashboard-missions";
import { ADMIN_DURATION, ADMIN_EASE } from "@/lib/admin-v2/motion";
import { DASHBOARD_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/pages";
import { fmt } from "@/lib/i18n/format";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPanel,
  AdminStatus,
} from "./admin-primitives";

type ReactionData = FunctionReturnType<typeof api.adminDashboard.reactions>;
type SubscriptionData = FunctionReturnType<typeof api.adminDashboard.subscriptions>;
type ProductData = FunctionReturnType<typeof api.adminDashboard.products>;
type FinanceData = FunctionReturnType<typeof api.adminFinance.overview>;
type TaskData = FunctionReturnType<typeof api.adminTasks.dashboardAdapter>;
type InboxData = FunctionReturnType<typeof api.adminDashboard.inbox>;
type DashboardScope = "all" | "mine";

export type AdminDashboardFixture = {
  now: number;
  reactions: Record<DashboardScope, ReactionData>;
  subscriptions: SubscriptionData;
  products: ProductData;
  finance: FinanceData;
  tasks: TaskData;
  inbox: InboxData;
  errorWidget?: "subscriptions";
  loadingWidget?: "subscriptions";
};

const panelClass = "overflow-hidden border-[var(--admin-border)] bg-[var(--admin-surface-strong)]";
const linkClass = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[var(--admin-text)] transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2";

export function AdminDashboardFoundation({
  initialNow,
  fixture,
  previewAim,
}: {
  initialNow?: number;
  fixture?: AdminDashboardFixture;
  /** Dev preview (`?nisan=<causeId>`): the star of this item is aimed at without a mouse. */
  previewAim?: string;
}) {
  // The scope is the sidebar's „Obim Dashboarda“ (`?obim=mine`), not a control on the screen.
  const [urlState] = useAdminUrlState(DASHBOARD_URL_FIELDS);
  const scope = dashboardScope(urlState);
  const [now, setNow] = useState(fixture?.now ?? initialNow ?? 0);
  const date = useMemo(() => now === 0 ? undefined : new Intl.DateTimeFormat("sr-Latn-RS", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Belgrade",
  }).format(now), [now]);

  useEffect(() => {
    if (fixture) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [fixture]);

  // The frame centres and limits the screen; the layout follows the width of the screen (container), not of the window.
  return (
    <div className="@container grid w-full min-w-0 gap-4 sm:gap-5">
      <AdminPageHeader
        eyebrow={date ? <span className="normal-case first-letter:uppercase">{date}</span> : undefined}
        title={adminV1Sr.dashboardTitle}
        badge={fixture ? <AdminStatus tone="waiting" label={adminV1Sr.dashboardFixtureBadge} /> : undefined}
        description={fixture ? adminV1Sr.dashboardFixtureDescription : undefined}
      />
      {now === 0 ? (
        <PanelLoading />
      ) : (
        <div className="relative grid min-w-0 gap-4 sm:gap-5 @4xl:grid-cols-2 @6xl:grid-cols-[minmax(0,1.8fr)_minmax(15rem,0.6fr)_minmax(15rem,0.6fr)] @6xl:gap-6">
          <DashboardWidgetBoundary key={`reaction-${scope}`} className="contents">
            {fixture ? (
              <ReactionBundle data={fixture.reactions[scope]} now={now} scope={scope} fixture previewAim={previewAim} />
            ) : (
              <ReactionLive now={now} scope={scope} />
            )}
          </DashboardWidgetBoundary>
          <DashboardWidgetBoundary>
            {fixture?.errorWidget === "subscriptions" ? <FixtureWidgetFailure /> : fixture?.loadingWidget === "subscriptions" ? <RingLoading /> : fixture ? <SubscriptionWidget data={fixture.subscriptions} /> : <SubscriptionLive />}
          </DashboardWidgetBoundary>
          <DashboardWidgetBoundary>
            {fixture ? <ProductWidget data={fixture.products} /> : <ProductLive />}
          </DashboardWidgetBoundary>
          {/* V4 — the week of the team in one thin row: the first three and me. It stands below „Za reakciju“,
              so the hero and the first rows of the list keep the first screen (the rule of V2). */}
          <GameTeam variant="strip" href="/admin/tim" className={fullRow} />
          <DashboardWidgetBoundary className="min-w-0 @4xl:col-span-2 @6xl:col-span-1">
            {fixture ? <FinanceWidget data={fixture.finance} /> : <FinanceLive now={now} />}
          </DashboardWidgetBoundary>
          <DashboardWidgetBoundary>
            {fixture ? <TasksWidget data={fixture.tasks} scope={scope} /> : <TasksLive now={now} scope={scope} />}
          </DashboardWidgetBoundary>
          <DashboardWidgetBoundary>
            {fixture ? <InboxWidget data={fixture.inbox} now={now} /> : <InboxLive now={now} />}
          </DashboardWidgetBoundary>
        </div>
      )}
    </div>
  );
}

const fullRow = "@4xl:col-span-2 @6xl:col-span-3";
const mainColumn = "@4xl:col-span-2 @6xl:col-span-1";

function ReactionLive({ now, scope }: { now: number; scope: DashboardScope }) {
  // 12 is the most the query gives: the list and the Constellation show the same items.
  const fresh = useQuery(api.adminDashboard.reactions, { now, scope, limit: 12 });
  // `now` is an argument of the query and moves every minute. While the next read is on its way the last
  // one stays on the screen: the list does not blink and the scene is not torn down and built again.
  const [data, setData] = useState(fresh);
  if (fresh !== undefined && fresh !== data) setData(fresh);
  if (!data) return <ReactionLoading />;
  return <ReactionBundle data={data} now={now} scope={scope} />;
}

function ReactionLoading() {
  return (
    <>
      <AdminPanel className={cn(panelClass, "min-h-48 @3xl:min-h-60", fullRow)}><AdminLoadingState compact /></AdminPanel>
      <AdminPanel className={cn(panelClass, "min-h-[28rem]", mainColumn)}><AdminLoadingState /></AdminPanel>
    </>
  );
}

type ReactionItem = ReactionData["items"][number];
type ReactionDialog = { mode: "snooze" | "resolve" | null; actionItemId: Id<"actionItems"> };

/** Dev preview: how long the TEST answer to „Reši“ takes (the dialog has closed by then). */
const PREVIEW_ANSWER_MS = 300;

const quietButtonClass = "inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-semibold text-[var(--admin-text-muted)] transition-colors hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)] focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-8";

function ReactionBundle({ data, now, scope, fixture = false, previewAim }: { data: ReactionData; now: number; scope: DashboardScope; fixture?: boolean; previewAim?: string }) {
  // Without counts no mission is published: a „Sve je čisto“ would be false. The scope the numbers are for
  // always is (X4): the day's ledger of „Sve“ and of „Moje“ are kept apart.
  const live = useMemo(() => ({ ...(data.counts ? { missions: reactionMissions(data.counts) } : {}), missionsScope: scope }), [data.counts, scope]);
  useAdminSidebarLive(live);
  const router = useRouter();
  const [quiet] = useQuietMode();
  const hero = useSyncExternalStore(dashboardHeroStore.subscribe, dashboardHeroStore.get, dashboardHeroStore.getServer);
  // V3: one dialog for the whole list, so a star opens the same one its row does.
  const [dialog, setDialog] = useState<ReactionDialog | null>(null);
  /** A row lights up its star (and the aim line); a star lights up its row. */
  const [rowAim, setRowAim] = useState<string | null>(previewAim ?? null);
  const [starAim, setStarAim] = useState<string | null>(null);
  const [handle, setHandle] = useState<ConstellationHandle | null>(null);
  const list = useRef<HTMLElement>(null);

  const stars = useMemo<ConstellationItem[]>(
    () => data.items.map((item) => ({ id: item.action.causeId, priority: item.action.priorityClass, relevantAt: item.action.relevantAt })),
    [data.items],
  );
  const byId = useMemo(() => new Map(data.items.map((item) => [item.action.causeId, item])), [data.items]);
  // V4 — the backlog is the boss of the day: the game of the frame keeps it (the counts of „Sve“ and the
  // largest backlog seen today on this device). Until the game has its numbers, and outside a frame, the
  // numbers of this page stand in (scope „Sve“ only). The boss belongs to the team: in „Moje“ its bar still
  // shows the team's backlog (its help says so), but the ring around the core is not drawn, because every
  // star of that picture is mine.
  const game = useGame();
  const gameApi = useGameApi();
  const [hpMax, setHpMax] = useState(0);
  const local = scope === "all" ? backlogRing(data.counts, hpMax) : null;
  if (local && local.hpMax > hpMax) setHpMax(local.hpMax);
  const boss: BossView = game.view.boss.kind !== "unavailable" || scope !== "all" || !data.counts ? game.view.boss : bossView(data.counts, { work: false, clear: false, bossMax: hpMax, bossDown: null });
  const backlog = scope === "all" ? bossRing(boss) : null;
  // Dev preview: the TEST game follows the backlog of the TEST Dashboard.
  const previewGame = fixture ? gameApi.preview : null;
  const previewCounts = scope === "all" ? data.counts : undefined;
  useEffect(() => {
    if (previewGame && previewCounts !== undefined) previewGame.setCounts(previewCounts ? { urgent: previewCounts.urgent, needsReply: previewCounts.needsReply, today: previewCounts.today } : null);
  }, [previewGame, previewCounts]);

  // V5 (S8) — pressing „Reši“ or „Odloži“ takes the aim away: the line comes back only when the pointer or the focus aims at a row again.
  const open = useCallback((mode: "snooze" | "resolve", item: ReactionItem) => {
    setRowAim(null);
    setDialog({ mode, actionItemId: item.action.actionItemId });
  }, []);
  // V4 — the spark of the XP a solved item carries starts at its star (or at its row when the hero is hidden).
  const onResolved = useCallback(
    (actionItemId: Id<"actionItems">) => {
      const id = data.items.find((item) => item.action.actionItemId === actionItemId)?.action.causeId;
      const star = id && handle?.host ? handle.project(id) : null;
      const box = star ? handle?.host?.getBoundingClientRect() : null;
      const dot = id ? list.current?.querySelector(`[data-reaction-row="${CSS.escape(id)}"] [data-reaction-dot]`)?.getBoundingClientRect() : null;
      // V5 — a star that is scrolled off the screen is not where the eye is: the comet then starts at the row.
      const view = list.current?.closest('main[data-admin-frame="screen"]')?.getBoundingClientRect() ?? null;
      const onScreen = (point: { x: number; y: number }) => !view || (point.x >= view.left && point.x <= view.right && point.y >= view.top && point.y <= view.bottom);
      const from = [star && box ? { x: box.left + star.x, y: box.top + star.y } : null, dot ? { x: dot.left + dot.width / 2, y: dot.top + dot.height / 2 } : null];
      gameApi.aim(from.find((point) => point !== null && onScreen(point)) ?? null);
      // Dev preview: the TEST journal gets its row a moment later, as the answer of the server would come.
      if (fixture) window.setTimeout(() => gameApi.preview?.act("resolved"), PREVIEW_ANSWER_MS);
    },
    [data.items, handle, gameApi, fixture],
  );
  const onPick = useCallback(
    (star: Star) => {
      const item = byId.get(star.id);
      if (star.kind === "more") {
        // The „+N“ star: its items are not named anywhere else, the list is the place to go on from.
        list.current?.scrollIntoView({ block: "start", behavior: quiet || prefersReducedMotion() ? "auto" : "smooth" });
        return;
      }
      if (!item) return;
      if (item.action.resolutionRule === "manual_problem_resolution") {
        open("resolve", item);
        return;
      }
      window.dispatchEvent(new CustomEvent(ADMIN_NAV_INTENT_EVENT, { detail: item.href }));
      router.push(item.href);
    },
    [byId, open, quiet, router],
  );
  const tooltip = useCallback(
    (star: Star) => {
      if (star.kind === "more") return <p className="text-xs leading-5 font-semibold">{fmt(adminV1Sr.dashboardConstellationMore, { orbit: orbitLabel(star.orbit), count: star.more })}</p>;
      const item = byId.get(star.id);
      if (!item) return null;
      const causeLabel = causeTitle(item.action.source.domain);
      return (
        <>
          <p className="text-sm leading-5 font-semibold tracking-[-0.015em]">{item.action.description ?? causeLabel}</p>
          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs leading-4 text-[var(--admin-text-muted)]">
            <span className="font-semibold text-[var(--admin-text)]">{orbitLabel(star.orbit)}</span>
            <span>{reactionContext(item) || causeLabel}</span>
            <span>{relativeTime(item.action.relevantAt, now)}</span>
            <span>{item.action.assigneeId ? adminV1Sr.dashboardScopeMine : adminV1Sr.dashboardUnassigned}</span>
          </p>
        </>
      );
    },
    [byId, now],
  );

  return (
    <>
      {hero === "list" ? (
        <div className={cn("grid gap-3", fullRow)}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            {/* V5 (S4) — the boss of the day and the combo do not depend on the view: here they stand in the row of the count. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
              <ReactionCount count={data.counts?.total ?? null} />
              <div data-dashboard-boss="" className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                <BossBar boss={boss} event={game.bossEvent} className="w-48 max-w-full" />
                <ComboMeter combo={game.view.combo} now={game.now} />
              </div>
            </div>
            <button type="button" onClick={() => dashboardHeroStore.set("constellation")} className={quietButtonClass}>{adminV1Sr.dashboardConstellationShow}</button>
          </div>
          {data.counts ? <SignalStrip counts={data.counts} /> : <ProjectionUnavailable compact />}
        </div>
      ) : (
        <AdminPanel data-admin-reveal="media" data-dashboard-hero="" className={cn(panelClass, "grid @3xl:grid-cols-[minmax(0,1.7fr)_minmax(17rem,1fr)]", fullRow)}>
          <Constellation
            items={stars}
            counts={data.counts}
            now={now}
            hpMax={hpMax}
            backlog={backlog}
            aimed={rowAim}
            onStarHover={setStarAim}
            onPick={onPick}
            tooltip={tooltip}
            onHandle={setHandle}
            // The hero never pushes the list off the first screen: 13 rem on a low window, 15 rem, 20 rem on a tall one.
            className="h-48 @3xl:h-60 @3xl:[@media(max-height:799px)]:h-52 @3xl:[@media(min-height:900px)]:h-80"
          />
          <div className="grid min-w-0 content-start gap-3 border-t border-[var(--admin-border)] p-4 @3xl:border-t-0 @3xl:border-l @3xl:p-5 @3xl:[@media(max-height:799px)]:p-4">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <ReactionCount count={data.counts?.total ?? null} />
                <button type="button" onClick={() => dashboardHeroStore.set("list")} className={cn(quietButtonClass, "-my-2 -mr-2")}>{adminV1Sr.dashboardConstellationHide}</button>
              </div>
              <p className="text-xs leading-4 text-[var(--admin-text-muted)]">{adminV1Sr.dashboardConstellationHint}</p>
            </div>
            {data.counts ? <SignalStrip counts={data.counts} compact /> : <p className="text-sm leading-5 text-[var(--admin-text-muted)]">{adminV1Sr.dashboardProjectionUnavailableTitle}</p>}
            <div data-dashboard-boss="" className="grid min-w-0 gap-2">
              <BossBar boss={boss} event={game.bossEvent} />
              <ComboMeter combo={game.view.combo} now={game.now} />
            </div>
          </div>
        </AdminPanel>
      )}

      <ReactionList data={data} now={now} lit={starAim} onAim={setRowAim} onDialog={open} panelRef={list} />
      {dialog ? <ActionDialog key={dialog.actionItemId} mode={dialog.mode} onOpenChange={(next) => { if (!next) setDialog({ ...dialog, mode: null }); }} actionItemId={dialog.actionItemId} fixture={fixture} onResolved={onResolved} /> : null}
      {hero === "list" ? null : <AimLine aimed={rowAim} handle={handle} quiet={quiet} dialogOpen={dialog?.mode != null} />}
    </>
  );
}

/** The number of items waiting for a reaction: plain text next to the signals, never the title. */
function ReactionCount({ count }: { count: number | null }) {
  const label = count === null
    ? adminV1Sr.dashboardCountUnavailable
    : count === 0
      ? adminV1Sr.dashboardCountZero
      : count === 1
        ? adminV1Sr.dashboardCountOne
        : fmt(adminV1Sr.dashboardCountMany, { count });
  return <p className="text-base font-semibold tracking-[-0.02em]">{label}</p>;
}

/** The four signals: a strip under the count, or (compact) the legend of the Constellation, two by two. */
function SignalStrip({ counts, compact = false }: { counts: NonNullable<ReactionData["counts"]>; compact?: boolean }) {
  const signals: { label: string; value: number; tone: "danger" | "warning" | "neutral" | "success"; title?: string }[] = [
    { label: adminV1Sr.dashboardSignalUrgent, value: counts.urgent, tone: "danger" },
    { label: adminV1Sr.dashboardSignalToday, value: counts.today, tone: "warning" },
    { label: adminV1Sr.dashboardSignalWaitingClient, value: counts.waitingClient, tone: "neutral" },
    { label: adminV1Sr.dashboardSignalCalm, value: counts.calm, tone: "success", title: adminV1Sr.dashboardSignalCalmHelp },
  ];
  const cells = signals.map((signal) => (
    <div key={signal.label} title={signal.title} data-admin-reveal="kpi" data-admin-tilt="" className={cn("flex items-center justify-between gap-3", compact ? "min-h-12 bg-[var(--admin-surface-strong)] px-3 py-2 [@media(max-height:799px)]:min-h-10 [@media(max-height:799px)]:py-1" : "min-h-20 px-4 py-3 @xl:min-h-24 @xl:px-5")}>
      <span className={cn("font-semibold text-[var(--admin-text-muted)]", compact ? "text-xs" : "text-sm")}>{signal.label}</span>
      <span data-tone={signal.tone} className={cn("font-mono font-semibold tracking-[-0.05em] tabular-nums", compact ? "text-2xl" : "text-3xl", signal.tone === "danger" && "text-[var(--admin-danger)]", signal.tone === "warning" && "text-[var(--admin-warning)]", signal.tone === "success" && "text-[var(--admin-success)]")}><AdminOdometer value={signal.value} text={String(signal.value)} /></span>
    </div>
  ));
  // Compact: the gaps of the grid are the dividers (the border colour shows through).
  if (compact) return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-border)]">{cells}</div>;
  return <AdminPanel className={cn(panelClass, "grid grid-cols-2 divide-x divide-y divide-[var(--admin-border)] @xl:grid-cols-4 @xl:divide-y-0")}>{cells}</AdminPanel>;
}

/** The ring of the backlog around the core of the Constellation: the health of the boss of the day; null: not known. */
function bossRing(boss: BossView): BacklogRing | null {
  if (boss.kind === "alive") return { hp: boss.hp, hpMax: boss.hpMax, share: boss.share };
  if (boss.kind === "down") return { hp: 0, hpMax: boss.hpMax, share: 0 };
  return boss.kind === "none" ? { hp: 0, hpMax: 0, share: 0 } : null;
}

function ReactionList({ data, now, lit, onAim, onDialog, panelRef }: {
  data: ReactionData;
  now: number;
  /** The row whose star is under the pointer. */
  lit: string | null;
  onAim: (id: string | null) => void;
  onDialog: (mode: "snooze" | "resolve", item: ReactionItem) => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  if (data.projection === "unavailable") return <AdminPanel ref={panelRef} className={cn(panelClass, "min-h-[28rem] scroll-mt-4", mainColumn)}><ProjectionUnavailable /></AdminPanel>;
  return (
    <AdminPanel ref={panelRef} className={cn(panelClass, "min-h-[28rem] scroll-mt-4", mainColumn)}>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--admin-border)] px-5 py-5 sm:px-6">
        <div><h2 className="text-xl font-semibold tracking-[-0.03em]">{adminV1Sr.dashboardReactionTitle}</h2><p className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">{adminV1Sr.dashboardReactionHint}</p></div>
        <AlertTriangle className="mt-1 size-5 text-[var(--admin-danger)]" aria-hidden="true" />
      </div>
      {data.items.length === 0 ? <AdminEmptyState title={adminV1Sr.dashboardReactionEmptyTitle} body={adminV1Sr.dashboardReactionEmptyBody} className="min-h-[22rem]" /> : <ol data-admin-reveal="rows" className="divide-y divide-[var(--admin-border)]">{data.items.map((item) => <ReactionRow key={item.action.causeId} item={item} now={now} lit={lit === item.action.causeId} onAim={onAim} onDialog={onDialog} />)}</ol>}
      {data.capped ? <p className="border-t border-[var(--admin-border)] px-5 py-3 text-xs font-semibold text-[var(--admin-text-muted)]">{adminV1Sr.dashboardMoreActions}</p> : null}
    </AdminPanel>
  );
}

function ReactionRow({ item, now, lit, onAim, onDialog }: { item: ReactionItem; now: number; lit: boolean; onAim: (id: string | null) => void; onDialog: (mode: "snooze" | "resolve", item: ReactionItem) => void }) {
  const id = item.action.causeId;
  const causeLabel = causeTitle(item.action.source.domain);
  return (
    <li
      data-reaction-row={id}
      {...(lit ? { "data-lit": "" } : {})}
      // The pointer of a mouse or the focus of the keyboard aims at the star of the row; a touch does not.
      onPointerEnter={(event) => { if (event.pointerType !== "touch") onAim(id); }}
      onPointerLeave={(event) => { if (event.pointerType !== "touch") onAim(null); }}
      onFocus={() => onAim(id)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onAim(null); }}
      className={cn("grid gap-3 px-4 py-4 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6", lit && "bg-[var(--admin-surface-muted)]")}
    >
      <span data-reaction-dot="" className={cn("mt-1 size-2.5 rounded-full sm:mt-0", item.action.severity === "blocking" ? "bg-[var(--admin-danger)]" : item.action.severity === "warning" ? "bg-[var(--admin-warning)]" : "bg-[var(--admin-text-muted)]")} aria-hidden="true" />
      <div className="min-w-0"><p className="font-semibold tracking-[-0.015em]">{item.action.description ?? causeLabel}</p><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--admin-text-muted)]"><span>{reactionContext(item) || causeLabel}</span><span>{relativeTime(item.action.relevantAt, now)}</span><span>{item.action.assigneeId ? adminV1Sr.dashboardScopeMine : adminV1Sr.dashboardUnassigned}</span></div></div>
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        <button type="button" onClick={() => onDialog("snooze", item)} className={linkClass}><Pause className="size-4" aria-hidden="true" />{adminV1Sr.dashboardSnooze}</button>
        {item.action.resolutionRule === "manual_problem_resolution" ? <button type="button" onClick={() => onDialog("resolve", item)} className={adminPrimaryButtonClass}>{adminV1Sr.dashboardResolve}</button> : <Link href={item.href} className={adminPrimaryButtonClass}>{adminV1Sr.dashboardResolve}<ArrowUpRight className="size-4" aria-hidden="true" /></Link>}
      </div>
    </li>
  );
}

/** The hero must show at least this share of itself for the line to point at a star the eye can find. */
const AIM_HERO_SHARE = 0.5;

/**
 * V5 (S8) — may the aim line be drawn? Only while a row is aimed at, no dialog of the list is open
 * („Reši“ and „Odloži“ took the aim away), no ceremony is on the screen (the line would cut across
 * it) and the hero is on the screen (otherwise the line points to a star above the visible screen).
 */
export function aimLineVisible({ aimed, dialogOpen, ceremony, heroVisible }: { aimed: string | null; dialogOpen: boolean; ceremony: "big" | "card" | null; heroVisible: boolean }): boolean {
  return aimed !== null && !dialogOpen && ceremony === null && heroVisible;
}

/**
 * The aim line: from the dot of a row to its star, drawn over the grid of the Dashboard. Decoration
 * only (the row and the star are both lit without it); it is measured, never animated in place.
 */
function AimLine({ aimed, handle, quiet, dialogOpen }: { aimed: string | null; handle: ConstellationHandle | null; quiet: boolean; dialogOpen: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const [line, setLine] = useState<{ id: string; d: string } | null>(null);
  const ceremony = useSyncExternalStore(ceremonySignal.subscribe, ceremonySignal.get, ceremonySignal.getServer);
  const host = handle?.host ?? null;
  // What the observer last said, with the host it said it about (another host has not been seen yet).
  const [seenHero, setSeenHero] = useState<{ host: HTMLElement; visible: boolean } | null>(null);

  // The hero on the screen: the line is drawn only while at least half of it is.
  useEffect(() => {
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setSeenHero({ host, visible: entry.isIntersecting && entry.intersectionRatio >= AIM_HERO_SHARE }), { threshold: [0, AIM_HERO_SHARE] });
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);
  const heroVisible = host !== null && (typeof IntersectionObserver === "undefined" || (seenHero?.host === host && seenHero.visible));

  const active = aimLineVisible({ aimed, dialogOpen, ceremony, heroVisible }) ? aimed : null;
  useEffect(() => {
    const element = svg.current;
    if (!active || !handle?.host || !element) return;
    const host = handle.host;
    const measure = () => {
      const dot = element.parentElement?.querySelector(`[data-reaction-row="${CSS.escape(active)}"] [data-reaction-dot]`);
      const panel = dot?.closest('[data-admin-primitive="panel"]');
      const star = handle.project(active);
      if (!dot || !panel || !star) return setLine(null);
      const origin = element.getBoundingClientRect();
      const from = dot.getBoundingClientRect();
      const stage = host.getBoundingClientRect();
      const fixed = (value: number) => value.toFixed(1);
      const x1 = from.left + from.width / 2 - origin.left;
      const y1 = from.top + from.height / 2 - origin.top;
      const x2 = stage.left + star.x - origin.left;
      const y2 = stage.top + star.y - origin.top;
      // Up the inner edge of the list, left of its text, then into the scene: the line never crosses a word.
      const rail = panel.getBoundingClientRect().left + 10 - origin.left;
      const turn = Math.min(8, Math.abs(x1 - rail));
      const top = stage.bottom - origin.top;
      const bend = (top - y2) * 0.5;
      setLine({
        id: active,
        d: `M${fixed(x1)} ${fixed(y1)} L${fixed(rail + turn)} ${fixed(y1)} Q${fixed(rail)} ${fixed(y1)} ${fixed(rail)} ${fixed(y1 - turn)} L${fixed(rail)} ${fixed(top)} C${fixed(rail)} ${fixed(top - bend)} ${fixed(x2)} ${fixed(y2 + bend)} ${fixed(x2)} ${fixed(y2)}`,
      });
    };
    // The observer measures once at the start and again whenever the grid changes its size.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, handle]);

  const shown = active && line?.id === active ? line : null;
  useAdminGsap(({ reduced }) => {
    if (!shown || reduced || quiet || !path.current) return;
    adminMotion().gsap.fromTo(path.current, { drawSVG: "0%" }, { drawSVG: "100%", duration: ADMIN_DURATION.state, ease: ADMIN_EASE.out });
    // Drawn once per row, not on every new measure.
  }, [shown?.id, quiet]);

  return (
    <svg ref={svg} aria-hidden="true" focusable="false" data-dashboard-aim="" className="pointer-events-none absolute inset-0 z-[1] size-full overflow-visible">
      {shown ? <path ref={path} d={shown.d} fill="none" stroke="var(--admin-text)" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" /> : null}
    </svg>
  );
}

function orbitLabel(orbit: OrbitIndex) {
  if (orbit === 1) return adminV1Sr.dashboardSignalUrgent;
  if (orbit === 2) return adminV1Sr.dashboardSignalToday;
  if (orbit === 3) return adminV1Sr.dashboardConstellationWaiting;
  return adminV1Sr.dashboardSignalCalm;
}

const reactionContext = (item: ReactionItem) => [item.contextLabel, item.contextCode].filter(Boolean).join(" · ");

function ActionDialog({ mode, onOpenChange, actionItemId, fixture, onResolved }: { mode: "snooze" | "resolve" | null; onOpenChange: (open: boolean) => void; actionItemId: Id<"actionItems">; fixture: boolean; onResolved: (actionItemId: Id<"actionItems">) => void }) {
  const snooze = useMutation(api.adminActions.snoozeFromDashboard);
  const resolve = useMutation(api.adminActions.resolveManualFromDashboard);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function submit() {
    setPending(true); setError(false);
    try {
      if (fixture) {
        onOpenChange(false); setReason(""); setUntil("");
        if (mode === "resolve") onResolved(actionItemId);
        return;
      }
      if (mode === "snooze") await snooze({ actionItemId, reason, until: new Date(until).getTime() });
      else if (mode === "resolve") {
        await resolve({ actionItemId, note: reason });
        onResolved(actionItemId);
      }
      onOpenChange(false); setReason(""); setUntil("");
    } catch { setError(true); } finally { setPending(false); }
  }
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="admin-v1 rounded-[var(--admin-radius-panel)] border-[var(--admin-border)] bg-[var(--admin-surface-strong)] text-[var(--admin-text)]">
        <DialogHeader><DialogTitle>{mode === "snooze" ? adminV1Sr.dashboardSnoozeTitle : adminV1Sr.dashboardResolveTitle}</DialogTitle><DialogDescription>{mode === "snooze" ? adminV1Sr.dashboardSnoozeReason : adminV1Sr.dashboardResolveNote}</DialogDescription></DialogHeader>
        <label className="grid gap-2 text-sm font-semibold">{mode === "snooze" ? adminV1Sr.dashboardSnoozeReason : adminV1Sr.dashboardResolveNote}<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={mode === "snooze" ? adminV1Sr.dashboardSnoozeReasonPlaceholder : adminV1Sr.dashboardResolveNotePlaceholder} rows={4} className="min-h-24 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-app)] px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-ink)]" /></label>
        {mode === "snooze" ? <label className="grid gap-2 text-sm font-semibold">{adminV1Sr.dashboardSnoozeUntil}<input type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-app)] px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-ink)]" /></label> : null}
        {error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{adminV1Sr.dashboardMutationError}</p> : null}
        <DialogFooter><DialogClose asChild><button type="button" className={linkClass}>{adminV1Sr.dashboardCancel}</button></DialogClose><button type="button" disabled={pending || !reason.trim() || (mode === "snooze" && !until)} onClick={() => void submit()} className={adminPrimaryButtonClass}>{mode === "snooze" ? adminV1Sr.dashboardSnoozeConfirm : adminV1Sr.dashboardResolveConfirm}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionLive() { const data = useQuery(api.adminDashboard.subscriptions); return data ? <SubscriptionWidget data={data} /> : <RingLoading />; }
function SubscriptionWidget({ data }: { data: SubscriptionData }) {
  if (!data.counts) return <SmallUnavailable title={adminV1Sr.dashboardSubscriptionsTitle} />;
  return <RingWidget icon={<WalletCards className="size-5" aria-hidden="true" />} title={adminV1Sr.dashboardSubscriptionsTitle} total={data.counts.total} totalLabel={adminV1Sr.dashboardSubscriptionsTotal} segments={[{ label: adminV1Sr.dashboardSubscriptionsActive, value: data.counts.active, tone: "success" }, { label: adminV1Sr.dashboardSubscriptionsGrace, value: data.counts.grace, tone: "warning" }, { label: adminV1Sr.dashboardSubscriptionsSuspended, value: data.counts.suspended, tone: "danger" }, { label: adminV1Sr.dashboardSubscriptionsInactive, value: data.counts.inactive, tone: "neutral" }]} footer={data.counts.warning ? `${data.counts.warning} · ${adminV1Sr.dashboardSubscriptionsWarning}` : undefined} />;
}

function ProductLive() { const data = useQuery(api.adminDashboard.products); return data ? <ProductWidget data={data} /> : <RingLoading />; }
function ProductWidget({ data }: { data: ProductData }) {
  if (!data.counts) return <SmallUnavailable title={adminV1Sr.dashboardProductsTitle} />;
  return <RingWidget icon={<QrCode className="size-5" aria-hidden="true" />} title={adminV1Sr.dashboardProductsTitle} total={data.counts.total} totalLabel={adminV1Sr.dashboardProductsTotal} segments={[{ label: adminV1Sr.dashboardProductsActive, value: data.counts.active, tone: "success" }, { label: adminV1Sr.dashboardProductsProblem, value: data.counts.problem, tone: "danger" }, { label: adminV1Sr.dashboardProductsInactive, value: data.counts.inactive, tone: "neutral" }]} footer={`${adminV1Sr.dashboardProductsQr} ${data.counts.qr} · ${adminV1Sr.dashboardProductsNfc} ${data.counts.nfc}`} />;
}

function RingWidget({ icon, title, total, totalLabel, segments, footer }: { icon: ReactNode; title: string; total: number; totalLabel: string; segments: { label: string; value: number; tone: "success" | "warning" | "danger" | "neutral" }[]; footer?: string }) {
  const denominator = Math.max(total, 1);
  const ringMaskId = useId();
  return (
    <AdminPanel className={cn(panelClass, "h-full min-h-[21rem] p-5")}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-[-0.025em]">{title}</h2><span className="text-[var(--admin-text-muted)]">{icon}</span></div>
      <div className="relative mx-auto mt-5 aspect-square w-36"><svg viewBox="0 0 120 120" data-admin-draw="ring" className="size-full -rotate-90" role="img" aria-label={`${title}: ${total} ${totalLabel}`}><AdminRingMask id={ringMaskId} size={120} r={46} strokeWidth={12} /><circle cx="60" cy="60" r="46" fill="none" stroke="var(--admin-surface-muted)" strokeWidth="12" /><g mask={`url(#${ringMaskId})`}>{segments.map((segment, index) => { const length = (segment.value / denominator) * 289; const offset = segments.slice(0, index).reduce((sum, previous) => sum + (previous.value / denominator) * 289, 0); return <circle key={segment.label} cx="60" cy="60" r="46" fill="none" strokeWidth="12" stroke={toneColor(segment.tone)} strokeDasharray={`${length} ${289 - length}`} strokeDashoffset={-offset} />; })}</g></svg><div className="absolute inset-0 grid place-content-center text-center"><strong className="font-mono text-4xl tracking-[-0.06em] tabular-nums"><AdminOdometer value={total} text={String(total)} /></strong><span className="text-xs font-semibold text-[var(--admin-text-muted)]">{totalLabel}</span></div></div>
      <ul className="mt-5 grid gap-2 text-xs">{segments.map((segment) => <li key={segment.label} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: toneColor(segment.tone) }} aria-hidden="true" />{segment.label}</span><strong className="font-mono tabular-nums">{segment.value}</strong></li>)}</ul>
      {footer ? <p className="mt-4 border-t border-[var(--admin-border)] pt-3 text-xs text-[var(--admin-text-muted)]">{footer}</p> : null}
    </AdminPanel>
  );
}

function FinanceLive({ now }: { now: number }) { const data = useQuery(api.adminFinance.overview, { now, collectedPeriod: "month", expectedPeriod: "next_month", filter: "total", profitFilter: "total" }); return data ? <FinanceWidget data={data} /> : <PanelLoading />; }
function FinanceWidget({ data }: { data: FinanceData }) {
  return <AdminPanel className={cn(panelClass, "@container h-full p-5 sm:p-6")}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-[-0.025em]">{adminV1Sr.dashboardFinanceTitle}</h2><CircleDollarSign className="size-5 text-[var(--admin-text-muted)]" aria-hidden="true" /></div><dl className="mt-6 grid gap-5 @md:grid-cols-3"><MoneyFact label={adminV1Sr.dashboardFinanceCollected} value={data.collected.amount.amountMinor} /><MoneyFact label={adminV1Sr.dashboardFinanceExpected} value={data.expected.amount.amountMinor} /><MoneyFact label={adminV1Sr.dashboardFinanceProfit} value={data.profit.amount?.amountMinor ?? null} hint={!data.profit.complete ? adminV1Sr.dashboardFinanceProfitUnavailable : undefined} /></dl><Link href="/admin/finansije" className={cn(linkClass, "mt-5 px-0")}>{adminV1Sr.dashboardFinanceOpen}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></AdminPanel>;
}
function MoneyFact({ label, value, hint }: { label: string; value: number | null; hint?: string }) { return <div data-admin-reveal="kpi" data-admin-tilt=""><dt className="text-xs font-semibold text-[var(--admin-text-muted)]">{label}</dt><dd {...(value === null ? {} : { "data-admin-count": "" })} className="mt-1 font-mono text-xl font-semibold tracking-[-0.04em] tabular-nums">{value === null ? "—" : money(value)}</dd>{hint ? <p className="mt-1 text-xs leading-4 text-[var(--admin-warning)]">{hint}</p> : null}</div>; }

function TasksLive({ now, scope }: { now: number; scope: DashboardScope }) { const data = useQuery(api.adminTasks.dashboardAdapter, { now, limit: 4 }); return data ? <TasksWidget data={data} scope={scope} /> : <PanelLoading />; }
function TasksWidget({ data, scope }: { data: TaskData; scope: DashboardScope }) {
  const live = useMemo(() => ({ missions: taskMissions(data) }), [data]);
  useAdminSidebarLive(live);
  const source = scope === "mine" ? data.mine : { items: [...data.overdue.items, ...data.today.items].filter((item, index, rows) => rows.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 4), capped: data.overdue.capped || data.today.capped || data.overdue.items.length + data.today.items.length > 4 };
  return <AdminPanel className={cn(panelClass, "h-full p-5 sm:p-6")}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-[-0.025em]">{adminV1Sr.dashboardTasksTitle}</h2><CheckSquare2 className="size-5 text-[var(--admin-text-muted)]" aria-hidden="true" /></div>{source.items.length ? <ul data-admin-reveal="rows" className="mt-4 divide-y divide-[var(--admin-border)]">{source.items.map((task) => <li key={task.id} className="py-3"><Link href={task.subjectHref ?? "/admin/zadaci"} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"><span className="line-clamp-2 text-sm font-semibold">{task.title}</span><span className="mt-1 flex items-center gap-2 text-xs text-[var(--admin-text-muted)]"><Clock3 className="size-3.5" aria-hidden="true" />{task.timePhase === "overdue" ? adminV1Sr.dashboardTasksOverdue : task.timePhase === "today" ? adminV1Sr.dashboardTasksToday : task.assigneeName}</span></Link></li>)}</ul> : <p className="mt-8 text-sm text-[var(--admin-text-muted)]">{adminV1Sr.dashboardTasksEmpty}</p>}{source.capped ? <p className="mt-2 text-xs font-semibold text-[var(--admin-text-muted)]">{adminV1Sr.dashboardMoreActions}</p> : null}<Link href="/admin/zadaci" className={cn(linkClass, "mt-3 px-0")}>{adminV1Sr.dashboardTasksOpen}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></AdminPanel>;
}

function InboxLive({ now }: { now: number }) { const data = useQuery(api.adminDashboard.inbox, { limit: 4 }); return data ? <InboxWidget data={data} now={now} /> : <PanelLoading />; }
function InboxWidget({ data, now }: { data: InboxData; now: number }) {
  const live = useMemo(() => ({ missions: inboxMissions(data) }), [data]);
  useAdminSidebarLive(live);
  return <AdminPanel className={cn(panelClass, "h-full p-5 sm:p-6")}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-[-0.025em]">{adminV1Sr.dashboardInboxTitle}</h2><Inbox className="size-5 text-[var(--admin-text-muted)]" aria-hidden="true" /></div>{!data.provider ? <p className="mt-3 rounded-xl bg-[var(--admin-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--admin-warning)]">{adminV1Sr.dashboardInboxProviderUnavailable}</p> : <p className="mt-3 text-xs text-[var(--admin-text-muted)]">{fmt(adminV1Sr.dashboardInboxProviderState, { state: data.provider.operationalState })}</p>}{data.items.length ? <ul data-admin-reveal="rows" className="mt-3 divide-y divide-[var(--admin-border)]">{data.items.map((item) => <li key={item.id} className="py-3"><Link href={item.href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"><span className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{item.contactName}</strong>{item.unreadCount ? <AdminStatus tone="problem" label={fmt(adminV1Sr.dashboardUnread, { count: item.unreadCount })} className="shrink-0" /> : null}</span><span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">{item.accountName} · {relativeTime(item.latestMessageAt, now)}</span><span className="mt-1 line-clamp-1 text-xs text-[var(--admin-text-muted)]">{item.preview}</span></Link></li>)}</ul> : <p className="mt-8 text-sm text-[var(--admin-text-muted)]">{adminV1Sr.dashboardInboxEmpty}</p>}{data.capped ? <p className="mt-2 text-xs font-semibold text-[var(--admin-text-muted)]">{adminV1Sr.dashboardMoreActions}</p> : null}<Link href="/admin/inbox" className={cn(linkClass, "mt-3 px-0")}>{adminV1Sr.dashboardInboxOpen}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></AdminPanel>;
}

function ProjectionUnavailable({ compact = false }: { compact?: boolean }) { return compact ? <AdminPanel className={cn(panelClass, "px-5 py-4")}><p className="font-semibold">{adminV1Sr.dashboardProjectionUnavailableTitle}</p><p className="mt-1 text-sm text-[var(--admin-text-muted)]">{adminV1Sr.dashboardProjectionUnavailableBody}</p></AdminPanel> : <AdminEmptyState title={adminV1Sr.dashboardProjectionUnavailableTitle} body={adminV1Sr.dashboardProjectionUnavailableBody} className="min-h-[28rem]" />; }
function SmallUnavailable({ title }: { title: string }) { return <AdminPanel className={cn(panelClass, "h-full min-h-[21rem] p-5")}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-5 text-sm leading-6 text-[var(--admin-text-muted)]">{adminV1Sr.dashboardProjectionUnavailableBody}</p></AdminPanel>; }
function PanelLoading() { return <AdminPanel className={cn(panelClass, "min-h-64")}><AdminLoadingState /></AdminPanel>; }
function RingLoading() { return <AdminPanel className={cn(panelClass, "min-h-[21rem]")}><AdminLoadingState /></AdminPanel>; }

class DashboardWidgetBoundary extends Component<{ children: ReactNode; className?: string }, { failed: boolean; resetKey: number }> {
  state = { failed: false, resetKey: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {}
  render() {
    if (this.state.failed) return <AdminPanel className={cn(panelClass, "min-h-56")}><AdminErrorState title={adminV1Sr.dashboardWidgetErrorTitle} body={adminV1Sr.dashboardWidgetErrorBody} /><button type="button" onClick={() => this.setState((state) => ({ failed: false, resetKey: state.resetKey + 1 }))} className={cn(linkClass, "mx-auto mb-5 flex")}><RotateCcw className="size-4" aria-hidden="true" />{adminV1Sr.retryAction}</button></AdminPanel>;
    return <div key={this.state.resetKey} className={this.props.className ?? "min-w-0"}>{this.props.children}</div>;
  }
}

function FixtureWidgetFailure() {
  const client = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (client) throw new Error("dashboard_fixture_widget_failure");
  return <RingLoading />;
}

function causeTitle(domain: ReactionData["items"][number]["action"]["source"]["domain"]) {
  const labels = { subscription: adminV1Sr.dashboardCauseSubscription, task: adminV1Sr.dashboardCauseTask, order: adminV1Sr.dashboardCauseOrder, physical_product: adminV1Sr.dashboardCauseQrNfc, qr_nfc: adminV1Sr.dashboardCauseQrNfc, inbox: adminV1Sr.dashboardCauseEmail, service_activation_request: adminV1Sr.dashboardCauseActivation, manual_problem: adminV1Sr.dashboardCauseManual } as const;
  return labels[domain] ?? adminV1Sr.dashboardCauseOther;
}
function relativeTime(time: number, now: number) { const minutes = Math.round((time - now) / 60_000); const formatter = new Intl.RelativeTimeFormat("sr-Latn-RS", { numeric: "auto" }); if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute"); const hours = Math.round(minutes / 60); if (Math.abs(hours) < 24) return formatter.format(hours, "hour"); return formatter.format(Math.round(hours / 24), "day"); }
function money(amountMinor: number) { return new Intl.NumberFormat("sr-Latn-RS", { style: "currency", currency: "RSD", maximumFractionDigits: 0 }).format(amountMinor / 100); }
function toneColor(tone: "success" | "warning" | "danger" | "neutral") { if (tone === "success") return "var(--admin-success)"; if (tone === "warning") return "var(--admin-warning)"; if (tone === "danger") return "var(--admin-danger)"; return "var(--admin-text-muted)"; }
