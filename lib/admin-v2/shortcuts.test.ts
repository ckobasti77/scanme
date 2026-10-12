import { describe, expect, test } from "vitest";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import {
  ADMIN_GO_SHORTCUTS,
  ADMIN_SHORTCUT_GROUPS,
  GO_SEQUENCE_MS,
  SHORTCUT_IDLE,
  goShortcutKeys,
  isEditableTarget,
  shortcutStep,
  type ShortcutInput,
  type ShortcutState,
} from "./shortcuts";

// ADMIN v2 X4 — the keyboard shortcut state machine (pure, no DOM).

const press = (state: ShortcutState, key: string, extra: Partial<ShortcutInput> = {}) =>
  shortcutStep(state, { key, ctrlKey: false, metaKey: false, altKey: false, editable: false, modal: false, at: 1000, ...extra });

const AREAS = [
  ["d", "/admin"],
  ["k", "/admin/klijenti"],
  ["i", "/admin/inbox"],
  ["z", "/admin/zadaci"],
  ["e", "/admin/dogadjaji"],
  ["f", "/admin/finansije"],
] as const;

describe("G then a letter", () => {
  test("the table has exactly the six areas", () => {
    expect(ADMIN_GO_SHORTCUTS.map((go) => [go.key, go.href])).toEqual(AREAS.map((area) => [...area]));
  });

  test.each(AREAS)("G then %s goes to %s", (key, href) => {
    const first = press(SHORTCUT_IDLE, "g");
    expect(first.action).toBeNull();
    expect(first.state.goAt).toBe(1000);
    const second = press(first.state, key, { at: 1200 });
    expect(second.action).toEqual({ type: "go", href });
    expect(second.state).toEqual(SHORTCUT_IDLE);
  });

  test("capital letters work the same", () => {
    const first = press(SHORTCUT_IDLE, "G");
    expect(first.state.goAt).toBe(1000);
    expect(press(first.state, "K", { at: 1100 }).action).toEqual({ type: "go", href: "/admin/klijenti" });
  });

  test("a bare Shift between the keys does not break the sequence", () => {
    const first = press(SHORTCUT_IDLE, "G");
    const shift = press(first.state, "Shift", { at: 1100 });
    expect(shift.state).toEqual(first.state);
    expect(press(shift.state, "D", { at: 1150 }).action).toEqual({ type: "go", href: "/admin" });
  });

  test("the letter at exactly the limit still counts, after it does not", () => {
    const first = press(SHORTCUT_IDLE, "g");
    expect(press(first.state, "d", { at: 1000 + GO_SEQUENCE_MS }).action).toEqual({ type: "go", href: "/admin" });
    const late = press(first.state, "d", { at: 1000 + GO_SEQUENCE_MS + 1 });
    expect(late.action).toBeNull();
    expect(late.state).toEqual(SHORTCUT_IDLE);
  });

  test("after the timeout the key is read anew: a late slash is page search, a late G starts again", () => {
    const first = press(SHORTCUT_IDLE, "g");
    expect(press(first.state, "/", { at: 5000 }).action).toEqual({ type: "pageSearch" });
    expect(press(first.state, "g", { at: 5000 }).state.goAt).toBe(5000);
  });

  test("a wrong second key cancels the sequence", () => {
    const first = press(SHORTCUT_IDLE, "g");
    const wrong = press(first.state, "x", { at: 1100 });
    expect(wrong.action).toBeNull();
    expect(wrong.state).toEqual(SHORTCUT_IDLE);
    expect(press(wrong.state, "d", { at: 1200 }).action).toBeNull();
  });

  test("a wrong second key that is a shortcut itself does not fire it", () => {
    const first = press(SHORTCUT_IDLE, "g");
    expect(press(first.state, "/", { at: 1100 }).action).toBeNull();
    expect(press(first.state, "?", { at: 1100 }).action).toBeNull();
  });

  test("G without a pending sequence does nothing but remember the time", () => {
    expect(press(SHORTCUT_IDLE, "d").action).toBeNull();
    expect(press(SHORTCUT_IDLE, "d").state).toEqual(SHORTCUT_IDLE);
  });
});

describe("slash and question mark", () => {
  test("/ is page search", () => {
    expect(press(SHORTCUT_IDLE, "/").action).toEqual({ type: "pageSearch" });
  });
  test("? is the help list", () => {
    expect(press(SHORTCUT_IDLE, "?").action).toEqual({ type: "help" });
  });
  test("other keys do nothing", () => {
    for (const key of ["a", "Enter", "Escape", "ArrowDown", "1"]) expect(press(SHORTCUT_IDLE, key).action).toBeNull();
  });
});

describe("where the shortcuts must stay silent", () => {
  test("in a text field no single-key shortcut works", () => {
    const g = press(SHORTCUT_IDLE, "g", { editable: true });
    expect(g.action).toBeNull();
    expect(g.state).toEqual(SHORTCUT_IDLE);
    expect(press(SHORTCUT_IDLE, "d", { editable: true }).action).toBeNull();
    expect(press(SHORTCUT_IDLE, "/", { editable: true }).action).toBeNull();
    expect(press(SHORTCUT_IDLE, "?", { editable: true }).action).toBeNull();
  });

  test("a sequence started outside is cancelled when focus enters a field", () => {
    const first = press(SHORTCUT_IDLE, "g");
    const inField = press(first.state, "d", { editable: true, at: 1100 });
    expect(inField.action).toBeNull();
    expect(inField.state).toEqual(SHORTCUT_IDLE);
    expect(press(inField.state, "d", { at: 1200 }).action).toBeNull();
  });

  test("with a dialog or menu open nothing fires and the sequence is cancelled", () => {
    expect(press(SHORTCUT_IDLE, "g", { modal: true }).state).toEqual(SHORTCUT_IDLE);
    expect(press(SHORTCUT_IDLE, "/", { modal: true }).action).toBeNull();
    expect(press(SHORTCUT_IDLE, "?", { modal: true }).action).toBeNull();
    const first = press(SHORTCUT_IDLE, "g");
    const inModal = press(first.state, "d", { modal: true, at: 1100 });
    expect(inModal.action).toBeNull();
    expect(inModal.state).toEqual(SHORTCUT_IDLE);
  });

  test("with Ctrl, Meta or Alt nothing fires", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(press(SHORTCUT_IDLE, "g", { [mod]: true }).state).toEqual(SHORTCUT_IDLE);
      expect(press(SHORTCUT_IDLE, "/", { [mod]: true }).action).toBeNull();
      expect(press(SHORTCUT_IDLE, "?", { [mod]: true }).action).toBeNull();
      const first = press(SHORTCUT_IDLE, "g");
      expect(press(first.state, "d", { [mod]: true, at: 1100 }).action).toBeNull();
    }
  });
});

describe("isEditableTarget", () => {
  const el = (tagName: string, attrs: Record<string, string> = {}, isContentEditable = false) => ({
    tagName,
    isContentEditable,
    getAttribute: (name: string) => attrs[name] ?? null,
  });

  test.each(["INPUT", "TEXTAREA", "SELECT"])("%s is editable", (tag) => {
    expect(isEditableTarget(el(tag))).toBe(true);
  });
  test("contenteditable is editable", () => {
    expect(isEditableTarget(el("DIV", {}, true))).toBe(true);
    expect(isEditableTarget(el("DIV", { contenteditable: "true" }))).toBe(true);
    expect(isEditableTarget(el("DIV", { contenteditable: "" }))).toBe(true);
    expect(isEditableTarget(el("DIV", { contenteditable: "false" }))).toBe(false);
  });
  test.each(["textbox", "combobox", "searchbox"])("role=%s is editable", (role) => {
    expect(isEditableTarget(el("DIV", { role }))).toBe(true);
  });
  test("an input one types into is editable, whatever its text type", () => {
    for (const type of ["text", "search", "email", "number", "password", "date", "datetime-local", "tel", "url"]) {
      expect({ type, editable: isEditableTarget(el("INPUT", { type })) }).toEqual({ type, editable: true });
    }
    // No type attribute is a text field.
    expect(isEditableTarget(el("INPUT"))).toBe(true);
  });
  test("a radio, a checkbox and a button input are not: focus stays on them after a choice in the sidebar", () => {
    for (const type of ["radio", "checkbox", "button", "submit", "reset", "range", "RADIO"]) {
      expect({ type, editable: isEditableTarget(el("INPUT", { type })) }).toEqual({ type, editable: false });
    }
  });
  test("with focus on a sidebar radio the shortcuts work: G then Z, / and ?", () => {
    const radio = isEditableTarget(el("INPUT", { type: "radio" }));
    const press = (state: ShortcutState, key: string, at: number) => shortcutStep(state, { key, ctrlKey: false, metaKey: false, altKey: false, editable: radio, modal: false, at });
    const first = press({ goAt: null }, "g", 0);
    expect(press(first.state, "z", 200).action).toEqual({ type: "go", href: "/admin/zadaci" });
    expect(press({ goAt: null }, "/", 0).action).toEqual({ type: "pageSearch" });
    expect(press({ goAt: null }, "?", 0).action).toEqual({ type: "help" });
  });
  test("buttons, links, divs and nothing are not", () => {
    expect(isEditableTarget(el("BUTTON"))).toBe(false);
    expect(isEditableTarget(el("A"))).toBe(false);
    expect(isEditableTarget(el("DIV"))).toBe(false);
    expect(isEditableTarget(el("DIV", { role: "button" }))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});

describe("goShortcutKeys", () => {
  test.each(AREAS)("%s gives G %s", (key, href) => {
    expect(goShortcutKeys(href)).toBe(`G ${key.toUpperCase()}`);
  });
  test("ignores the query and a trailing slash", () => {
    expect(goShortcutKeys("/admin/klijenti?status=aktivan")).toBe("G K");
    expect(goShortcutKeys("/admin/inbox/")).toBe("G I");
    expect(goShortcutKeys("/admin?x=1")).toBe("G D");
  });
  test("an area without a shortcut gives null", () => {
    expect(goShortcutKeys("/admin/proizvodi")).toBeNull();
    expect(goShortcutKeys("/admin/klijenti/abc")).toBeNull();
    expect(goShortcutKeys("/")).toBeNull();
  });
});

describe("the shortcut table and the dictionary", () => {
  test("every id in the groups has a name", () => {
    for (const group of ADMIN_SHORTCUT_GROUPS) {
      expect(adminUiSr.shortcuts.groups[group.id]).toBeTruthy();
      for (const item of group.items) expect(adminUiSr.shortcuts.items[item.id]).toBeTruthy();
    }
  });
  test("the go group lists G plus the letter of each area", () => {
    const go = ADMIN_SHORTCUT_GROUPS.find((group) => group.id === "go");
    expect(go?.items.map((item) => item.keys.join(" "))).toEqual(AREAS.map(([key]) => `G ${key.toUpperCase()}`));
    expect(go?.items.every((item) => item.sequence)).toBe(true);
  });
});
