import { v } from "convex/values";

export const adminOrderPaymentStateValidator = v.union(
  v.literal("awaiting_payment"),
  v.literal("paid"),
  v.literal("reversed"),
);

export const adminOrderDesignStateValidator = v.union(
  v.literal("template_selected"),
  v.literal("in_progress"),
  v.literal("awaiting_approval"),
  v.literal("approved"),
);

export const adminOrderFulfillmentStateValidator = v.union(
  v.literal("awaiting_conditions"),
  v.literal("smf_assigned"),
  v.literal("ready_for_printer"),
  v.literal("at_printer"),
  v.literal("received"),
  v.literal("quality_control"),
  v.literal("ready_for_delivery"),
  v.literal("in_delivery"),
  v.literal("delivered"),
  v.literal("cancelled"),
);

export const adminOrderViewValidator = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived"),
);

export const adminOrderPriorityValidator = v.union(
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent"),
);

export const adminOrderDesignKindValidator = v.union(
  v.literal("template"),
  v.literal("custom"),
);

export const adminOrderProductTypeValidator = v.union(
  v.literal("stickers"),
  v.literal("window-film"),
  v.literal("two-piece-stand"),
  v.literal("compact-stand"),
  v.literal("premium-engraved-stand"),
);

export const adminOrderProductConfigValidator = v.object({
  productId: adminOrderProductTypeValidator,
  quantity: v.number(),
  orientation: v.optional(v.union(v.literal("portrait"), v.literal("landscape"))),
  shape: v.optional(v.union(v.literal("square"), v.literal("rectangle"), v.literal("circle"))),
  background: v.optional(v.union(v.literal("white"), v.literal("black"), v.literal("transparent"))),
  finish: v.optional(v.union(v.literal("matte"), v.literal("gloss"))),
  material: v.optional(v.union(v.literal("plastic"), v.literal("acrylic"), v.literal("metal"))),
  woodType: v.optional(v.union(v.literal("oak"), v.literal("walnut"), v.literal("beech"))),
  dimension: v.union(
    v.literal("a4"),
    v.literal("a5"),
    v.literal("a6"),
    v.literal("small"),
    v.literal("medium"),
    v.literal("large"),
  ),
  design: v.union(
    v.object({
      kind: v.literal("template"),
      templateId: v.union(
        v.literal("basic"),
        v.literal("template-1"),
        v.literal("template-2"),
        v.literal("template-3"),
        v.literal("template-4"),
        v.literal("template-5"),
      ),
    }),
    v.object({ kind: v.literal("custom"), brief: v.string() }),
  ),
});

export const adminPrintJobStateValidator = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("partially_received"),
  v.literal("received"),
  v.literal("cancelled"),
);

export const adminDeliveryStateValidator = v.union(
  v.literal("draft"),
  v.literal("in_delivery"),
  v.literal("delivered"),
  v.literal("problem"),
  v.literal("cancelled"),
);

export const adminDeliveryMethodValidator = v.union(
  v.literal("courier"),
  v.literal("personal"),
);

export const adminOrderEventKindValidator = v.union(
  v.literal("migrated"),
  v.literal("assigned"),
  v.literal("payment_recorded"),
  v.literal("payment_reversed"),
  v.literal("design_changed"),
  v.literal("design_approved"),
  v.literal("provisioning_requested"),
  v.literal("smf_assigned"),
  v.literal("print_job_created"),
  v.literal("sent_to_printer"),
  v.literal("printer_receipt_recorded"),
  v.literal("quality_control_recorded"),
  v.literal("delivery_created"),
  v.literal("delivery_started"),
  v.literal("delivery_completed"),
  v.literal("delivery_problem"),
  v.literal("cancelled"),
  v.literal("archived"),
  v.literal("note_changed"),
);

export const adminOrderAxisValidator = v.union(
  v.literal("payment"),
  v.literal("design"),
  v.literal("fulfillment"),
  v.literal("operation"),
);

export type AdminOrderPaymentState =
  | "awaiting_payment"
  | "paid"
  | "reversed";
export type AdminOrderDesignState =
  | "template_selected"
  | "in_progress"
  | "awaiting_approval"
  | "approved";
export type AdminOrderFulfillmentState =
  | "awaiting_conditions"
  | "smf_assigned"
  | "ready_for_printer"
  | "at_printer"
  | "received"
  | "quality_control"
  | "ready_for_delivery"
  | "in_delivery"
  | "delivered"
  | "cancelled";
export type AdminOrderView = "active" | "completed" | "archived";
export type AdminOrderDesignKind = "template" | "custom";
