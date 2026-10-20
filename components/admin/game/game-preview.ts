import type { GamePreviewControls } from "@/components/admin/game/game-context";
import type { GameStored } from "@/lib/admin-v2/game/engine";
import { createGameStore, type GameStore } from "@/lib/admin-v2/game/store";
import type { ActivityRow, BossCounts, TeamJournal, TeamMember } from "@/lib/admin-v2/game/types";

// ADMIN v3 V4 — the TEST game of a dev preview: a store filled from a fixture
// the preview page gives, and what that page may do to it. No TEST data lives
// here (the frame of the real admin imports this file; the fixtures are in
// game-fixtures.ts, which only the dev routes import). Nothing is read from the
// server and nothing is written to the browser. A button of a preview feeds the
// same engine the real admin feeds, so a level, a hit on the boss or a ceremony
// seen in a preview is worked out, never staged.

export type GameFixture = {
  userId: string;
  now: number;
  stored: GameStored;
  counts: BossCounts | null;
  team: { members: TeamMember[]; journals: Record<string, TeamJournal> };
};

export const PREVIEW_ACTIONS = {
  resolved: "admin_v1_problem_resolved",
  reply: "admin_v1_conversation_reply_sent",
  task: "admin_v1_task_completed",
  delivery: "admin_order_delivery_completed",
} as const;

export const previewRow = (action: string, at: number, href: string): ActivityRow => ({ id: `test:${at}:${href}`, action, actorKind: "admin", occurredAt: at, href });

export function createPreviewGame(fixture: GameFixture): { store: GameStore; controls: GamePreviewControls; arm(): void } {
  // The clock stands at the moment of the fixture until the page is in the browser, so the server and the
  // first client render draw the same thing; then it runs.
  let armedAt: number | null = null;
  const clock = () => (armedAt === null ? fixture.now : fixture.now + (performance.now() - armedAt));
  const store = createGameStore({ clock });
  let counts = fixture.counts;
  let journals = fixture.team.journals;
  let acts = 0;

  const fill = () => {
    counts = fixture.counts;
    journals = fixture.team.journals;
    store.start(fixture.userId, fixture.stored);
    store.dispatch({ type: "journal", rows: [], initial: true });
    store.dispatch({ type: "counts", counts });
    store.dispatch({ type: "team", members: fixture.team.members, journals });
  };
  fill();

  const setCounts = (next: BossCounts | null) => {
    counts = next;
    store.dispatch({ type: "counts", counts });
  };
  const act = (kind: keyof typeof PREVIEW_ACTIONS) => {
    acts += 1;
    const mine = previewRow(PREVIEW_ACTIONS[kind], Math.round(clock()), `/admin/test/act-${acts}`);
    store.dispatch({ type: "journal", rows: [mine] });
    // The table of the team follows my own row, as it does in the admin.
    const own = journals[fixture.userId];
    if (!own) return;
    journals = { ...journals, [fixture.userId]: { ...own, rows: [...own.rows, mine] } };
    store.dispatch({ type: "team", members: fixture.team.members, journals });
  };

  return {
    store,
    arm() {
      armedAt ??= performance.now();
    },
    controls: {
      act(kind) {
        act(kind);
        if (kind === "resolved" && counts && counts.urgent > 0) setCounts({ ...counts, urgent: counts.urgent - 1 });
      },
      setCounts,
      backlog() {
        if (counts) setCounts({ ...counts, urgent: counts.urgent + 1 });
      },
      clearBacklog() {
        act("resolved");
        setCounts({ urgent: 0, needsReply: 0, today: 0 });
      },
      reset: fill,
    },
  };
}
