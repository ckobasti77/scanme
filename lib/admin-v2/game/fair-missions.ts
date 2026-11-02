// ADMIN v3 V4 — the missions of a fair (plan §6.8). Pure: the map before the
// opening (a chain of nodes lit one by one from what `getEventDashboard`
// already says) and the daily challenges while the fair runs (rules over the
// hourly scans, never an invented number). A node or a challenge whose data is
// not there is left out, not shown at zero.

import type { FairChallenge, FairChallengeInput, FairChainInput, FairNode } from "./types";

type State = FairNode["state"];

const node = (id: FairNode["id"], state: State, done: number, total: number): FairNode => ({ id, state, done, total });

/** The mission map in the order of the chain; the last node is lit when all before it are. */
export function fairChain(input: FairChainInput): FairNode[] {
  const { kpis, sections } = input;
  const nodes: FairNode[] = [];

  const models = kpis.models;
  nodes.push(node("katalog", models.total === 0 ? "locked" : models.published === models.total && sections.modeli.withErrors === 0 ? "lit" : "open", models.published, models.total));

  const stickers = sections.qr;
  const stickerTotal = models.published;
  nodes.push(
    node(
      "nalepnice",
      stickerTotal === 0 ? "locked" : stickers.publishedWithoutQr === 0 && stickers.onWithdrawn === 0 ? "lit" : "open",
      Math.max(0, stickerTotal - stickers.publishedWithoutQr),
      stickerTotal,
    ),
  );

  const exhibitors = sections.izlagaci;
  nodes.push(node("izlagaci", exhibitors.total === 0 ? "locked" : exhibitors.active === exhibitors.total ? "lit" : "open", exhibitors.active, exhibitors.total));

  const questions = kpis.questions;
  if (questions !== null && questions.required > 0) {
    nodes.push(node("pitanja", questions.covered >= questions.required ? "lit" : "open", Math.min(questions.covered, questions.required), questions.required));
  }

  const leads = sections.leadovi;
  if (leads !== null && leads.followUpNeeded > 0) {
    const done = Math.min(leads.followUpActive, leads.followUpNeeded);
    nodes.push(node("leadovi", done === leads.followUpNeeded ? "lit" : "open", done, leads.followUpNeeded));
  }

  const lit = nodes.filter((item) => item.state === "lit").length;
  nodes.push(node("spremno", lit === nodes.length && nodes.length > 0 ? "lit" : "locked", lit, nodes.length));
  return nodes;
}

/** The fair is ready when the last node of the chain is lit. */
export function fairReady(nodes: readonly FairNode[]): boolean {
  return nodes.some((item) => item.id === "spremno" && item.state === "lit");
}

type Hours = NonNullable<FairChallengeInput["hours"]>;

const sum = (hours: Hours, pick: (row: Hours[number]) => boolean) => hours.reduce((total, row) => (pick(row) ? total + row.scans : total), 0);

/** The daily challenges, in the order of FAIR_CHALLENGE_IDS. */
export function fairChallenges(input: FairChallengeInput): FairChallenge[] {
  const { yesterdayKey, todayKey, hour, hours } = input;
  const out: FairChallenge[] = [];
  const add = (id: FairChallenge["id"], value: number, goal: number, done: boolean, missed = false) => out.push({ id, value, target: goal, done, missed });

  if (yesterdayKey === null) {
    for (const [id, goal] of [["skenovi_10", 10], ["skenovi_50", 50], ["skenovi_100", 100]] as const) add(id, input.scansToday, goal, input.scansToday >= goal);
    if (hours !== null) {
      const value = sum(hours, (row) => row.dateKey === todayKey && row.hour < 12);
      const done = value >= 50;
      add("pre_podne_50", value, 50, done, hour >= 12 && !done);
    }
    return out;
  }

  if (hours !== null) {
    const before = sum(hours, (row) => row.dateKey === yesterdayKey && row.hour < 12);
    if (before > 0) {
      const value = sum(hours, (row) => row.dateKey === todayKey && row.hour < 12);
      const done = value > before;
      add("prestigni_prepodne", value, before, done, hour >= 12 && !done);
    }
    const record = hours.reduce((best, row) => (row.dateKey < todayKey ? Math.max(best, row.scans) : best), 0);
    if (record > 0) {
      const value = hours.reduce((best, row) => (row.dateKey === todayKey ? Math.max(best, row.scans) : best), 0);
      add("obori_rekord_sata", value, record, value > record);
    }
  }
  if (input.leadsToday !== null) {
    const value = Math.min(input.leadsToday, 1);
    add("prvi_lead_danas", value, 1, value >= 1);
  }
  const clear = input.urgentOpen === 0;
  add("hitni_na_nuli", input.urgentOpen, 0, clear, hour >= 14 && !clear);
  return out;
}
