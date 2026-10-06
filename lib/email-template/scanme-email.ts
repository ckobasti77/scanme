import { postaSr as dict } from "../i18n/sr/posta";

// Admin UX Z2 — the one ScanMe email template of Pošta (ADMIN-UX-ZAHTEVI §10:
// "svako poslato pismo je umotano u isti ScanMe HTML template"). A pure
// function: the same text gives the same HTML and plain-text alternative in
// the Convex send action, in "Pregled pisma" and in tests.
//
// - Style of the existing ScanMe emails (Arial, ink #151713, accent #c6ff4a;
//   convex/lib/fairEmails.ts, convex/invitationEmails.ts) and the wordmark
//   colours (Scan #273331, Me #668f00; app/globals.css .scanme-wordmark). The
//   logo is the text wordmark: no remote image, so it shows even where mail
//   clients block images.
// - Layout is email-client tables with inline styles only.
// - Everything the user wrote is escaped first; only this small markup is then
//   applied: blank line = new paragraph, line break = <br>, **bold**,
//   [text](https://…) and bare http(s) links (only http, https and mailto),
//   and | a | b | rows as a table.
// - A quoted or forwarded message is foreign content: it is escaped plain text,
//   never its original HTML.

export const SCANME_EMAIL_SITE_URL = "https://www.scanme.rs";

const FONT = "Arial,Helvetica,sans-serif";
const COLORS = {
  ink: "#151713",
  soft: "#3d4239",
  muted: "#5f645a",
  border: "#e3e6dc",
  canvas: "#f4f5f0",
  accent: "#c6ff4a",
  wordmarkInk: "#273331",
  wordmarkAccent: "#668f00",
  link: "#3f6b00",
  quoteBorder: "#d5d9cc",
} as const;

export type ScanMeEmailQuote =
  | { kind: "reply"; header: string; text: string }
  | { kind: "forward"; header: string; lines: { label: string; value: string }[]; text: string };

export type ScanMeEmailInput = {
  bodyText: string;
  signatureText?: string | null;
  quote?: ScanMeEmailQuote | null;
  /** Only for the document <title>. */
  subject?: string;
};

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function normalizeText(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

// On already-escaped text: [label](url) | bare http(s) URL.
const LINK_OR_URL = /\[([^\]\n]{1,300})\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|(https?:\/\/[^\s<]+)/gi;
const TRAILING_PUNCTUATION = /(?:[.,;:!?)\]]|&quot;|&#039;|&gt;)+$/;

function linkTag(href: string, label: string) {
  return `<a href="${href}" style="color:${COLORS.link};text-decoration:underline;">${label}</a>`;
}

function inlineHtml(escaped: string) {
  const linked = escaped.replace(LINK_OR_URL, (match, label: string | undefined, url: string | undefined, bare: string | undefined) => {
    if (label !== undefined && url !== undefined) return linkTag(url, label);
    if (!bare) return match;
    const trailing = bare.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const href = bare.slice(0, bare.length - trailing.length);
    return href.length > "https://".length ? `${linkTag(href, href)}${trailing}` : match;
  });
  // **bold** only outside the <a …> tags just made (never inside an href).
  return linked
    .split(/(<a\b[^>]*>)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")))
    .join("");
}

function inlineText(value: string) {
  return value
    .replace(/\[([^\]\n]{1,300})\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/gi, (_, label: string, url: string) =>
      label === url ? url : `${label} (${url})`,
    )
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "$1");
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function tableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function tableHtml(lines: string[]) {
  const hasHeader = lines.length > 1 && TABLE_SEPARATOR.test(lines[1]);
  const rows = lines.filter((line) => !TABLE_SEPARATOR.test(line)).map(tableCells);
  const cell = (value: string, header: boolean) => {
    const tag = header ? "th" : "td";
    const style = `text-align:left;vertical-align:top;padding:8px 10px;border:1px solid ${COLORS.border};${header ? `background:${COLORS.canvas};font-weight:700;` : ""}`;
    return `<${tag} style="${style}">${inlineHtml(escapeEmailHtml(value))}</${tag}>`;
  };
  const body = rows.map((row, index) => `<tr>${row.map((value) => cell(value, hasHeader && index === 0)).join("")}</tr>`).join("");
  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:1.5;color:${COLORS.ink};">${body}</table>`;
}

/** The writer's text as HTML blocks (paragraphs and tables). */
export function scanMeBodyHtml(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  return normalized
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => TABLE_ROW.test(line) || TABLE_SEPARATOR.test(line)) && lines.some((line) => TABLE_ROW.test(line))) {
        return tableHtml(lines);
      }
      return `<p style="margin:0 0 16px;">${lines.map((line) => inlineHtml(escapeEmailHtml(line))).join("<br>")}</p>`;
    })
    .join("");
}

function escapedLines(text: string) {
  return normalizeText(text).split("\n").map(escapeEmailHtml).join("<br>");
}

function quoteHtml(quote: ScanMeEmailQuote) {
  if (quote.kind === "reply") {
    return (
      `<div style="margin-top:24px;">` +
      `<p style="margin:0 0 8px;color:${COLORS.muted};font-size:13px;">${escapeEmailHtml(quote.header)}</p>` +
      `<blockquote style="margin:0;padding:0 0 0 12px;border-left:3px solid ${COLORS.quoteBorder};color:${COLORS.muted};font-size:14px;line-height:1.5;">${escapedLines(quote.text)}</blockquote>` +
      `</div>`
    );
  }
  const lines = quote.lines.map((line) => `<strong>${escapeEmailHtml(line.label)}:</strong> ${escapeEmailHtml(line.value)}`).join("<br>");
  return (
    `<div style="margin-top:24px;color:${COLORS.soft};font-size:14px;line-height:1.5;">` +
    `<p style="margin:0 0 12px;color:${COLORS.muted};">${escapeEmailHtml(quote.header)}<br>${lines}</p>` +
    `<div>${escapedLines(quote.text)}</div>` +
    `</div>`
  );
}

function quoteText(quote: ScanMeEmailQuote) {
  const text = normalizeText(quote.text);
  if (quote.kind === "reply") {
    return `${quote.header}\n${text.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")}`;
  }
  return `${quote.header}\n${quote.lines.map((line) => `${line.label}: ${line.value}`).join("\n")}\n\n${text}`;
}

export function renderScanMeEmail(input: ScanMeEmailInput): { html: string; text: string } {
  const body = scanMeBodyHtml(input.bodyText);
  const signature = input.signatureText ? normalizeText(input.signatureText) : "";
  const signatureHtml = signature
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid ${COLORS.border};color:${COLORS.soft};font-size:14px;line-height:1.5;">${signature
        .split("\n")
        .map((line) => inlineHtml(escapeEmailHtml(line)))
        .join("<br>")}</div>`
    : "";
  const quote = input.quote ? quoteHtml(input.quote) : "";
  const title = input.subject ? escapeEmailHtml(input.subject) : dict.email.footer;

  const html =
    `<!doctype html><html lang="sr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">` +
    `<title>${title}</title></head>` +
    `<body style="margin:0;padding:0;background:${COLORS.canvas};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.canvas};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:12px;">` +
    `<tr><td style="padding:20px 28px;border-bottom:3px solid ${COLORS.accent};font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.5px;">` +
    `<span style="color:${COLORS.wordmarkInk};">Scan</span><span style="color:${COLORS.wordmarkAccent};">Me</span></td></tr>` +
    `<tr><td style="padding:24px 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.ink};">${body}${signatureHtml}${quote}</td></tr>` +
    `<tr><td style="padding:16px 28px;border-top:1px solid ${COLORS.border};font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted};">` +
    `${escapeEmailHtml(dict.email.footer)} · <a href="${SCANME_EMAIL_SITE_URL}" style="color:${COLORS.muted};">${escapeEmailHtml(dict.email.footerLink)}</a></td></tr>` +
    `</table></td></tr></table></body></html>`;

  const textParts = [normalizeText(inlineText(input.bodyText))];
  if (signature) textParts.push(`-- \n${inlineText(signature)}`);
  if (input.quote) textParts.push(quoteText(input.quote));
  textParts.push(`--\n${dict.email.footer} · ${SCANME_EMAIL_SITE_URL}`);
  return { html, text: textParts.filter(Boolean).join("\n\n") };
}
