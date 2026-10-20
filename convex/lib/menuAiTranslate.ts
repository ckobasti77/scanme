// ScanMe Menu V1 (K16) — the AI translation SUGGESTION (master §7.7, P7).
//
// Off unless MENU_AI_TRANSLATE_KEY is set on the deployment: without it no
// network call is ever made and the editor says the suggestion is switched
// off. The provider is the Anthropic Messages API over plain fetch (the run
// adds no npm packages, so the official SDK is not used here). A suggestion is
// only ever STORED NEXT TO the confirmed text (lib/menu/translation-status.ts);
// nothing here publishes anything. Tests stub `fetch` — no real call.
//
// Model: MENU_AI_TRANSLATE_MODEL, default claude-opus-5-5 (thinking is always on
// there, so depth is kept low with effort "low"). Refusals: the server-side
// fallback is requested; a refusal that still comes back is "no suggestion".

export const MENU_AI_DEFAULT_MODEL = "claude-opus-5-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 30_000;

export type AiTranslateConfig = { key: string; model: string };

/** The provider config from the environment, or null (switched off). */
export function aiTranslateConfig(env: { MENU_AI_TRANSLATE_KEY?: string; MENU_AI_TRANSLATE_MODEL?: string }): AiTranslateConfig | null {
  const key = env.MENU_AI_TRANSLATE_KEY?.trim();
  if (!key) return null;
  return { key, model: env.MENU_AI_TRANSLATE_MODEL?.trim() || MENU_AI_DEFAULT_MODEL };
}

export type AiTranslateRequest = {
  /** BCP-47-ish codes (lib/menu/languages.ts): "sr" → "en". */
  from: string;
  to: string;
  /** Field → source text (short menu texts). */
  texts: Record<string, string>;
};

export type AiTranslateResult = { ok: true; texts: Record<string, string> } | { ok: false; reason: "failed" | "refused" };

function prompt(request: AiTranslateRequest): string {
  return [
    `Translate these restaurant menu texts from language "${request.from}" to language "${request.to}".`,
    "Keep dish names that are proper names or local specialities recognisable (you may keep the original word and add a short explanation only if a guest would not understand it).",
    "Do not add prices, allergens or claims that are not in the source. Keep it short and natural for a printed menu.",
    "Answer with ONE JSON object only, no other text, with exactly the same keys as the input.",
    "",
    JSON.stringify(request.texts),
  ].join("\n");
}

/** The first JSON object in the model's text, with string values for exactly the asked keys. */
export function parseAiTexts(text: string, keys: readonly string[]): Record<string, string> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** One request to the provider. Never throws: a failure is `{ ok: false }`. */
export async function aiTranslate(
  config: AiTranslateConfig,
  request: AiTranslateRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiTranslateResult> {
  const keys = Object.keys(request.texts);
  if (keys.length === 0) return { ok: false, reason: "failed" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.key,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4000,
        output_config: { effort: "low" },
        fallbacks: "default",
        messages: [{ role: "user", content: prompt(request) }],
      }),
    });
    if (!response.ok) return { ok: false, reason: "failed" };
    const body = (await response.json()) as { stop_reason?: string; content?: { type?: string; text?: string }[] };
    if (body.stop_reason === "refusal") return { ok: false, reason: "refused" };
    const text = (body.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
    const texts = parseAiTexts(text, keys);
    return texts ? { ok: true, texts } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
