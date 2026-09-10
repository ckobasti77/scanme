/// <reference types="vite/client" />

// TASK-58 — the export action: admin-only, derived from the draft, returned
// as chunks that reassemble into a real PDF / XLSX (magic bytes checked).

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { chunkBytes, EXPORT_CHUNK_BYTES } from "./menuExport";
import { defaults, itemDefaults, type MenuModel } from "../lib/menu-blocks";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const OWNER_EMAIL = "vlasnik@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

type T = ReturnType<typeof convexTest>;
type ArgModel = FunctionArgs<typeof api.menuAdmin.importDraft>["model"];

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL, emailVerificationTime: now });
    const ownerId = await ctx.db.insert("users", { email: OWNER_EMAIL, emailVerificationTime: now });
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana kod Đorđa",
      slug: "kafana-kod-djordja",
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId: ownerId,
      businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { adminId, ownerId, businessId };
  });
}

const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: userId, issuer: ISSUER });

function model(): MenuModel {
  const g = defaults("lista");
  g.base = { id: "g", title: "Piće" };
  g.items = [{ ...itemDefaults(), id: "i", name: "Šljivovica", productType: "piće", priceRsd: 250 }];
  return { groups: [g], dayparts: [] };
}

const join = (chunks: ArrayBuffer[]) => {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(new Uint8Array(c), at);
    at += c.byteLength;
  }
  return out;
};

describe("menuExport (TASK-58)", () => {
  test("an admin gets a PDF and an XLSX derived from the draft; a non-admin is refused", async () => {
    const t = convexTest(schema, modules);
    const { adminId, ownerId, businessId } = await seed(t);
    const admin = as(t, adminId);
    const { menuId } = await admin.mutation(api.menuAdmin.grantMenu, { businessId });
    await admin.mutation(api.menuAdmin.importDraft, { menuId, model: model() as unknown as ArgModel });

    const pdf = await admin.action(api.menuExport.exportMenu, { businessId, format: "pdf" });
    expect(pdf.mimeType).toBe("application/pdf");
    expect(pdf.fileName).toMatch(/^kafana-kod-djordja-meni-\d{4}-\d{2}-\d{2}\.pdf$/);
    const pdfBytes = join(pdf.chunks);
    // Byte-faithful decode (WHATWG "latin1" is windows-1252 and would map
    // 0x8A to Š); "Š" is the WinAnsi byte 0x8A in the content stream.
    const pdfText = Array.from(pdfBytes, (b) => String.fromCharCode(b)).join("");
    expect(pdfText.slice(0, 8)).toBe("%PDF-1.4");
    expect(pdfText).toContain("\x8aljivovica");

    const xlsx = await admin.action(api.menuExport.exportMenu, { businessId, format: "xlsx" });
    expect(xlsx.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(xlsx.fileName).toMatch(/\.xlsx$/);
    expect(Array.from(join(xlsx.chunks).subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    await expect(
      as(t, ownerId).action(api.menuExport.exportMenu, { businessId, format: "pdf" }),
    ).rejects.toThrow("administratorski");
    // An export is a read: no audit row.
    const rows = await t.run((ctx) =>
      ctx.db.query("adminAuditLog").withIndex("by_businessId_and_createdAt", (q) => q.eq("businessId", businessId)).collect(),
    );
    expect(rows.map((r) => r.action)).toEqual(["grant_menu", "import_menu_draft"]);
  });

  test("chunkBytes splits at the Convex per-value ceiling and reassembles losslessly", () => {
    const bytes = new Uint8Array(EXPORT_CHUNK_BYTES * 2 + 17);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    const chunks = chunkBytes(bytes);
    expect(chunks.map((c) => c.byteLength)).toEqual([EXPORT_CHUNK_BYTES, EXPORT_CHUNK_BYTES, 17]);
    const back = join(chunks);
    expect(back.length).toBe(bytes.length);
    let firstMismatch = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      if (back[i] !== bytes[i]) {
        firstMismatch = i;
        break;
      }
    }
    expect(firstMismatch).toBe(-1);
    expect(chunkBytes(new Uint8Array(0)).map((c) => c.byteLength)).toEqual([0]);
  });
});
