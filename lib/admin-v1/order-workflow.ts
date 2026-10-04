import type {
  AdminOrderDesignKind,
  AdminOrderDesignState,
  AdminOrderFulfillmentState,
  AdminOrderPaymentState,
  AdminOrderView,
} from "../../convex/lib/adminOrderValidators";

export function isDesignReady(
  kind: AdminOrderDesignKind,
  state: AdminOrderDesignState,
) {
  return kind === "template"
    ? state === "template_selected" || state === "approved"
    : state === "approved";
}

export function canRequestProvisioning(input: {
  payment: AdminOrderPaymentState;
  designKind: AdminOrderDesignKind;
  design: AdminOrderDesignState;
  fulfillment: AdminOrderFulfillmentState;
}) {
  return (
    input.payment === "paid" &&
    isDesignReady(input.designKind, input.design) &&
    input.fulfillment === "awaiting_conditions"
  );
}

export function deriveOrderView(
  fulfillment: AdminOrderFulfillmentState,
  archived: boolean,
): AdminOrderView {
  if (archived) return "archived";
  return fulfillment === "delivered" || fulfillment === "cancelled"
    ? "completed"
    : "active";
}

export function deriveFulfillment(input: {
  cancelled: boolean;
  unitCount: number;
  smfCount: number;
  sentCount: number;
  receivedCount: number;
  qcPassedCount: number;
  qcProblemCount: number;
  inDeliveryCount: number;
  deliveredCount: number;
}): AdminOrderFulfillmentState {
  if (input.cancelled) return "cancelled";
  if (input.deliveredCount === input.unitCount && input.unitCount > 0) return "delivered";
  if (input.inDeliveryCount > 0) return "in_delivery";
  if (input.qcPassedCount === input.unitCount && input.unitCount > 0) return "ready_for_delivery";
  if (input.qcPassedCount + input.qcProblemCount > 0) return "quality_control";
  if (input.receivedCount === input.unitCount && input.unitCount > 0) return "received";
  if (input.sentCount > 0) return "at_printer";
  if (input.smfCount === input.unitCount && input.unitCount > 0) return "ready_for_printer";
  if (input.smfCount > 0) return "smf_assigned";
  return "awaiting_conditions";
}

export function paymentState(input: {
  requiredMinor: number;
  settledMinor: number;
  reversedMinor: number;
}): AdminOrderPaymentState {
  const net = input.settledMinor - input.reversedMinor;
  if (input.reversedMinor > 0 && net < input.requiredMinor) return "reversed";
  return net >= input.requiredMinor ? "paid" : "awaiting_payment";
}
