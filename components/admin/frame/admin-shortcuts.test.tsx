import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ADMIN_GO_SHORTCUTS } from "@/lib/admin-v2/shortcuts";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { AdminShortcuts, AdminShortcutsList } from "./admin-shortcuts";

// ADMIN v2 X4 — the shortcut list markup and a frameless render of the listener.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const dict = adminUiSr.shortcuts;
const kbd = (markup: string) => (markup.match(/<kbd[^>]*>([^<]*)<\/kbd>/g) ?? []).map((tag) => tag.replace(/<[^>]+>/g, ""));

describe("the shortcut list", () => {
  const markup = renderToStaticMarkup(<AdminShortcutsList />);

  test("has all three groups", () => {
    for (const title of Object.values(dict.groups)) expect(markup).toContain(`>${title}<`);
  });

  test("names all six areas and the global rows", () => {
    for (const go of ADMIN_GO_SHORTCUTS) expect(markup).toContain(`>${dict.items[go.id]}<`);
    for (const id of ["palette", "help", "escape", "pageSearch"] as const) expect(markup).toContain(`>${dict.items[id]}<`);
  });

  test("shows the keys as kbd", () => {
    const keys = kbd(markup);
    for (const key of ["Ctrl", "K", "G", "/", "?", "Esc"]) expect(keys).toContain(key);
    expect(keys.filter((key) => key === "G")).toHaveLength(ADMIN_GO_SHORTCUTS.length);
  });

  test("puts the word between the keys of a sequence", () => {
    expect(markup).toContain(`>${dict.then}<`);
    expect(markup.split(`>${dict.then}<`)).toHaveLength(ADMIN_GO_SHORTCUTS.length + 1);
  });

  test("pairs name and keys in a description list and ends with the input note", () => {
    expect(markup).toContain("<dl");
    expect(markup).toContain("<dt");
    expect(markup).toContain("<dd");
    expect(markup).toContain(dict.inputNote);
  });
});

describe("AdminShortcuts", () => {
  test("renders without a frame and without error, the dialog closed", () => {
    const markup = renderToStaticMarkup(<AdminShortcuts />);
    expect(markup).not.toContain('data-admin-dialog="shortcuts"');
  });
});
