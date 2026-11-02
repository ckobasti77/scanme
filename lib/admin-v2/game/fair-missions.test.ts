import { describe, expect, test } from "vitest";
import { fairChain, fairChallenges, fairReady } from "./fair-missions";
import { FAIR_CHALLENGE_IDS, FAIR_NODE_IDS } from "./ids";
import type { FairChainInput, FairChallengeInput, FairNode } from "./types";

type Patch = {
  models?: Partial<FairChainInput["kpis"]["models"]>;
  questions?: FairChainInput["kpis"]["questions"];
  modeli?: Partial<FairChainInput["sections"]["modeli"]>;
  qr?: Partial<FairChainInput["sections"]["qr"]>;
  izlagaci?: Partial<FairChainInput["sections"]["izlagaci"]>;
  leadovi?: FairChainInput["sections"]["leadovi"];
};

// Every node lit by default; a test changes one thing.
const chainInput = (patch: Patch = {}): FairChainInput => ({
  kpis: {
    models: { published: 8, total: 8, ...patch.models },
    questions: patch.questions === undefined ? { covered: 6, required: 6 } : patch.questions,
  },
  sections: {
    modeli: { withErrors: 0, ...patch.modeli },
    qr: { publishedWithoutQr: 0, onWithdrawn: 0, ...patch.qr },
    izlagaci: { active: 3, total: 3, ...patch.izlagaci },
    leadovi: patch.leadovi === undefined ? { followUpActive: 2, followUpNeeded: 2 } : patch.leadovi,
  },
});
const find = (nodes: FairNode[], id: FairNode["id"]) => nodes.find((node) => node.id === id);

describe("fairChain", () => {
  test("everything done lights every node, in the order of the chain", () => {
    const nodes = fairChain(chainInput());
    expect(nodes.map((node) => node.id)).toEqual([...FAIR_NODE_IDS]);
    expect(nodes.every((node) => node.state === "lit")).toBe(true);
    expect(find(nodes, "spremno")).toEqual({ id: "spremno", state: "lit", done: 5, total: 5 });
    expect(fairReady(nodes)).toBe(true);
  });

  describe("katalog", () => {
    test("locked, open, lit", () => {
      expect(find(fairChain(chainInput({ models: { published: 0, total: 0 } })), "katalog")).toEqual({ id: "katalog", state: "locked", done: 0, total: 0 });
      expect(find(fairChain(chainInput({ models: { published: 5, total: 8 } })), "katalog")).toEqual({ id: "katalog", state: "open", done: 5, total: 8 });
      expect(find(fairChain(chainInput()), "katalog")).toEqual({ id: "katalog", state: "lit", done: 8, total: 8 });
    });
    test("a model with an error keeps it open", () => {
      expect(find(fairChain(chainInput({ modeli: { withErrors: 1 } })), "katalog")?.state).toBe("open");
    });
  });

  describe("nalepnice", () => {
    test("locked without a published model", () => {
      expect(find(fairChain(chainInput({ models: { published: 0 } })), "nalepnice")).toEqual({ id: "nalepnice", state: "locked", done: 0, total: 0 });
    });
    test("open while a published model has no QR", () => {
      expect(find(fairChain(chainInput({ qr: { publishedWithoutQr: 3 } })), "nalepnice")).toEqual({ id: "nalepnice", state: "open", done: 5, total: 8 });
    });
    test("open while a sticker sits on a withdrawn model", () => {
      expect(find(fairChain(chainInput({ qr: { onWithdrawn: 1 } })), "nalepnice")).toEqual({ id: "nalepnice", state: "open", done: 8, total: 8 });
    });
    test("lit when neither holds, and the count never goes below zero", () => {
      expect(find(fairChain(chainInput()), "nalepnice")?.state).toBe("lit");
      expect(find(fairChain(chainInput({ qr: { publishedWithoutQr: 20 } })), "nalepnice")?.done).toBe(0);
    });
  });

  describe("izlagaci", () => {
    test("locked, open, lit", () => {
      expect(find(fairChain(chainInput({ izlagaci: { active: 0, total: 0 } })), "izlagaci")).toEqual({ id: "izlagaci", state: "locked", done: 0, total: 0 });
      expect(find(fairChain(chainInput({ izlagaci: { active: 1, total: 3 } })), "izlagaci")).toEqual({ id: "izlagaci", state: "open", done: 1, total: 3 });
      expect(find(fairChain(chainInput()), "izlagaci")).toEqual({ id: "izlagaci", state: "lit", done: 3, total: 3 });
    });
  });

  describe("pitanja", () => {
    test("left out without data or without a need", () => {
      expect(find(fairChain(chainInput({ questions: null })), "pitanja")).toBeUndefined();
      expect(find(fairChain(chainInput({ questions: { covered: 0, required: 0 } })), "pitanja")).toBeUndefined();
    });
    test("open and lit, covered is capped at required", () => {
      expect(find(fairChain(chainInput({ questions: { covered: 2, required: 6 } })), "pitanja")).toEqual({ id: "pitanja", state: "open", done: 2, total: 6 });
      expect(find(fairChain(chainInput({ questions: { covered: 9, required: 6 } })), "pitanja")).toEqual({ id: "pitanja", state: "lit", done: 6, total: 6 });
    });
  });

  describe("leadovi", () => {
    test("left out without data or without a need", () => {
      expect(find(fairChain(chainInput({ leadovi: null })), "leadovi")).toBeUndefined();
      expect(find(fairChain(chainInput({ leadovi: { followUpActive: 0, followUpNeeded: 0 } })), "leadovi")).toBeUndefined();
    });
    test("open and lit, active is capped at needed", () => {
      expect(find(fairChain(chainInput({ leadovi: { followUpActive: 1, followUpNeeded: 4 } })), "leadovi")).toEqual({ id: "leadovi", state: "open", done: 1, total: 4 });
      expect(find(fairChain(chainInput({ leadovi: { followUpActive: 7, followUpNeeded: 4 } })), "leadovi")).toEqual({ id: "leadovi", state: "lit", done: 4, total: 4 });
    });
  });

  describe("spremno", () => {
    test("counts only the nodes that are in the chain", () => {
      const nodes = fairChain(chainInput({ questions: null, leadovi: null }));
      expect(nodes.map((node) => node.id)).toEqual(["katalog", "nalepnice", "izlagaci", "spremno"]);
      expect(find(nodes, "spremno")).toEqual({ id: "spremno", state: "lit", done: 3, total: 3 });
    });
    test("locked while any node is not lit", () => {
      const nodes = fairChain(chainInput({ izlagaci: { active: 1, total: 3 }, leadovi: { followUpActive: 0, followUpNeeded: 2 } }));
      expect(find(nodes, "spremno")).toEqual({ id: "spremno", state: "locked", done: 3, total: 5 });
      expect(fairReady(nodes)).toBe(false);
    });
    test("an empty event is locked everywhere", () => {
      const nodes = fairChain(chainInput({ models: { published: 0, total: 0 }, izlagaci: { active: 0, total: 0 }, questions: null, leadovi: null }));
      expect(nodes.map((node) => node.state)).toEqual(["locked", "locked", "locked", "locked"]);
    });
  });

  test("fairReady is false for an empty list", () => {
    expect(fairReady([])).toBe(false);
  });

  test("does not change its input", () => {
    const given = chainInput({ qr: { publishedWithoutQr: 2 } });
    const copy = JSON.stringify(given);
    fairChain(given);
    expect(JSON.stringify(given)).toBe(copy);
  });
});

describe("fairChallenges", () => {
  const hours = (rows: Array<[string, number, number]>) => rows.map(([dateKey, hour, scans]) => ({ dateKey, hour, scans }));
  const base = (patch: Partial<FairChallengeInput> = {}): FairChallengeInput => ({
    dayIndex: 1,
    todayKey: "2026-10-16",
    yesterdayKey: null,
    hour: 10,
    scansToday: 0,
    leadsToday: 0,
    urgentOpen: 0,
    hours: [],
    ...patch,
  });
  const second = (patch: Partial<FairChallengeInput> = {}) => base({ dayIndex: 2, yesterdayKey: "2026-10-15", ...patch });
  const ids = (list: ReturnType<typeof fairChallenges>) => list.map((challenge) => challenge.id);
  const byId = (list: ReturnType<typeof fairChallenges>, id: string) => list.find((challenge) => challenge.id === id);

  describe("first day", () => {
    test("the thresholds and the morning challenge, in order", () => {
      const list = fairChallenges(base({ scansToday: 55, hours: hours([["2026-10-16", 9, 30], ["2026-10-16", 11, 25]]) }));
      expect(ids(list)).toEqual(["skenovi_10", "skenovi_50", "skenovi_100", "pre_podne_50"]);
      expect(list.map((challenge) => challenge.done)).toEqual([true, true, false, true]);
      expect(list.map((challenge) => challenge.target)).toEqual([10, 50, 100, 50]);
      expect(byId(list, "pre_podne_50")?.value).toBe(55);
    });
    test("a threshold is met exactly at the target", () => {
      const list = fairChallenges(base({ scansToday: 50 }));
      expect(byId(list, "skenovi_50")?.done).toBe(true);
      expect(byId(list, "skenovi_100")?.done).toBe(false);
      expect(list.every((challenge) => !challenge.missed || challenge.id === "pre_podne_50")).toBe(true);
    });
    test("the morning counts only today's hours before noon", () => {
      const list = fairChallenges(base({ hours: hours([["2026-10-16", 11, 20], ["2026-10-16", 12, 90], ["2026-10-15", 9, 70]]) }));
      expect(byId(list, "pre_podne_50")).toMatchObject({ value: 20, done: false });
    });
    test("missed at 12:00, not at 11:00, never when met", () => {
      const rows = hours([["2026-10-16", 9, 10]]);
      expect(byId(fairChallenges(base({ hour: 11, hours: rows })), "pre_podne_50")?.missed).toBe(false);
      expect(byId(fairChallenges(base({ hour: 12, hours: rows })), "pre_podne_50")?.missed).toBe(true);
      expect(byId(fairChallenges(base({ hour: 15, hours: hours([["2026-10-16", 9, 60]]) })), "pre_podne_50")).toMatchObject({ done: true, missed: false });
    });
    test("without the hourly read the morning challenge is left out", () => {
      expect(ids(fairChallenges(base({ hours: null, scansToday: 3 })))).toEqual(["skenovi_10", "skenovi_50", "skenovi_100"]);
    });
    test("the thresholds are never missed", () => {
      expect(fairChallenges(base({ hour: 23, scansToday: 1 })).filter((challenge) => challenge.id.startsWith("skenovi")).every((challenge) => !challenge.missed)).toBe(true);
    });
  });

  describe("second day", () => {
    const rows = hours([
      ["2026-10-15", 9, 12],
      ["2026-10-15", 11, 18],
      ["2026-10-15", 14, 40],
      ["2026-10-16", 9, 10],
      ["2026-10-16", 10, 15],
    ]);
    test("the challenges of the second day, in order", () => {
      const list = fairChallenges(second({ hours: rows, leadsToday: 0, urgentOpen: 2 }));
      expect(ids(list)).toEqual(["prestigni_prepodne", "obori_rekord_sata", "prvi_lead_danas", "hitni_na_nuli"]);
      for (const id of ids(list)) expect(FAIR_CHALLENGE_IDS).toContain(id);
    });
    test("prestigni prepodne: today's morning against yesterday's", () => {
      const open = byId(fairChallenges(second({ hours: rows })), "prestigni_prepodne");
      expect(open).toEqual({ id: "prestigni_prepodne", value: 25, target: 30, done: false, missed: false });
      const equal = byId(fairChallenges(second({ hours: hours([["2026-10-15", 9, 30], ["2026-10-16", 9, 30]]) })), "prestigni_prepodne");
      expect(equal?.done).toBe(false);
      const beaten = byId(fairChallenges(second({ hours: hours([["2026-10-15", 9, 30], ["2026-10-16", 9, 31]]) })), "prestigni_prepodne");
      expect(beaten?.done).toBe(true);
    });
    test("prestigni prepodne is missed at 12:00 and not before", () => {
      expect(byId(fairChallenges(second({ hour: 11, hours: rows })), "prestigni_prepodne")?.missed).toBe(false);
      expect(byId(fairChallenges(second({ hour: 12, hours: rows })), "prestigni_prepodne")?.missed).toBe(true);
    });
    test("prestigni prepodne is left out when yesterday had no morning", () => {
      const list = fairChallenges(second({ hours: hours([["2026-10-15", 14, 40]]) }));
      expect(byId(list, "prestigni_prepodne")).toBeUndefined();
      expect(byId(list, "obori_rekord_sata")).toBeDefined();
    });
    test("obori rekord sata: the best hour before today against today's best", () => {
      expect(byId(fairChallenges(second({ hours: rows })), "obori_rekord_sata")).toEqual({ id: "obori_rekord_sata", value: 15, target: 40, done: false, missed: false });
      const tied = hours([["2026-10-14", 9, 20], ["2026-10-15", 9, 20], ["2026-10-16", 9, 20]]);
      expect(byId(fairChallenges(second({ hours: tied })), "obori_rekord_sata")?.done).toBe(false);
      const beaten = hours([["2026-10-14", 9, 20], ["2026-10-16", 9, 21]]);
      expect(byId(fairChallenges(second({ hours: beaten })), "obori_rekord_sata")).toMatchObject({ value: 21, target: 20, done: true });
    });
    test("obori rekord sata is left out without a record", () => {
      expect(byId(fairChallenges(second({ hours: [] })), "obori_rekord_sata")).toBeUndefined();
      expect(byId(fairChallenges(second({ hours: hours([["2026-10-16", 9, 50]]) })), "obori_rekord_sata")).toBeUndefined();
    });
    test("prvi lead danas", () => {
      expect(byId(fairChallenges(second({ leadsToday: 0 })), "prvi_lead_danas")).toEqual({ id: "prvi_lead_danas", value: 0, target: 1, done: false, missed: false });
      expect(byId(fairChallenges(second({ leadsToday: 4 })), "prvi_lead_danas")).toMatchObject({ value: 1, done: true });
      expect(byId(fairChallenges(second({ leadsToday: null })), "prvi_lead_danas")).toBeUndefined();
    });
    test("hitni na nuli: missed from 14:00, not at 13:00, never when clear", () => {
      expect(byId(fairChallenges(second({ hour: 13, urgentOpen: 2 })), "hitni_na_nuli")).toEqual({ id: "hitni_na_nuli", value: 2, target: 0, done: false, missed: false });
      expect(byId(fairChallenges(second({ hour: 14, urgentOpen: 2 })), "hitni_na_nuli")?.missed).toBe(true);
      expect(byId(fairChallenges(second({ hour: 18, urgentOpen: 0 })), "hitni_na_nuli")).toMatchObject({ done: true, missed: false });
    });
    test("without the hourly read only the lead and urgent challenges remain", () => {
      expect(ids(fairChallenges(second({ hours: null })))).toEqual(["prvi_lead_danas", "hitni_na_nuli"]);
    });
    test("the first day does not carry the challenges of the second", () => {
      const list = fairChallenges(base({ hours: rows, urgentOpen: 3, leadsToday: 1 }));
      expect(ids(list)).not.toContain("hitni_na_nuli");
      expect(ids(list)).not.toContain("prvi_lead_danas");
    });
  });

  test("does not change its input", () => {
    const given = second({ hours: hours([["2026-10-15", 9, 5]]) });
    const copy = JSON.stringify(given);
    fairChallenges(given);
    expect(JSON.stringify(given)).toBe(copy);
  });
});
