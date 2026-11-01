import { fairModelKeySpecs, type FairKeySpec } from "@/components/fair/model-key-specs";
import type { FairPublicModel } from "@/lib/fair-contract";
import { fairModelPriceLabel, fairModelPriceValue } from "@/lib/fair-client/model-price";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import type { FairGarageDict } from "@/lib/i18n/types";

// =============================================================================
// AMF 1 Nov 2026 — the "Sačuvaj garažu" email. Pure: the gateway
// (lib/fair-server/garage-email.ts) renders it once per request and Convex
// sends it as-is. Table layout, inline styles, ~600 px, the fair app's paper,
// ink and orange tokens (app/sajam/fair-event.css .fair-event--auto-moto), the
// app font with a safe stack, a dark-mode block for clients that honor it, a
// plain-text twin, no tracking pixel and no text inside images.
// =============================================================================

export type FairGarageEmailModel = Pick<
  FairPublicModel,
  "eventSlug" | "slug" | "brandName" | "displayName" | "priceText" | "priceSecondaryText" | "photoUrl" | "specificationGroups"
>;

export type FairGarageEmailInput = {
  models: readonly FairGarageEmailModel[];
  /** Public origin of the site ("https://scanme.rs"); photos and model links are made absolute against it. */
  baseUrl: string;
  /** `/sajam/{event}/garaza?vrati={code}` on `baseUrl`. */
  garageUrl: string;
  /** Public event slug of the model pages. */
  publicEventSlug: string;
  dict: FairGarageDict;
};

export type FairGarageEmail = { subject: string; text: string; html: string };

const C = {
  paper: "#f4efe6",
  sheet: "#fbf8f2",
  surface: "#fffdf8",
  line: "#e4dccd",
  ink: "#171918",
  muted: "#62615d",
  accent: "#e2602a",
  accentStrong: "#b8461a",
  accentInk: "#fffdf8",
  photo: "#e9e5dc",
};
const FONT = `'Archivo Variable', Archivo, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const PHOTO_WIDTH = 536;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

function absoluteUrl(url: string, baseUrl: string) {
  return /^https?:\/\//i.test(url) ? url : `${baseUrl.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

/** The model name without a leading brand ("Ford Kuga" → "Kuga"). */
function modelName(model: FairGarageEmailModel) {
  const name = oneLine(model.displayName);
  const brand = oneLine(model.brandName);
  return brand && name.toLowerCase().startsWith(`${brand.toLowerCase()} `) ? name.slice(brand.length + 1) : name;
}

/** Price lines exactly as the model page shows them; "na upit" becomes "Cena na upit". */
export function fairGarageEmailPrice(model: FairGarageEmailModel, dict: Pick<FairGarageDict, "garageEmailPriceOnRequest">) {
  const onRequest = "na upit";
  const value = fairModelPriceValue(model.priceText, { priceOnRequest: onRequest });
  if (value === onRequest) return { label: null, value: dict.garageEmailPriceOnRequest, secondary: model.priceSecondaryText?.trim() || null };
  // Only the AMF Škoda label ("Cena izloženog vozila") is shown; plain "Cena" adds nothing next to a price.
  const label = fairModelPriceLabel(model.eventSlug, model.brandName, fairModelSr);
  return { label: label === fairModelSr.priceLabel ? null : label, value, secondary: model.priceSecondaryText?.trim() || null };
}

function specText(spec: FairKeySpec) {
  const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("sr") + value.slice(1);
  if (spec.kind === "engine") return oneLine(`${spec.value.replace(",", ".")} ${spec.qualifier}`);
  if (spec.kind === "transmission") return spec.qualifier ? capitalize(spec.qualifier) : oneLine(`${spec.value} ${spec.unit}`);
  if (spec.kind === "fuel" || spec.kind === "drive") return spec.value;
  return oneLine(`${spec.value} ${spec.unit}`);
}

/** 2–3 key-spec tiles of the model page in one short line ("142 kW · 2.0 TDI · Automatski"). */
export function fairGarageEmailSpecs(model: FairGarageEmailModel) {
  const specs = model.specificationGroups.flatMap((group) => group.items);
  const tiles = fairModelKeySpecs(specs, model.eventSlug === "auto-moto-fest-2026").map(specText).filter((text) => text && text.length <= 24);
  return [...new Set(tiles)].slice(0, 3).join(" · ");
}

export function fairGarageEmailIntro(count: number, dict: FairGarageDict) {
  const category = srPluralCategory(count);
  return fmt(category === "one" ? dict.garageEmailIntroOne : category === "few" ? dict.garageEmailIntroFew : dict.garageEmailIntroMany, { count });
}

function modelCard(model: FairGarageEmailModel, input: FairGarageEmailInput) {
  const brand = oneLine(model.brandName);
  const name = modelName(model);
  const price = fairGarageEmailPrice(model, input.dict);
  const specs = fairGarageEmailSpecs(model);
  const url = absoluteUrl(`/sajam/${input.publicEventSlug}/model/${model.slug}`, input.baseUrl);
  const photo = model.photoUrl
    ? `<tr><td class="g-photo" style="padding:0;background:${C.photo};border-radius:16px 16px 0 0;overflow:hidden;line-height:0;font-size:0">`
      + `<a href="${escapeHtml(url)}" style="text-decoration:none"><img src="${escapeHtml(absoluteUrl(model.photoUrl, input.baseUrl))}" width="${PHOTO_WIDTH}" alt="${escapeHtml(`${brand} ${name}`)}" style="display:block;width:100%;max-width:${PHOTO_WIDTH}px;height:auto;border:0;border-radius:16px 16px 0 0;color:${C.muted};font-family:${FONT};font-size:14px;line-height:20px"></a></td></tr>`
    : "";
  return `<tr><td style="padding:0 0 16px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="g-card" style="border-collapse:separate;background:${C.surface};border:1px solid ${C.line};border-radius:16px">`
    + photo
    + `<tr><td style="padding:16px 20px 20px;font-family:${FONT}">`
    + `<p class="g-muted" style="margin:0 0 2px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted}">${escapeHtml(brand)}</p>`
    + `<p class="g-ink" style="margin:0;font-size:26px;line-height:30px;font-weight:800;letter-spacing:-0.03em;color:${C.ink}">${escapeHtml(name)}</p>`
    + (price.label ? `<p class="g-muted" style="margin:12px 0 0;font-size:12px;line-height:16px;color:${C.muted}">${escapeHtml(price.label)}</p>` : "")
    + `<p class="g-ink" style="margin:${price.label ? "2px" : "12px"} 0 0;font-size:20px;line-height:26px;font-weight:800;color:${C.ink}">${escapeHtml(price.value)}</p>`
    + (price.secondary ? `<p class="g-muted" style="margin:2px 0 0;font-size:13px;line-height:18px;color:${C.muted}">${escapeHtml(price.secondary)}</p>` : "")
    + (specs ? `<p class="g-ink" style="margin:12px 0 0;font-size:14px;line-height:20px;font-weight:600;color:${C.ink}">${escapeHtml(specs)}</p>` : "")
    + `<p style="margin:14px 0 0;font-size:14px;line-height:20px;font-weight:700"><a href="${escapeHtml(url)}" class="g-link" style="color:${C.accentStrong};text-decoration:underline">${escapeHtml(input.dict.garageEmailViewModel)}</a></p>`
    + `</td></tr></table></td></tr>`;
}

export function renderFairGarageEmail(input: FairGarageEmailInput): FairGarageEmail {
  const { dict } = input;
  const count = input.models.length;
  const intro = fairGarageEmailIntro(count, dict);
  const contact = dict.garageEmailContact;
  const footer = [dict.garageEmailFooterRequested, dict.garageEmailFooterPrivacy, fmt(dict.garageEmailFooterContact, { email: contact })];

  const text = [
    dict.garageEmailTitle,
    intro,
    `${dict.garageEmailOpen}: ${input.garageUrl}`,
    ...input.models.map((model) => {
      const price = fairGarageEmailPrice(model, dict);
      const specs = fairGarageEmailSpecs(model);
      const url = absoluteUrl(`/sajam/${input.publicEventSlug}/model/${model.slug}`, input.baseUrl);
      return [
        `${oneLine(model.brandName).toLocaleUpperCase("sr")} ${modelName(model)}`,
        [price.label, price.value].filter(Boolean).join(": "),
        price.secondary,
        specs || null,
        `${dict.garageEmailViewModel}: ${url}`,
      ].filter(Boolean).join("\n");
    }),
    "—",
    footer.join("\n"),
  ].join("\n\n");

  const button = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.accent}" class="g-button" style="border-radius:999px;background:${C.accent}">`
    + `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(input.garageUrl)}" style="height:52px;v-text-anchor:middle;width:536px" arcsize="50%" stroke="f" fillcolor="${C.accent}"><center style="color:${C.accentInk};font-family:Arial,sans-serif;font-size:17px;font-weight:bold">${escapeHtml(dict.garageEmailOpen)}</center></v:roundrect><![endif]-->`
    + `<!--[if !mso]><!--><a href="${escapeHtml(input.garageUrl)}" style="display:block;padding:16px 24px;font-family:${FONT};font-size:17px;line-height:20px;font-weight:800;color:${C.accentInk};text-decoration:none;border-radius:999px">${escapeHtml(dict.garageEmailOpen)}</a><!--<![endif]-->`
    + `</td></tr></table>`;

  const html = `<!doctype html><html lang="sr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">`
    + `<title>${escapeHtml(dict.garageEmailSubject)}</title>`
    + `<style>`
    + `body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%}`
    + `@media (max-width:620px){.g-outer{padding:16px 12px!important}.g-sheet{padding:20px 16px!important;border-radius:16px!important}}`
    + `@media (prefers-color-scheme:dark){`
    + `.g-body,.g-outer{background:#151412!important}.g-sheet{background:#1f1d1a!important;border-color:#3a352e!important}`
    + `.g-card{background:#26231f!important;border-color:#3a352e!important}.g-photo{background:#2f2b26!important}`
    + `.g-ink{color:#f4efe6!important}.g-muted{color:#bdb4a8!important}.g-link{color:#f08a5d!important}.g-rule{border-color:#3a352e!important}}`
    + `[data-ogsc] .g-ink{color:#f4efe6!important}[data-ogsc] .g-muted{color:#bdb4a8!important}[data-ogsc] .g-link{color:#f08a5d!important}`
    + `</style></head>`
    + `<body class="g-body" style="margin:0;padding:0;background:${C.paper}">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(dict.garageEmailPreheader)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background:${C.paper}"><tr><td align="center" class="g-outer" style="padding:32px 16px">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">`
    // Header: the fair lockup (orange bar, ScanMe, event name).
    + `<tr><td style="padding:0 4px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td width="5" bgcolor="${C.accent}" style="width:5px;background:${C.accent};border-radius:3px;font-size:0;line-height:0">&nbsp;</td>`
    + `<td style="padding-left:10px;font-family:${FONT}">`
    + `<p class="g-ink" style="margin:0;font-size:16px;line-height:18px;font-weight:800;letter-spacing:-0.02em;text-transform:uppercase;color:${C.ink}">${escapeHtml(dict.garageEmailBrandMark)}</p>`
    + `<p class="g-muted" style="margin:3px 0 0;font-size:10px;line-height:12px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:${C.muted}">${escapeHtml(dict.garageEmailEventName)}</p>`
    + `</td></tr></table></td></tr>`
    // Sheet: title, intro, the main button, one card per model.
    + `<tr><td class="g-sheet" bgcolor="${C.sheet}" style="padding:28px 32px 16px;background:${C.sheet};border:1px solid ${C.line};border-radius:24px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    + `<tr><td style="font-family:${FONT}">`
    + `<h1 class="g-ink" style="margin:0;font-size:30px;line-height:34px;font-weight:800;letter-spacing:-0.035em;color:${C.ink}">${escapeHtml(dict.garageEmailTitle)}</h1>`
    + `<p class="g-muted" style="margin:10px 0 0;font-size:16px;line-height:24px;color:${C.muted}">${escapeHtml(intro)}</p>`
    + `</td></tr>`
    + `<tr><td style="padding:22px 0 24px">${button}</td></tr>`
    + input.models.map((model) => modelCard(model, input)).join("")
    + `</table></td></tr>`
    // Footer.
    + `<tr><td style="padding:20px 8px 0;font-family:${FONT}">`
    + footer.map((line, index) => `<p class="g-muted" style="margin:${index === 0 ? "0" : "4px 0 0"};font-size:12px;line-height:18px;color:${C.muted}">${index === 2 ? escapeHtml(line).replace(escapeHtml(contact), `<a href="mailto:${escapeHtml(contact)}" class="g-link" style="color:${C.accentStrong}">${escapeHtml(contact)}</a>`) : escapeHtml(line)}</p>`).join("")
    + `</td></tr>`
    + `</table></td></tr></table></body></html>`;

  return { subject: oneLine(dict.garageEmailSubject), text, html };
}
