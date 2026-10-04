/// <reference types="vite/client" />

// TASK-70 (RFC-004 §4 "Hardening") — closes three gaps the series 62..69 left
// open, without adding any new surface (§4 acceptance: all three blocks pass,
// no existing test changes).
//
// =============================================================================
// WHY THE "NO PAYMENT" BLOCK BELOW EXISTS — READ THIS BEFORE TOUCHING IT.
//
// RFC-004 §2.3 makes a LEGAL decision, not a style preference: Serbian
// e-fiscalization requires every sale to be issued through a certified fiscal
// device (the till). This product's `serviceRequests` model is a REQUEST to a
// waiter, never a sale, a bill, or a settlement — and it must stay that way
// forever, not just today.
//
// convex/orderingRequests.test.ts already has a test with this same title
// ("an order writes no total, no amount owed and no paid state"), but it is
// COSMETIC: it inserts ONE hardcoded order, reads back ONE row, and checks that
// row's keys are not literally "total"/"amount"/"paid"/"amountRsd"/"totalRsd".
// It would not notice a NEW field called `duguje`, a NEW mutation called
// `closeAccount`, a NEW `owedRsd` on `serviceRequestItems`, or a `.reduce(...)`
// that sums `priceRsd * qty` into a number returned to the guest — because none
// of those touch the one row or the five names it happens to check.
//
// The tests below are STRUCTURAL instead: they read the ACTUAL schema
// (`schema.tables[...].validator`, walked recursively) and the ACTUAL exported
// Convex functions of every ordering-domain module (their names AND their
// real argument validators, via `.exportArgs()`), plus the ACTUAL source text
// of those modules with comments stripped — and they fail if ANY field, any
// exported name, any argument, or any arithmetic pattern in that real code
// matches money vocabulary or a summation shape. A future PR that "just adds a
// pay button" cannot pass this by getting one test fixture right — it has to
// avoid the word "paid" (and "amount", "total", "bill", "invoice", "charge",
// "settle", "balance", "owed", "tab", "cost", "receipt", "refund", "checkout",
// "deposit") in every field, function, and argument name in this whole
// product, AND avoid summing `priceRsd` by `qty` anywhere in the source. That
// is the actual shape of "someone adding payment," so that is what is checked.
//
// DO NOT DELETE THIS AS "REDUNDANT WITH orderingRequests.test.ts" — the two
// tests check different things (one example vs. every field/function/arg in
// the real code) and RFC-004 §3 risk #3 names this file's block explicitly as
// the mitigation for that risk.
// =============================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { REQUEST_ERROR } from "./lib/orderingErrors";
import { hashPin } from "./orderingShifts";
import { resolveTableOrdering } from "./cards";
import * as orderingErrorsModule from "./lib/orderingErrors";
import * as orderingModule from "./ordering";
import * as orderingDevSeedModule from "./orderingDevSeed";
import * as orderingPanelModule from "./orderingPanel";
import * as orderingRequestsModule from "./orderingRequests";
import * as orderingShiftsModule from "./orderingShifts";
import * as orderingStatusModule from "./orderingStatus";
import { orderingSr } from "../lib/i18n/sr/ordering";

const modules = import.meta.glob("./**/*.ts");
const CONVEX_DIR = dirname(fileURLToPath(import.meta.url));

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

// =============================================================================
// Shared vocabulary + walkers, used by every "no payment" test below.
// =============================================================================

// Whole-word money vocabulary. Deliberately EXCLUDES the bare word "due" —
// `orderingStatus.ts`/`orderingShifts.ts` both use a local variable literally
// named `due` for "rows due for the cron sweep" (nothing to do with money), so
// a bare "due" would false-positive on legitimate code. Compound payment terms
// ("amountDue", "balanceDue") are still caught because "amount"/"balance" are
// forbidden on their own.
const FORBIDDEN_MONEY_WORDS = new Set([
  "amount",
  "amounts",
  "paid",
  "prepaid",
  "unpaid",
  "payment",
  "payments",
  "pay",
  "total",
  "totals",
  "subtotal",
  "grandtotal",
  "bill",
  "bills",
  "billed",
  "billing",
  "invoice",
  "invoices",
  "invoiced",
  "charge",
  "charges",
  "charged",
  "settle",
  "settled",
  "settlement",
  "balance",
  "owed",
  "tab",
  "cost",
  "costs",
  "receipt",
  "receipts",
  "refund",
  "refunds",
  "checkout",
  "deposit",
  "deposits",
]);

function splitIdentifierWords(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function assertNoForbiddenWords(identifier: string, context: string) {
  const hit = splitIdentifierWords(identifier).find((word) =>
    FORBIDDEN_MONEY_WORDS.has(word),
  );
  if (hit) {
    throw new Error(
      `${context}: "${identifier}" contains forbidden money-vocabulary word ` +
        `"${hit}" — RFC-004 §2.3 forbids any payment/settlement surface in the ` +
        `ordering model (Serbian e-fiscalization: the register is the only ` +
        `fiscal device, never this app).`,
    );
  }
}

// Recursively walks a Convex SCHEMA validator (the `kind`/`fields`/`element`/
// `members` shape returned by `defineTable(...).validator`) and collects every
// field name it declares, at any depth.
function collectSchemaFieldNames(validator: unknown, out: Set<string>) {
  if (!validator || typeof validator !== "object") return;
  const v = validator as {
    kind?: string;
    fields?: Record<string, unknown>;
    element?: unknown;
    members?: unknown[];
  };
  if (v.kind === "object" && v.fields) {
    for (const [key, field] of Object.entries(v.fields)) {
      out.add(key);
      collectSchemaFieldNames(field, out);
    }
  } else if (v.kind === "array" && v.element) {
    collectSchemaFieldNames(v.element, out);
  } else if (v.kind === "union" && Array.isArray(v.members)) {
    for (const member of v.members) collectSchemaFieldNames(member, out);
  }
}

// Recursively walks the JSON a Convex function's `.exportArgs()` returns (the
// `type`/`value`/`fieldType` wire shape) and collects every argument field
// name, at any depth (including inside arrays of objects, e.g. `submitOrder`'s
// `lines`).
function collectArgFieldNames(node: unknown, out: Set<string>) {
  if (!node || typeof node !== "object") return;
  const n = node as { type?: string; value?: unknown };
  if (n.type === "object" && n.value && typeof n.value === "object") {
    for (const [key, field] of Object.entries(
      n.value as Record<string, { fieldType?: unknown }>,
    )) {
      out.add(key);
      collectArgFieldNames(field?.fieldType, out);
    }
  } else if (n.type === "array") {
    collectArgFieldNames(n.value, out);
  } else if (n.type === "union" && Array.isArray(n.value)) {
    for (const member of n.value) collectArgFieldNames(member, out);
  }
}

// Recursively collects every key of a plain exported object (e.g. the
// `REQUEST_ERROR` / `SHIFT_ERROR` machine-code maps) — NOT a Convex function.
function collectPlainObjectKeys(value: unknown, out: Set<string>, depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectPlainObjectKeys(item, out, depth + 1);
    return;
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out.add(key);
    collectPlainObjectKeys(val, out, depth + 1);
  }
}

function isConvexFunction(
  value: unknown,
): value is { exportArgs?: () => unknown } {
  return (
    !!value &&
    typeof value === "object" &&
    ("isMutation" in value || "isQuery" in value || "isAction" in value)
  );
}

describe("TASK-70: STRUCTURAL guard against ANY payment surface (RFC-004 §2.3, risk #3)", () => {
  // O.1–O.7 verbatim from schema.ts's own "Ordering + Waiter Panel data model"
  // section — the entire ordering domain's persisted shape. `orders` /
  // `orderItems` (the RFC-002 purchase/billing layer) are DELIBERATELY not in
  // this list: schema.ts's own comment says this product uses
  // serviceRequests/serviceRequestItems specifically so it never shares a name
  // (or a table) with that layer.
  const ORDERING_TABLES = [
    "orderingConfig",
    "orderingItems",
    "orderingGuests",
    "staffPins",
    "orderingShifts",
    "serviceRequests",
    "serviceRequestItems",
  ] as const;

  test("no field of any of the 7 ordering tables — at any depth — carries money vocabulary", () => {
    for (const tableName of ORDERING_TABLES) {
      const fieldNames = new Set<string>();
      collectSchemaFieldNames(
        schema.tables[tableName].validator,
        fieldNames,
      );
      // Sanity check on the walker itself: if this ever reads zero fields, the
      // walker is broken, not the schema — and a broken walker would silently
      // pass everything below.
      expect(fieldNames.size).toBeGreaterThan(0);
      for (const fieldName of fieldNames) {
        assertNoForbiddenWords(fieldName, `schema.tables.${tableName}`);
      }
    }
  });

  // Every ordering-domain module (dynamically discovered from the RFC's own
  // file list, RFC-004 §4/§2.16), plus the one ordering export that lives in
  // the shared cards.ts (the card-aware minting hop).
  const ORDERING_MODULES: Record<string, Record<string, unknown>> = {
    "ordering.ts": orderingModule,
    "orderingRequests.ts": orderingRequestsModule,
    "orderingStatus.ts": orderingStatusModule,
    "orderingShifts.ts": orderingShiftsModule,
    "orderingPanel.ts": orderingPanelModule,
    "orderingDevSeed.ts": orderingDevSeedModule,
    "lib/orderingErrors.ts": orderingErrorsModule,
    "cards.ts (resolveTableOrdering only)": { resolveTableOrdering },
  };

  test("no exported ordering function/constant name, or any of its REAL argument fields, carries money vocabulary", () => {
    let checkedExports = 0;
    for (const [moduleLabel, mod] of Object.entries(ORDERING_MODULES)) {
      for (const [exportName, value] of Object.entries(mod)) {
        checkedExports += 1;
        assertNoForbiddenWords(
          exportName,
          `${moduleLabel} export "${exportName}"`,
        );
        if (isConvexFunction(value) && typeof value.exportArgs === "function") {
          const argsJson = value.exportArgs();
          if (argsJson) {
            const fieldNames = new Set<string>();
            collectArgFieldNames(argsJson, fieldNames);
            for (const fieldName of fieldNames) {
              assertNoForbiddenWords(
                fieldName,
                `${moduleLabel} ${exportName}(...) argument`,
              );
            }
          }
        } else if (
          value &&
          typeof value === "object" &&
          !isConvexFunction(value)
        ) {
          // A plain exported object (REQUEST_ERROR, SHIFT_ERROR, ...) — check
          // every one of its keys too, not just the export's own name.
          const keys = new Set<string>();
          collectPlainObjectKeys(value, keys);
          for (const key of keys) {
            assertNoForbiddenWords(
              key,
              `${moduleLabel} export "${exportName}" key`,
            );
          }
        }
      }
    }
    // Sanity check on the walker itself, same reasoning as the schema test.
    expect(checkedExports).toBeGreaterThan(15);
  });

  // The schema/exports/args checks above are exact but can only see field and
  // argument NAMES — they cannot see a `.reduce()` inside a handler body that
  // sums `priceRsd * qty` into a plain number returned from a query with no
  // declared `returns` validator (none of these queries declare one). This
  // last check reads the ACTUAL source text of every ordering-domain file
  // (comments stripped, so the extensive "no total, no bill, no payment"
  // PROSE in this very codebase's own comments cannot trigger a false
  // positive) and fails on money vocabulary OR a price/qty summation shape.
  const ORDERING_SOURCE_FILES = [
    "ordering.ts",
    "orderingRequests.ts",
    "orderingStatus.ts",
    "orderingShifts.ts",
    "orderingPanel.ts",
    "orderingDevSeed.ts",
    "lib/orderingErrors.ts",
  ];

  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .map((line) => {
        const idx = line.indexOf("//");
        return idx === -1 ? line : line.slice(0, idx);
      })
      .join("\n");
  }

  test("the real ordering source (comments stripped) contains no money vocabulary and no price×qty summation", () => {
    let checkedFiles = 0;
    for (const relPath of ORDERING_SOURCE_FILES) {
      const src = readFileSync(join(CONVEX_DIR, relPath), "utf8");
      const stripped = stripComments(src);
      checkedFiles += 1;

      for (const word of FORBIDDEN_MONEY_WORDS) {
        const re = new RegExp(`\\b${word}\\b`, "i");
        expect(
          re.test(stripped),
          `${relPath} contains the word "${word}" outside a comment — ` +
            `RFC-004 §2.3 forbids money vocabulary anywhere in the ordering source.`,
        ).toBe(false);
      }

      const arithmeticSmells: Array<{ name: string; re: RegExp }> = [
        {
          name: "priceRsd multiplied by something",
          re: /priceRsd\w*\s*\*/,
        },
        {
          name: "something multiplied by priceRsd",
          re: /\*\s*\w*priceRsd/,
        },
        {
          name: "qty multiplied by a price-looking identifier",
          re: /qty\w*\s*\*\s*\w*price/i,
        },
        {
          name: "a price-looking identifier multiplied by qty",
          re: /price\w*\s*\*\s*\w*qty/i,
        },
        {
          name: "Array.reduce (the classic running-total accumulator)",
          re: /\.reduce\(/,
        },
        {
          name: "a running sum accumulator (+=)",
          re: /\b(total|sum)\w*\s*\+=/i,
        },
      ];
      for (const smell of arithmeticSmells) {
        expect(
          smell.re.test(stripped),
          `${relPath} matches "${smell.name}" — RFC-004 §2.3: item prices are ` +
            `informational only and must never be summed anywhere in this model.`,
        ).toBe(false);
      }
    }
    expect(checkedFiles).toBe(ORDERING_SOURCE_FILES.length);
  });
});

// =============================================================================
// TASK-70: the rate-limit matrix (RFC-004 §2.9) — filling the two gaps left by
// TASK-66's tests (convex/orderingRequests.test.ts already covers the
// per-cardId callWaiter ceiling AND the per-guest orderSubmit ceiling, each at
// its exact boundary — capacity 3 succeeds, the 4th is refused). What was
// missing: (a) proof that a SECOND guest's own orderSubmit bucket is untouched
// by another guest's flood (the callWaiter side already has this, the
// orderSubmit side did not), and (b) proof that the refusal is actually
// GUEST-VISIBLE — a real, distinct Serbian sentence — not just a thrown
// machine code that a client could swallow silently.
// =============================================================================

describe("TASK-70: rate-limit matrix — the remaining boundary + visibility gaps (RFC-004 §2.9)", () => {
  const CODE = "KAFANA12";
  const CARD_A = "STAB0001";
  const CARD_B = "STAB0002";
  const PIN = "1234";

  async function seedVenue(t: T) {
    return t.run(async (ctx) => {
      const now = Date.now();
      const businessId = await ctx.db.insert("businesses", {
        name: "Kafana Dva Jelena",
        slug: "dva-jelena-hardening",
        status: "active",
        createdAt: now,
      });
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_venue",
        planKey: "premium",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("orderingConfig", {
        businessId,
        code: CODE,
        enabled: true,
        callWaiterEnabled: true,
        overdueMinutes: 7,
        reasons: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffPins", {
        businessId,
        label: "Šef sale",
        pinHash: await hashPin(PIN),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      const userId = await ctx.db.insert("users", { name: "Vlasnik" });
      const cardIds: Record<string, Id<"cards">> = {};
      for (const cardCode of [CARD_A, CARD_B]) {
        const cardId = await ctx.db.insert("cards", {
          businessId,
          cardCode,
          label: `Sto ${cardCode}`,
          status: "active",
          totalScans: 0,
          createdAt: now,
          updatedAt: now,
        });
        const targetId = await ctx.db.insert("cardTargets", {
          cardId,
          kind: "table_ordering",
          createdByUserId: userId,
          createdAt: now,
        });
        await ctx.db.patch(cardId, { currentTargetId: targetId });
        cardIds[cardCode] = cardId;
      }
      const itemId = await ctx.db.insert("orderingItems", {
        businessId,
        name: "Pivo",
        priceRsd: 280,
        available: true,
        order: 0,
        createdAt: now,
        updatedAt: now,
      });
      return { businessId, itemId };
    });
  }

  async function mintGuest(t: T, cardCode: string) {
    const hop = await t.mutation(api.cards.resolveTableOrdering, {
      cardCode,
      venueCode: CODE,
      ipHash: `ip-${cardCode}`,
    });
    if (hop.kind !== "table_ordering" || !hop.guestKey) {
      throw new Error("hop did not mint an ordering guest");
    }
    return hop.guestKey;
  }

  test("orderSubmit is a PER-GUEST ceiling: exactly at capacity (3) succeeds, one over (4th) is refused, and a DIFFERENT guest's bucket is untouched", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t);
    await t.mutation(api.orderingShifts.openShift, { code: CODE, pin: PIN });
    const guestA = await mintGuest(t, CARD_A);
    const guestB = await mintGuest(t, CARD_B);

    const submit = (guestKey: string) =>
      t.mutation(api.orderingRequests.submitOrder, {
        code: CODE,
        guestKey,
        lines: [{ itemId, qty: 1 }],
      });

    // Exactly at the configured capacity (3, convex/lib/rateLimits.ts
    // orderSubmit): all three succeed.
    await submit(guestA);
    await submit(guestA);
    await submit(guestA);
    // One over the boundary: refused, and refused with the guest-visible
    // machine code, never a silent drop.
    await expect(submit(guestA)).rejects.toThrow(REQUEST_ERROR.rateLimited);

    // The gap TASK-66's tests left: a DIFFERENT guest, at a DIFFERENT table,
    // must have their OWN full bucket — guest A's flood must not spend guest
    // B's tokens. (The callWaiter side already proves this for cardId; this
    // proves it for the orderSubmit-per-guest keying too.)
    await submit(guestB);
    await submit(guestB);
    await submit(guestB);
    await expect(submit(guestB)).rejects.toThrow(REQUEST_ERROR.rateLimited);

    const rows = await t.run((ctx) => ctx.db.query("serviceRequests").collect());
    expect(rows).toHaveLength(6); // 3 from A + 3 from B, nothing from either 4th tap
  });

  test("a rate-limited refusal is GUEST-VISIBLE — a real, distinct Serbian message, not just a machine code", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t);
    await t.mutation(api.orderingShifts.openShift, { code: CODE, pin: PIN });
    const guestKey = await mintGuest(t, CARD_A);
    const submit = () =>
      t.mutation(api.orderingRequests.submitOrder, {
        code: CODE,
        guestKey,
        lines: [{ itemId, qty: 1 }],
      });

    await submit();
    await submit();
    await submit();
    const error = await submit().catch((e) => e);
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<string>).data).toBe(REQUEST_ERROR.rateLimited);

    // The i18n dictionary (lib/i18n/sr/ordering.ts) is the guest surface's ONLY
    // source of copy (constraint 1, §2.15) — components/ordering/ordering-guest
    // maps REQUEST_ERROR.rateLimited to exactly this key. It must be a real,
    // non-empty, Serbian sentence that is DIFFERENT from the generic
    // "something failed" fallback — "sačekajte malo" (wait a bit), not silence
    // and not a generic error.
    expect(orderingSr.errorRateLimited).toBeTruthy();
    expect(orderingSr.errorRateLimited.length).toBeGreaterThan(10);
    expect(orderingSr.errorRateLimited).not.toBe(orderingSr.errorUnknown);
  });

  test("callWaiter is a PER-TABLE ceiling: exactly at capacity (3) succeeds, one over (4th) is refused — cross-checked against the configured constant, not a guessed number", async () => {
    const t = newT();
    await seedVenue(t);
    await t.mutation(api.orderingShifts.openShift, { code: CODE, pin: PIN });
    const guestKey = await mintGuest(t, CARD_A);
    const call = () =>
      t.mutation(api.orderingRequests.callWaiter, { code: CODE, guestKey });

    await call();
    await call();
    await call();
    await expect(call()).rejects.toThrow(REQUEST_ERROR.rateLimited);

    const rows = await t.run((ctx) => ctx.db.query("serviceRequests").collect());
    expect(rows).toHaveLength(3);
  });
});
