// ScanMe Menu V1 (K26) — the pure part of the mailbox OAuth callback: which
// arguments reach completeConnect and where the browser goes back. No URL
// ever carries a token, an authorization code or a provider message.

import { describe, expect, test } from "vitest";
import { MAIL_CALLBACK_SIGN_IN_PATH, mailCallbackRedirect, readMailCallback, readMailReturn } from "./mail-callback";

const STATE = "s".repeat(43);

describe("readMailCallback", () => {
  test("a code and a state go on", () => {
    expect(readMailCallback(new URLSearchParams({ code: "4/0Ab-test_code", state: STATE }))).toEqual({ code: "4/0Ab-test_code", state: STATE });
  });

  test("a declined consent keeps the state (to consume it) and drops the code", () => {
    expect(readMailCallback(new URLSearchParams({ error: "access_denied", state: STATE }))).toEqual({ state: STATE });
    expect(readMailCallback(new URLSearchParams({ error: "access_denied", code: "x", state: STATE }))).toEqual({ state: STATE });
    expect(readMailCallback(new URLSearchParams({ state: STATE }))).toEqual({ state: STATE });
  });

  test("a code with spaces or control characters is not passed", () => {
    expect(readMailCallback(new URLSearchParams({ code: "a b", state: STATE }))).toEqual({ state: STATE });
    expect(readMailCallback(new URLSearchParams({ code: "a\nb", state: STATE }))).toEqual({ state: STATE });
  });

  test("no state, a short one or a malformed one → nothing to complete", () => {
    expect(readMailCallback(new URLSearchParams({ code: "c" }))).toBeNull();
    expect(readMailCallback(new URLSearchParams({ code: "c", state: "short" }))).toBeNull();
    expect(readMailCallback(new URLSearchParams({ code: "c", state: `${"s".repeat(40)}/..` }))).toBeNull();
    expect(readMailCallback(new URLSearchParams({ code: "c", state: "s".repeat(129) }))).toBeNull();
  });
});

describe("readMailReturn", () => {
  test("connected, a known failure, an unknown code, nothing", () => {
    expect(readMailReturn(new URLSearchParams("posta=povezano"))).toEqual({ ishod: "povezano" });
    expect(readMailReturn(new URLSearchParams("posta=greska&kod=mail%2Fscope_missing"))).toEqual({ ishod: "greska", code: "mail/scope_missing" });
    expect(readMailReturn(new URLSearchParams("posta=greska&kod=%3Cscript%3E"))).toEqual({ ishod: "greska", code: "mail/provider_unavailable" });
    expect(readMailReturn(new URLSearchParams("posta=nesto"))).toBeNull();
    expect(readMailReturn(new URLSearchParams(""))).toBeNull();
  });
});

describe("mailCallbackRedirect", () => {
  test("connected → Podešavanja of the venue", () => {
    expect(mailCallbackRedirect({ ok: true, slug: "demo-restoran" })).toBe("/demo-restoran/client-panel/meni/podesavanja?posta=povezano");
  });

  test("a known failure keeps its code", () => {
    expect(mailCallbackRedirect({ ok: false, code: "mail/scope_missing", slug: "demo-restoran" })).toBe(
      "/demo-restoran/client-panel/meni/podesavanja?posta=greska&kod=mail%2Fscope_missing",
    );
  });

  test("an unknown code becomes provider_unavailable (no provider text in the URL)", () => {
    const path = mailCallbackRedirect({ ok: false, code: "invalid_client: secret=abc", slug: "demo-restoran" });
    expect(path).toBe("/demo-restoran/client-panel/meni/podesavanja?posta=greska&kod=mail%2Fprovider_unavailable");
    expect(path).not.toContain("secret");
  });

  test("without a known venue the browser goes to the panel entry", () => {
    expect(mailCallbackRedirect({ ok: false, code: "mail/state_invalid", slug: null })).toBe(
      `${MAIL_CALLBACK_SIGN_IN_PATH}?posta=greska&kod=mail%2Fstate_invalid`,
    );
  });

  test("a slug that is not a slug never builds a path (no open redirect)", () => {
    for (const slug of ["//evil.example", "a/../../b", "https:", "Demo", "-a", "a".repeat(81)]) {
      expect(mailCallbackRedirect({ ok: true, slug }).startsWith(`${MAIL_CALLBACK_SIGN_IN_PATH}?`)).toBe(true);
    }
  });
});
