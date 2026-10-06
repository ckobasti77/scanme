// Admin UX Z1 — the document an incoming HTML message is shown in
// (ADMIN-UX-ZAHTEVI §10, A0 §7 "CSP i iframe"). There is no global CSP header
// (next.config.* is not ours) and no sanitizer library (no new packages), so
// the protection is layered:
//   1. <iframe sandbox> without allow-scripts / allow-same-origin / allow-forms
//      / allow-top-navigation (MAIL_FRAME_SANDBOX);
//   2. a CSP <meta> as the first element of <head>: nothing loads but data:/
//      cid: images and inline styles; remote images only after "Prikaži slike";
//   3. defence in depth on the source: scripts, frames, objects, <meta>,
//      <base>, <link>, inline event handlers and javascript: links are removed,
//      and while images are blocked remote image URLs are not even attempted.
// Links open in a new tab with noopener/noreferrer.

/** Popups only, so a link can open in a new tab; nothing else is allowed. */
export const MAIL_FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

export function mailContentSecurityPolicy(allowRemoteImages: boolean) {
  return [
    "default-src 'none'",
    `img-src data: cid:${allowRemoteImages ? " https:" : ""}`,
    "style-src 'unsafe-inline'",
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

const FRAME_STYLE =
  "html{color-scheme:light}body{margin:0;padding:16px;background:#fff;color:#1d201c;" +
  "font:14px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow-wrap:anywhere}" +
  "img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#1d4ed8}";

const ACTIVE_BLOCKS = /<(script|iframe|frame|frameset|object|embed|applet|noembed|template)\b[\s\S]*?<\/\1\s*>/gi;
const ACTIVE_TAGS = /<\/?(?:script|iframe|frame|frameset|object|embed|applet|noembed|template|base|link|meta)\b[^>]*>/gi;
const EVENT_HANDLER = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URL =
  /(\s(?:href|src|action|formaction|xlink:href)\s*=\s*)(?:"\s*(?:javascript|vbscript):[^"]*"|'\s*(?:javascript|vbscript):[^']*'|(?:javascript|vbscript):[^\s>]*)/gi;

/** Removes active content from an incoming message (defence in depth; the sandbox and CSP are the barrier). */
export function stripActiveMailContent(html: string) {
  return html
    .replace(ACTIVE_BLOCKS, "")
    .replace(ACTIVE_TAGS, "")
    .replace(/<[a-z][^>]*>/gi, (tag) => tag.replace(EVENT_HANDLER, "").replace(SCRIPT_URL, '$1"#"'))
    .replace(/<a\b/gi, '<a rel="noopener noreferrer" target="_blank"');
}

const REMOTE_URL = /^\s*(?:https?:)?\/\//i;
const IMG_URL_ATTRIBUTE = /(\s)(src|srcset)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi;
const REMOTE_BACKGROUND_ATTRIBUTE = /(\s)background(\s*=\s*["']?\s*(?:https?:)?\/\/)/gi;
const REMOTE_CSS_URL = /url\(\s*["']?\s*(?:https?:)?\/\/[^)]*\)/gi;

/**
 * While images are blocked nothing remote is even attempted (no request, no
 * tracking pixel, no CSP report): remote img src/srcset and background
 * attributes are renamed to data-blocked-*, CSS url() becomes `none`.
 */
export function blockRemoteMailImages(html: string) {
  return html
    .replace(/<img\b[^>]*>/gi, (tag) =>
      tag.replace(IMG_URL_ATTRIBUTE, (match, space: string, name: string, equals: string, value: string) =>
        name.toLowerCase() === "srcset" || REMOTE_URL.test(value.replace(/^["']/, "")) ? `${space}data-blocked-${name}${equals}${value}` : match,
      ),
    )
    .replace(/<[a-z][^>]*>/gi, (tag) => tag.replace(REMOTE_BACKGROUND_ATTRIBUTE, "$1data-blocked-background$2"))
    .replace(REMOTE_CSS_URL, "none");
}

/** True when the message would load an image or background from the network. */
export function mailHasRemoteImages(html: string) {
  return (
    /<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html) ||
    /url\(\s*["']?\s*(?:https?:)?\/\//i.test(html) ||
    /\bbackground\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html)
  );
}

export function buildMailSrcDoc(html: string, options: { allowRemoteImages: boolean }) {
  const body = stripActiveMailContent(html);
  return (
    "<!doctype html><html><head>" +
    `<meta http-equiv="Content-Security-Policy" content="${mailContentSecurityPolicy(options.allowRemoteImages)}">` +
    '<meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank">' +
    `<style>${FRAME_STYLE}</style></head><body>${options.allowRemoteImages ? body : blockRemoteMailImages(body)}</body></html>`
  );
}
