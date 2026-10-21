// ScanMe Menu V1 (K27) — machine codes of Operativa in the client panel: the
// one quiet reminder ("ping") to the waiter responsible for a request (master
// §13.5; plan docs/meni/planovi/K24.md K24-20). Dependency-free like ./core.ts;
// the Serbian text lives in the `menu-domen` dictionary (`errors[code]`).
export const OPERATIONS_ERROR = {
  /**
   * Nobody from the staff is responsible for the request: it is still new, an
   * Owner or Manager account took it, or it is finished or cancelled.
   */
  noResponsible: "ping/no_responsible",
  /** A reminder for this request was sent less than 5 minutes ago. */
  tooSoon: "ping/too_soon",
} as const;

export type OperationsErrorCode = (typeof OPERATIONS_ERROR)[keyof typeof OPERATIONS_ERROR];
