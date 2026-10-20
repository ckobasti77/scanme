// ADMIN v2 — QR kodovi: the sidebar filters (lib/admin-v2/sidebar/configs/operations.ts,
// `qrFilters`) arrive as URL state; this turns that state into the arguments of
// `adminProductReads.listChannels` and filters the rows of the dev preview.
// Same arguments as the filter block above the list sent before.

import type { SidebarState } from "@/lib/admin-v2/sidebar/types";

type Binding = "digital" | "physical";
type Kind = "qr" | "nfc";
type State = "active" | "inactive" | "problem";

export type QrListArgs = {
  search?: string;
  binding?: Binding;
  kind?: Kind;
  state?: State;
  direction: "desc";
};

const BINDINGS: readonly string[] = ["digital", "physical"];
const KINDS: readonly string[] = ["qr", "nfc"];
const STATES: readonly string[] = ["active", "inactive", "problem"];

function pick<Value extends string>(allowed: readonly string[], value: string | undefined): Value | undefined {
  return value !== undefined && allowed.includes(value) ? (value as Value) : undefined;
}

export function qrListArgs(state: SidebarState): QrListArgs {
  const binding = pick<Binding>(BINDINGS, state.veza);
  const kind = pick<Kind>(KINDS, state.vrsta);
  const channelState = pick<State>(STATES, state.status);
  return {
    ...(state.q?.trim() ? { search: state.q } : {}),
    ...(binding ? { binding } : {}),
    ...(kind ? { kind } : {}),
    ...(channelState ? { state: channelState } : {}),
    direction: "desc",
  };
}

export type QrPreviewRow = {
  resolverCode: string;
  smqCode?: string | null;
  smfCode?: string | null;
  accountName: string;
  venueName: string;
  smkCode: string;
  smlCode: string;
  binding: Binding;
  kind: Kind;
  state: State;
};

/** The dev preview has no Convex: the same filters applied to the fixture rows. */
export function filterPreviewChannels<Row extends QrPreviewRow>(rows: readonly Row[], state: SidebarState): Row[] {
  const args = qrListArgs(state);
  const term = args.search?.trim().toLocaleLowerCase("sr-Latn-RS");
  return rows.filter(
    (row) =>
      (!term || `${row.resolverCode} ${row.smqCode ?? ""} ${row.smfCode ?? ""} ${row.accountName} ${row.venueName} ${row.smkCode} ${row.smlCode}`.toLocaleLowerCase("sr-Latn-RS").includes(term)) &&
      (!args.binding || row.binding === args.binding) &&
      (!args.kind || row.kind === args.kind) &&
      (!args.state || row.state === args.state),
  );
}
