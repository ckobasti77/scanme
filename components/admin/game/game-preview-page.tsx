"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import { countOf, hourLabel } from "@/lib/admin-v2/analytics/format";
import { fairChain, fairChallenges } from "@/lib/admin-v2/game/fair-missions";
import type { FairChainInput, FairChallengeInput } from "@/lib/admin-v2/game/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { FairChain } from "./fair-chain";
import { FairChallenges } from "./fair-challenges";
import { useGameApi } from "./game-context";
import { GameBoss, GameOperator, GameTeam } from "./game-parts";

// ADMIN v3 V4 — the dev page of the game (`/dev/admin-igra-preview`): every
// state of the game with TEST data. A button does what real work would do (a
// TEST row of the journal, a TEST change of the backlog), so what follows (XP,
// a hit on the boss, a level, a ceremony) is worked out by the same engine the
// admin runs. `?igra=<state>` presses one of them after the page has loaded.

const demo = d.demo;
const records = adminEventsSr.analytics.v2;

/** The preparation of a TEST fair: two nodes lit, two in progress. */
const CHAIN: FairChainInput = {
  kpis: { models: { published: 18, total: 18 }, questions: { covered: 2, required: 3 } },
  sections: { modeli: { withErrors: 0 }, qr: { publishedWithoutQr: 5, onWithdrawn: 0 }, izlagaci: { active: 6, total: 6 }, leadovi: { followUpActive: 1, followUpNeeded: 4 } },
};

/** The second day of a TEST fair, a little after eleven. */
const CHALLENGES: FairChallengeInput = {
  dayIndex: 2,
  todayKey: "test-dan-2",
  yesterdayKey: "test-dan-1",
  hour: 11,
  scansToday: 64,
  leadsToday: 0,
  urgentOpen: 2,
  hours: [
    { dateKey: "test-dan-1", hour: 9, scans: 14 },
    { dateKey: "test-dan-1", hour: 10, scans: 22 },
    { dateKey: "test-dan-1", hour: 11, scans: 29 },
    { dateKey: "test-dan-1", hour: 14, scans: 47 },
    { dateKey: "test-dan-2", hour: 9, scans: 19 },
    { dateKey: "test-dan-2", hour: 10, scans: 27 },
    { dateKey: "test-dan-2", hour: 11, scans: 18 },
  ],
};

type Trigger = keyof typeof demo.buttons;
const TRIGGERS: readonly Trigger[] = ["resolve", "combo", "level", "badge", "epicBadge", "boss", "record", "many", "newBacklog", "vitrina", "reset"];
/** `?igra=` → the button it presses. */
const BY_PARAM: Readonly<Record<string, Trigger>> = { nivo: "level", rang: "level", znacka: "badge", epska: "epicBadge", sef: "boss", kombo: "combo", rekord: "record", vise: "many", vitrina: "vitrina", zaostatak: "newBacklog" };
const AUTO_DELAY_MS = 400;
/** The key of the TEST event the preview reports the fair facts of. */
const PREVIEW_EVENT = "test-sajam";

export function GamePreviewPage({ igra }: { igra?: string }) {
  const game = useGameApi();
  const recordSeq = useRef(0);

  const run = (trigger: Trigger, from?: { x: number; y: number }) => {
    const preview = game.preview;
    if (!preview) return;
    const record = () =>
      game.celebrate({ key: `test-rekord-${++recordSeq.current}`, title: fmt(records.records.toastHour, { scans: countOf(57 + recordSeq.current, records.units.scans), hour: hourLabel(14) }) });
    if (from) game.aim(from);
    if (trigger === "resolve" || trigger === "level") preview.act("resolved");
    else if (trigger === "combo") {
      preview.act("reply");
      preview.act("task");
      preview.act("resolved");
    } else if (trigger === "badge") preview.act("delivery");
    else if (trigger === "epicBadge") {
      // The state first (an hour record below 100), then the rise: only a rise seen while the page is open is news.
      game.reportFair({ event: PREVIEW_EVENT, ended: false, facts: { hourRecord: 90 } });
      game.reportFair({ event: PREVIEW_EVENT, ended: false, facts: { hourRecord: 120 } });
    }
    else if (trigger === "boss") preview.clearBacklog();
    else if (trigger === "record") record();
    else if (trigger === "many") {
      preview.clearBacklog();
      preview.act("delivery");
      record();
    } else if (trigger === "newBacklog") preview.backlog();
    else if (trigger === "vitrina") game.openVitrina();
    else preview.reset();
  };
  const press = (trigger: Trigger) => (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    run(trigger, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
  };

  const auto = igra ? BY_PARAM[igra] : undefined;
  const pressed = useRef(false);
  useEffect(() => {
    if (!auto || pressed.current) return;
    const timer = window.setTimeout(() => {
      pressed.current = true;
      run(auto);
    }, AUTO_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Pressed once, after the page has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <div className="grid w-full min-w-0 gap-5 sm:gap-6">
      <AdminPageHeader title={demo.title} description={demo.description} badge={<AdminStatus tone="waiting" label={demo.badge} />} />
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <AdminPanel className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
          <h2 className="text-lg font-semibold tracking-[-0.025em]">{demo.statesTitle}</h2>
          <GameOperator className="rounded-xl border border-[var(--admin-border)]" />
          <GameBoss />
        </AdminPanel>
        <AdminPanel className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
          <h2 className="text-lg font-semibold tracking-[-0.025em]">{demo.actionsTitle}</h2>
          <div className="flex min-w-0 flex-wrap gap-2">
            {TRIGGERS.map((trigger) => (
              <button key={trigger} type="button" data-igra={trigger} onClick={press(trigger)} className={adminSecondaryButtonClass}>
                {demo.buttons[trigger]}
              </button>
            ))}
          </div>
        </AdminPanel>
      </div>
      <GameTeam variant="full" />
      <section aria-label={demo.fairTitle} className="grid min-w-0 gap-5">
        <FairChain nodes={fairChain(CHAIN)} />
        <FairChallenges items={fairChallenges(CHALLENGES)} />
      </section>
    </div>
  );
}
