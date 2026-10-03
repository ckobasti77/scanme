// The billing port (RFC-001 §2.3, RFC-002 §2.5, TASK-32 KORAK 0).
//
// This is the ONE seam between ScanMe and any payment provider. The platform
// never talks to a provider directly: everything that records money funnels
// through a `BillingPortAdapter`, whose whole job is to turn provider-specific
// input into one normalized `PaymentNotice`. Wiring a Serbian provider later is
// therefore one file's worth of work: add an adapter object here (verify the
// webhook signature, map the payload), register it in `BILLING_PORTS`, and add
// an httpAction route that calls `internal.billing.applyProviderPayment` with
// the adapter's id. Nothing downstream changes shape — `payments`, the cycle
// advance, and the order transition already speak only PaymentNotice.
//
// TASK-31 temporarily bypassed this seam by writing `billingSource: "manual"` /
// `externalRef` literals on the order; convex/orders.ts now derives those from
// the adapter (`port.source`) instead.
//
// Dependency-free on purpose (no _generated imports): the port is a vocabulary,
// not a database actor. The database work lives in convex/billing.ts.

/** Written to orders.billingSource / accounts.planSource / entitlements.source. */
export type BillingSource = "manual" | "billing";

/** Written to payments.method — how the money was recorded. */
export type PaymentMethod = "manual" | "provider";

/** One normalized payment, the only currency the platform consumes. */
export interface PaymentNotice {
  /** Positive integer RSD amount. */
  amountRsd: number;
  /** When the money actually moved (admin-entered may be backdated). */
  paidAt: number;
  /** Nalog-za-prenos reference / provider transaction id / "na ruke" note. */
  reference?: string;
}

export interface BillingPortAdapter {
  /** "manual" now; a provider slug later (e.g. "chipcard"). */
  id: string;
  source: BillingSource;
  method: PaymentMethod;
  /**
   * Turn raw input into a PaymentNotice, or null when it does not verify.
   * The manual adapter validates admin-entered fields; a provider adapter
   * verifies the webhook signature and maps its payload.
   */
  normalizeNotice(input: unknown): PaymentNotice | null;
}

// The stub implementation: admin-entered payments. Validation here is the same
// gate a provider webhook will pass through, so both paths reject the same junk.
export const manualBillingPort: BillingPortAdapter = {
  id: "manual",
  source: "manual",
  method: "manual",
  normalizeNotice(input) {
    if (typeof input !== "object" || input === null) return null;
    const record = input as Record<string, unknown>;
    const amountRsd = record.amountRsd;
    const paidAt = record.paidAt;
    if (
      typeof amountRsd !== "number" ||
      !Number.isFinite(amountRsd) ||
      amountRsd <= 0
    ) {
      return null;
    }
    if (typeof paidAt !== "number" || !Number.isFinite(paidAt) || paidAt <= 0) {
      return null;
    }
    const reference =
      typeof record.reference === "string" && record.reference.trim() !== ""
        ? record.reference.trim()
        : undefined;
    return {
      amountRsd: Math.round(amountRsd),
      paidAt,
      ...(reference ? { reference } : {}),
    };
  },
};

const BILLING_PORTS: Record<string, BillingPortAdapter> = {
  [manualBillingPort.id]: manualBillingPort,
};

export function getBillingPort(id: string): BillingPortAdapter {
  const port = BILLING_PORTS[id];
  if (!port) throw new Error(`Nepoznat billing-port adapter: ${id}`);
  return port;
}
