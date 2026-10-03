import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { menuForBusiness } from "./menu";
import type { MenuModel } from "../lib/menu-blocks";
import { belgradeParts } from "../lib/belgrade-time";
import { buildMenuPdf } from "../lib/menu-export/pdf";
import { assertExportSize, stampDateText, type ExportLabels } from "../lib/menu-export/rows";
import { buildMenuXlsx } from "../lib/menu-export/xlsx";
import { fmt, getDict } from "../lib/i18n";

// =============================================================================
// TASK-58 — PDF / Excel export of a menu's items (RFC-003 §2.9, §3 Risk 6).
//
// PLACEHOLDER pending the owner's answer to RFC-003 §5 Q7 (audience/template):
// shipped conservatively as an INTERNAL tool — `requireAdmin` only, plain
// template, sourced from the DRAFT (one document read, no per-item fan-out;
// the draft is what the concierge is entering and what the client reviews).
//
// "Derived from rows and streamed, no R2/CDN" (§2.9): the file is built in
// this action from the queried model by the pure writers in lib/menu-export
// (no "use node" — Uint8Array/TextEncoder only, so this runs in the default
// runtime) and returned to the browser in ≤ 900 000-byte chunks (Convex's
// 1 MiB per-value limit; the array is the stream). Nothing is parked in
// storage. Memory: a 2000-item menu (the hard cap) is ~1–8 MB of text — see
// docs/perf/menu-export.md; the 512 MiB Node ceiling that bit the Memories ZIP
// export (docs/perf/memories-export.md) is three orders of magnitude away.
// =============================================================================

const dict = getDict("menu-admin");

export const EXPORT_CHUNK_BYTES = 900_000;

type ExportSource = {
  businessName: string;
  slug: string;
  model: MenuModel;
};

export const exportSource = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args): Promise<ExportSource> => {
    // The caller's identity propagates through ctx.runQuery: the admin gate
    // runs here, inside the transaction, and refuses everyone else.
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business || business.archivedAt) throw new ConvexError(dict.loadError);
    const menu = await menuForBusiness(ctx, business._id);
    if (!menu) throw new ConvexError(dict.menuNone);
    const model = (menu.draftModel ?? { groups: [], dayparts: [] }) as unknown as MenuModel;
    return { businessName: business.name, slug: business.slug, model };
  },
});

function exportLabels(dateText: string): ExportLabels {
  return {
    subtitle: fmt(dict.exportSubtitle, { date: dateText }),
    unavailable: dict.exportUnavailable,
    pageOf: dict.exportPageOf,
    columns: {
      group: dict.exportColGroup,
      shape: dict.exportColShape,
      name: dict.exportColName,
      description: dict.exportColDescription,
      productType: dict.exportColProductType,
      price: dict.exportColPrice,
      variants: dict.exportColVariants,
      available: dict.exportColAvailable,
      daypart: dict.exportColDaypart,
    },
    yes: dict.exportYes,
    no: dict.exportNo,
    sheetName: dict.exportSheetName,
  };
}

export function chunkBytes(bytes: Uint8Array, size = EXPORT_CHUNK_BYTES): ArrayBuffer[] {
  const chunks: ArrayBuffer[] = [];
  for (let at = 0; at < bytes.length; at += size) {
    chunks.push(bytes.slice(at, at + size).buffer);
  }
  if (chunks.length === 0) chunks.push(new ArrayBuffer(0));
  return chunks;
}

export const exportMenu = action({
  args: {
    businessId: v.id("businesses"),
    format: v.union(v.literal("pdf"), v.literal("xlsx")),
  },
  returns: v.object({
    fileName: v.string(),
    mimeType: v.string(),
    chunks: v.array(v.bytes()),
  }),
  handler: async (ctx, args) => {
    const source: ExportSource = await ctx.runQuery(internal.menuExport.exportSource, {
      businessId: args.businessId,
    });
    assertExportSize(source.model);
    const stamp = belgradeParts(Date.now());
    const labels = exportLabels(stampDateText(stamp));
    const datePart = `${stamp.year}-${String(stamp.month).padStart(2, "0")}-${String(stamp.day).padStart(2, "0")}`;
    const bytes =
      args.format === "pdf"
        ? buildMenuPdf({ businessName: source.businessName, stamp, model: source.model, labels })
        : buildMenuXlsx({ stamp, model: source.model, labels });
    return {
      fileName: `${source.slug}-meni-${datePart}.${args.format}`,
      mimeType:
        args.format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      chunks: chunkBytes(bytes),
    };
  },
});
