/// <reference types="vite/client" />

// Mejl timu za upit sa landinga (convex/leadEmails.ts). NIŠTA SE NE ŠALJE:
// globalni `fetch` je uvek mock, a ključ je testna vrednost.
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { buildLeadEmail } from "./leadEmails";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-09T12:00:00Z");

type ResendCall = {
  url: string;
  key: string | null;
  auth: string | null;
  body: { from: string; to: string[]; subject: string; text: string; html: string; reply_to?: string };
};
let calls: ResendCall[] = [];
let respond: (call: number) => Response = (call) => Response.json({ id: `re_test_message_${call}` });

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  process.env.RESEND_FROM_EMAIL = "ScanMe TEST <test-sender@example.invalid>";
  delete process.env.SCANME_ACTIVATION_REQUEST_EMAIL;
  calls = [];
  respond = (call) => Response.json({ id: `re_test_message_${call}` });
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      key: headers.get("idempotency-key"),
      auth: headers.get("authorization"),
      body: JSON.parse(String(init?.body)),
    });
    return respond(calls.length);
  }));
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.SCANME_ACTIVATION_REQUEST_EMAIL;
});

let sequence = 0;
const leadArgs = (overrides: Partial<FunctionArgs<typeof api.leads.create>> = {}) => ({
  contactName: "Test Posetilac",
  businessName: "TEST Kafić",
  businessType: "Kafić ili restoran",
  city: "Niš",
  email: "posetilac@example.invalid",
  phone: "060 123 4567",
  interest: "not_sure" as const,
  message: "Zanima me: ScanMe Links\n\nProbna poruka.",
  submissionId: `test-lead-submission-${++sequence}-0000`,
  formStartedAt: NOW - 30_000,
  website: "",
  ...overrides,
});

async function setup() {
  const t = convexTest(schema, modules);
  const runAll = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const leads = () => t.run(async (ctx) => await ctx.db.query("leads").take(10));
  return { t, runAll, leads };
}

describe("mejl timu za upit sa landinga", () => {
  test("prihvaćen upit šalje tačno jedan mejl i upisuje ishod na red", async () => {
    const { t, runAll, leads } = await setup();
    expect(await t.mutation(api.leads.create, leadArgs())).toEqual({ status: "accepted" });
    const [queued] = await leads();
    expect(queued.emailStatus).toBe("queued");

    await runAll();

    expect(calls).toHaveLength(1);
    const [lead] = await leads();
    expect(calls[0]).toMatchObject({
      url: "https://api.resend.com/emails",
      key: `scanme-lead/${lead._id}`,
      auth: "Bearer re_test_not_a_real_key",
    });
    expect(calls[0].body.subject).toBe("Novi upit sa scanme.rs — TEST Kafić");
    expect(calls[0].body.text).toContain("Grad: Niš");
    expect(calls[0].body.text).toContain("Zanima me: ScanMe Links");
    expect(calls[0].body.text).toContain("09.10.2026. 14:00 (Europe/Belgrade)");
    expect(lead).toMatchObject({ emailStatus: "sent", emailMessageId: "re_test_message_1" });
    expect(lead.emailFailureReason).toBeUndefined();
  });

  test("duplikat (isti submissionId) ne šalje drugi mejl", async () => {
    const { t, runAll } = await setup();
    const args = leadArgs();
    await t.mutation(api.leads.create, args);
    expect(await t.mutation(api.leads.create, args)).toEqual({ status: "duplicate" });
    await runAll();
    expect(calls).toHaveLength(1);
  });

  test("honeypot i istekla forma ne upisuju upit i ne šalju mejl", async () => {
    const { t, runAll, leads } = await setup();
    await expect(t.mutation(api.leads.create, leadArgs({ website: "https://spam.example" }))).rejects.toThrow();
    await expect(t.mutation(api.leads.create, leadArgs({ formStartedAt: NOW - 100 }))).rejects.toThrow();
    await expect(t.mutation(api.leads.create, leadArgs({ formStartedAt: NOW - 90_000_000 }))).rejects.toThrow();
    await runAll();
    expect(calls).toHaveLength(0);
    expect(await leads()).toHaveLength(0);
  });

  test("svi unosi su HTML-escaped", async () => {
    const { t, runAll } = await setup();
    await t.mutation(api.leads.create, leadArgs({
      contactName: `<script>alert("x")</script>`,
      businessName: `Kafić & "Bar" <b>`,
      message: `<img src=x onerror=alert('x')>`,
    }));
    await runAll();
    const { html, text, subject } = calls[0].body;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Kafić &amp; &quot;Bar&quot; &lt;b&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(&#039;x&#039;)&gt;");
    // tekstualni deo i naslov nisu HTML
    expect(text).toContain(`<script>alert("x")</script>`);
    expect(subject).toBe(`Novi upit sa scanme.rs — Kafić & "Bar" <b>`);
  });

  test("reply_to je imejl posetioca; bez imejla nema reply_to", async () => {
    const { t, runAll } = await setup();
    await t.mutation(api.leads.create, leadArgs({ email: "Posetilac@Example.invalid" }));
    await t.mutation(api.leads.create, leadArgs({ email: undefined, phone: "060 765 4321" }));
    await runAll();
    expect(calls).toHaveLength(2);
    const withEmail = calls.find((call) => call.body.reply_to);
    const withoutEmail = calls.find((call) => !call.body.reply_to);
    expect(withEmail?.body.reply_to).toBe("posetilac@example.invalid");
    expect(withoutEmail).toBeDefined();
    expect(withoutEmail?.body).not.toHaveProperty("reply_to");
  });

  test("primalac: SCANME_ACTIVATION_REQUEST_EMAIL, a bez nje office@scanme.rs", async () => {
    const { t, runAll } = await setup();
    await t.mutation(api.leads.create, leadArgs());
    await runAll();
    expect(calls[0].body.to).toEqual(["office@scanme.rs"]);

    process.env.SCANME_ACTIVATION_REQUEST_EMAIL = "  tim@example.invalid ";
    await t.mutation(api.leads.create, leadArgs());
    await runAll();
    expect(calls[1].body.to).toEqual(["tim@example.invalid"]);
  });

  test("bez Resend podešavanja: neuspeh na redu, bez izuzetka i bez poziva", async () => {
    delete process.env.RESEND_API_KEY;
    const { t, runAll, leads } = await setup();
    expect(await t.mutation(api.leads.create, leadArgs())).toEqual({ status: "accepted" });
    await runAll();
    expect(calls).toHaveLength(0);
    const [lead] = await leads();
    expect(lead).toMatchObject({
      emailStatus: "failed",
      emailFailureReason: "RESEND_API_KEY ili RESEND_FROM_EMAIL nije podešen.",
    });
  });

  test("bez RESEND_FROM_EMAIL: isto neuspeh bez poziva", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const { t, runAll, leads } = await setup();
    await t.mutation(api.leads.create, leadArgs());
    await runAll();
    expect(calls).toHaveLength(0);
    expect((await leads())[0].emailStatus).toBe("failed");
  });

  test("trajna greška Resend-a (bez reply_to) se upisuje kao razlog, upit ostaje sačuvan", async () => {
    respond = () => Response.json({ message: "Invalid `from` field." }, { status: 422 });
    const { t, runAll, leads } = await setup();
    await t.mutation(api.leads.create, leadArgs({ email: undefined }));
    await runAll();
    expect(calls).toHaveLength(1);
    expect((await leads())[0]).toMatchObject({ emailStatus: "failed", emailFailureReason: "Invalid `from` field." });
  });

  test("privremena greška (503, 429, mreža) se ponavlja istim Idempotency-Key, pa mejl ode", async () => {
    let failuresLeft = 2;
    respond = (call) =>
      failuresLeft-- > 0
        ? Response.json({ message: "Service unavailable" }, { status: call === 1 ? 503 : 429 })
        : Response.json({ id: `re_test_message_${call}` });
    const { t, runAll, leads } = await setup();
    await t.mutation(api.leads.create, leadArgs());
    await runAll();
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((call) => call.key)).size).toBe(1);
    expect((await leads())[0]).toMatchObject({ emailStatus: "sent", emailMessageId: "re_test_message_3" });
  });

  test("mrežna greška (fetch baci izuzetak) se ponavlja, pa mejl ode", async () => {
    let calls2 = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls2 += 1;
      if (calls2 === 1) throw new TypeError("fetch failed");
      const headers = new Headers(init?.headers);
      calls.push({ url: String(url), key: headers.get("idempotency-key"), auth: headers.get("authorization"), body: JSON.parse(String(init?.body)) });
      return Response.json({ id: "re_test_message_after_network" });
    }));
    const { t, runAll, leads } = await setup();
    await t.mutation(api.leads.create, leadArgs());
    await runAll();
    expect(calls2).toBe(2);
    expect((await leads())[0]).toMatchObject({ emailStatus: "sent", emailMessageId: "re_test_message_after_network" });
  });

  test("posle tri privremene greške upit ostaje sa emailStatus failed", async () => {
    respond = () => Response.json({ message: "Service unavailable" }, { status: 503 });
    const { t, runAll, leads } = await setup();
    await t.mutation(api.leads.create, leadArgs());
    await runAll();
    expect(calls).toHaveLength(3);
    expect((await leads())[0]).toMatchObject({ emailStatus: "failed", emailFailureReason: "Service unavailable" });
  });

  test("Resend odbije reply_to: jedan novi pokušaj bez reply_to", async () => {
    respond = (call) =>
      call === 1
        ? Response.json({ message: "Invalid `reply_to` field." }, { status: 422 })
        : Response.json({ id: `re_test_message_${call}` });
    const { t, runAll, leads } = await setup();
    await t.mutation(api.leads.create, leadArgs());
    await runAll();
    expect(calls).toHaveLength(2);
    expect(calls[0].body.reply_to).toBe("posetilac@example.invalid");
    expect(calls[1].body).not.toHaveProperty("reply_to");
    expect(calls[1].key).not.toBe(calls[0].key);
    expect((await leads())[0]).toMatchObject({ emailStatus: "sent", emailMessageId: "re_test_message_2" });
  });
});

describe("buildLeadEmail", () => {
  const lead = {
    _id: "lead_test" as Doc<"leads">["_id"],
    _creationTime: NOW,
    contactName: "Ana",
    businessName: "Salon",
    businessType: "Salon ili studio",
    interest: "review",
    submissionId: "test-lead-build-0000",
    status: "new",
    createdAt: NOW,
  } satisfies Doc<"leads">;

  test("polja koja nedostaju su „Nije navedeno“, bez reply_to", () => {
    const email = buildLeadEmail(lead);
    expect(email.text).toContain("Imejl: Nije navedeno");
    expect(email.text).toContain("Zanima me: ScanMe Review");
    expect(email).not.toHaveProperty("replyTo");
  });
});
