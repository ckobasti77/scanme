// ADMIN v2 X4 — keyboard shortcuts "like in a game": G then a letter goes to an
// area, "/" focuses page search, "?" opens the list. Pure state machine, no
// DOM and no React; the component feeds it key events.

export type ShortcutId =
  | "palette"
  | "help"
  | "pageSearch"
  | "goDashboard"
  | "goClients"
  | "goInbox"
  | "goTasks"
  | "goEvents"
  | "goFinance"
  | "escape";

export const ADMIN_GO_SHORTCUTS: readonly { id: ShortcutId; key: string; href: string }[] = [
  { id: "goDashboard", key: "d", href: "/admin" },
  { id: "goClients", key: "k", href: "/admin/klijenti" },
  { id: "goInbox", key: "i", href: "/admin/inbox" },
  { id: "goTasks", key: "z", href: "/admin/zadaci" },
  { id: "goEvents", key: "e", href: "/admin/dogadjaji" },
  { id: "goFinance", key: "f", href: "/admin/finansije" },
];

export const ADMIN_SHORTCUT_GROUPS: readonly {
  id: "global" | "go" | "page";
  items: readonly { id: ShortcutId; keys: readonly string[]; sequence?: boolean }[];
}[] = [
  {
    id: "global",
    items: [
      { id: "palette", keys: ["Ctrl", "K"] },
      { id: "help", keys: ["?"] },
      { id: "escape", keys: ["Esc"] },
    ],
  },
  {
    id: "go",
    items: ADMIN_GO_SHORTCUTS.map((go) => ({ id: go.id, keys: ["G", go.key.toUpperCase()], sequence: true })),
  },
  { id: "page", items: [{ id: "pageSearch", keys: ["/"] }] },
];

/** "G D" for "/admin", "G K" for "/admin/klijenti"…; null when the area has no shortcut. */
export function goShortcutKeys(href: string): string | null {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const go = ADMIN_GO_SHORTCUTS.find((item) => item.href === path);
  return go ? `G ${go.key.toUpperCase()}` : null;
}

/** The window event the profile menu fires to open the shortcut list. */
export const ADMIN_SHORTCUTS_EVENT = "scanme-admin:shortcuts";
/** How long G waits for the area letter. */
export const GO_SEQUENCE_MS = 1500;
/** V3: `G` was pressed and the letter of an area is awaited (detail: true) or not any more (false); the navbar shows a chip. */
export const ADMIN_GO_PENDING_EVENT = "scanme-admin:go-pending";

export type ShortcutInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Focus is in a text field. */
  editable: boolean;
  /** A dialog or menu is open. */
  modal: boolean;
  /** Event time in ms. */
  at: number;
};
export type ShortcutAction = { type: "go"; href: string } | { type: "pageSearch" } | { type: "help" };
export type ShortcutState = { goAt: number | null };
export const SHORTCUT_IDLE: ShortcutState = { goAt: null };

export function shortcutStep(state: ShortcutState, input: ShortcutInput): { state: ShortcutState; action: ShortcutAction | null } {
  if (input.editable || input.modal || input.ctrlKey || input.metaKey || input.altKey) {
    return { state: SHORTCUT_IDLE, action: null };
  }
  // Holding Shift for "G", "D" or "?" must not break a pending sequence.
  if (input.key === "Shift") return { state, action: null };

  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const pending = state.goAt !== null && input.at - state.goAt <= GO_SEQUENCE_MS;

  if (pending) {
    const go = ADMIN_GO_SHORTCUTS.find((item) => item.key === key);
    if (go) return { state: SHORTCUT_IDLE, action: { type: "go", href: go.href } };
    // Any other key cancels the sequence; a second G starts a new one.
    return { state: key === "g" ? { goAt: input.at } : SHORTCUT_IDLE, action: null };
  }

  if (key === "g") return { state: { goAt: input.at }, action: null };
  if (key === "/") return { state: SHORTCUT_IDLE, action: { type: "pageSearch" } };
  if (key === "?") return { state: SHORTCUT_IDLE, action: { type: "help" } };
  return { state: SHORTCUT_IDLE, action: null };
}

const EDITABLE_TAGS = new Set(["TEXTAREA", "SELECT"]);
/** Inputs nobody types text into: the views and filters of the sidebar are radios, and focus stays on them after a choice. */
const NOT_TYPED_INPUTS = new Set(["radio", "checkbox", "button", "submit", "reset", "range", "color", "file", "image"]);
const EDITABLE_ROLES = new Set(["textbox", "combobox", "searchbox"]);

export function isEditableTarget(
  target: { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null | undefined,
): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  if (tag && EDITABLE_TAGS.has(tag)) return true;
  if (tag === "INPUT" && !NOT_TYPED_INPUTS.has((target.getAttribute?.("type") ?? "text").toLowerCase())) return true;
  if (target.isContentEditable) return true;
  const contentEditable = target.getAttribute?.("contenteditable");
  if (contentEditable !== null && contentEditable !== undefined && contentEditable !== "false") return true;
  const role = target.getAttribute?.("role");
  return role ? EDITABLE_ROLES.has(role.toLowerCase()) : false;
}
