/// <reference types="vite/client" />

// ScanMe Menu V1 — K14: the informative EUR exchange rate of the public menu
// (convex/menuFx.ts). Proven here: the off switch (no network call at all), a
// stored rate from a stubbed NBS answer, the "write only on change" rule, the
// error / invalid outcomes of a bad source, retention of the newest 30 rows,
// the implausible-input refusals of storeRate, the public `current` read and
// the cron entry. `fetch` is a stub in every test that could reach it: no
// request ever leaves the process. All data below is invented.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import crons from "./crons";
import { MENU_FX_KEEP } from "./menuFx";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const URL_OK = "https://nbs-relay.example.test/kurs/eur.json";
const FIXTURE = { code: "EUR", date: "2026-10-16", parity: 1, exchange_middle: 117.1655 };
const ENV_NAMES = ["MENU_FX_ENABLED", "MENU_FX_URL"] as const;

let saved: Record<string, string | undefined>;

function enable(url: string = URL_OK) {
  process.env.MENU_FX_ENABLED = "true";
  process.env.MENU_FX_URL = url;
}

function stubJson(body: unknown, status = 200) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubNever() {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
    throw new Error("the network must not be touched");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function rows(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => ctx.db.query("menuExchangeRates").collect());
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("refreshRate: the off switch", () => {
  test("MENU_FX_ENABLED unset: disabled, no fetch, no row", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubNever();
    process.env.MENU_FX_URL = URL_OK;
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows(t)).toHaveLength(0);
  });

  test("enabled but no URL: disabled", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubNever();
    process.env.MENU_FX_ENABLED = "true";
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("disabled");
    process.env.MENU_FX_URL = "   ";
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows(t)).toHaveLength(0);
  });

  test.each(["TRUE", "1", "yes", "True", " true", ""])("MENU_FX_ENABLED=%j is not exactly \"true\": disabled", async (flag) => {
    const t = convexTest(schema, modules);
    const fetchMock = stubNever();
    process.env.MENU_FX_ENABLED = flag;
    process.env.MENU_FX_URL = URL_OK;
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows(t)).toHaveLength(0);
  });

  test("a plain http URL: disabled, no fetch", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubNever();
    enable("http://nbs-relay.example.test/kurs/eur.json");
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows(t)).toHaveLength(0);
  });

  test("a malformed URL: disabled, no fetch", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubNever();
    enable("not a url");
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("disabled");
    enable("//nbs-relay.example.test/kurs");
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows(t)).toHaveLength(0);
  });
});

describe("refreshRate: enabled with a stubbed source", () => {
  test("a valid answer is stored and `current` returns exactly the three fields", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubJson(FIXTURE);
    enable();
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("stored");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(URL_OK);

    const current = await t.query(api.menuFx.current, {});
    expect(current).toEqual({
      rate: 117.1655,
      effectiveDate: "2026-10-16",
      fetchedAt: expect.any(Number),
    });
    expect(Object.keys(current!).sort()).toEqual(["effectiveDate", "fetchedAt", "rate"]);
    expect(await rows(t)).toHaveLength(1);
  });

  test("the same rate and date again: unchanged, still one row", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubJson(FIXTURE);
    enable();
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("stored");
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("unchanged");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await rows(t)).toHaveLength(1);
  });

  test("a new date or a new rate is stored; `current` is the newest", async () => {
    const t = convexTest(schema, modules);
    enable();
    const fetchMock = stubJson(FIXTURE);
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("stored");

    await new Promise((resolve) => setTimeout(resolve, 5));
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ...FIXTURE, date: "2026-10-17" })));
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("stored");
    expect(await rows(t)).toHaveLength(2);
    expect((await t.query(api.menuFx.current, {}))?.effectiveDate).toBe("2026-10-17");

    await new Promise((resolve) => setTimeout(resolve, 5));
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ ...FIXTURE, date: "2026-10-17", exchange_middle: 117.2 })),
    );
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("stored");
    expect(await rows(t)).toHaveLength(3);
    expect(await t.query(api.menuFx.current, {})).toMatchObject({ rate: 117.2, effectiveDate: "2026-10-17" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("a 503 answer: error, no row", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubJson({ message: "unavailable" }, 503);
    enable();
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await rows(t)).toHaveLength(0);
  });

  test("a thrown fetch: error, no row", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubNever();
    enable();
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await rows(t)).toHaveLength(0);
  });

  test("a body that is not JSON: error, no row", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = vi.fn(async () => new Response("<html>maintenance</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    enable();
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await rows(t)).toHaveLength(0);
  });

  test.each([
    ["another currency", { ...FIXTURE, code: "USD" }],
    ["no exchange_middle", { code: "EUR", date: "2026-10-16", parity: 1 }],
    ["an implausible rate", { ...FIXTURE, exchange_middle: 5 }],
    ["a bad date", { ...FIXTURE, date: "16.10.2026" }],
    ["a JSON array", [FIXTURE]],
  ])("%s: invalid, no row", async (_label, body) => {
    const t = convexTest(schema, modules);
    const fetchMock = stubJson(body);
    enable();
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("invalid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await rows(t)).toHaveLength(0);
  });
});

describe("storeRate", () => {
  test("keeps exactly the newest MENU_FX_KEEP rows", async () => {
    const t = convexTest(schema, modules);
    expect(MENU_FX_KEEP).toBe(30);
    const base = Date.parse("2026-09-01T08:00:00Z");
    for (let i = 0; i < 35; i++) {
      // Real consecutive dates from 2026-09-15 (an impossible date is refused, see below).
      const result = await t.mutation(internal.menuFx.storeRate, {
        rate: 117 + i / 100,
        effectiveDate: new Date(Date.UTC(2026, 8, 15 + i)).toISOString().slice(0, 10),
        fetchedAt: base + i * 1000,
      });
      expect(result).toBe("stored");
    }
    const left = await rows(t);
    expect(left).toHaveLength(30);
    const fetched = left.map((row) => row.fetchedAt).sort((a, b) => a - b);
    expect(fetched).toEqual(Array.from({ length: 30 }, (_, i) => base + (i + 5) * 1000));
    expect(await t.query(api.menuFx.current, {})).toEqual({
      rate: 117 + 34 / 100,
      effectiveDate: "2026-10-19",
      fetchedAt: base + 34 * 1000,
    });
  });

  test.each([
    ["zero", 0],
    ["too large", 10000],
    ["below the floor", 49.99],
    ["above the ceiling", 500.01],
    ["negative", -117],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("refuses a rate that is %s", async (_label, rate) => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.menuFx.storeRate, {
      rate,
      effectiveDate: "2026-10-16",
      fetchedAt: 1_000,
    });
    expect(result).toBe("invalid");
    expect(await rows(t)).toHaveLength(0);
  });

  test.each(["16.10.2026", "2026-02-31", "2026-10-35", "2026-1-6", "2026-10-16T00:00:00Z", "", "20261016"])(
    "refuses the malformed date %j",
    async (effectiveDate) => {
      const t = convexTest(schema, modules);
      const result = await t.mutation(internal.menuFx.storeRate, { rate: 117.1655, effectiveDate, fetchedAt: 1_000 });
      expect(result).toBe("invalid");
      expect(await rows(t)).toHaveLength(0);
    },
  );

  test("an invalid call leaves earlier rows alone; a repeat is unchanged", async () => {
    const t = convexTest(schema, modules);
    const first = { rate: 117.1655, effectiveDate: "2026-10-16", fetchedAt: 1_000 };
    expect(await t.mutation(internal.menuFx.storeRate, first)).toBe("stored");
    expect(await t.mutation(internal.menuFx.storeRate, { ...first, rate: 0, fetchedAt: 2_000 })).toBe("invalid");
    expect(await t.mutation(internal.menuFx.storeRate, { ...first, fetchedAt: 3_000 })).toBe("unchanged");
    expect(await rows(t)).toHaveLength(1);
    expect((await t.query(api.menuFx.current, {}))?.fetchedAt).toBe(1_000);
  });
});

describe("current", () => {
  test("an empty table: null, callable without identity", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.menuFx.current, {})).toBeNull();
  });
});

describe("the cron", () => {
  test("'menu fx rate' runs refreshRate every 6 hours, and with the env off it makes no request", async () => {
    const job = crons.crons["menu fx rate"];
    expect(job).toBeDefined();
    expect(job.name).toBe("menuFx:refreshRate");
    expect(job.schedule).toEqual({ type: "interval", hours: 6 });
    expect(job.args).toEqual([{}]);

    const t = convexTest(schema, modules);
    const fetchMock = stubNever();
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows(t)).toHaveLength(0);
  });
});
