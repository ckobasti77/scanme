// ADMIN v2 — which admin paths get the frame (sidebar, navbar, screen) and
// what a path means for the sidebar registry. Pure; the layout gate, the
// frame and the registry read the same answers.

/** `/admin/**` paths without the frame: the sign-in screen and the full-screen Links editor. */
const UNFRAMED: readonly RegExp[] = [/^\/admin\/login$/, /^\/admin\/scanme-links\/[^/]+\/editor$/];

function normalize(pathname: string) {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

export function isFramedAdminPath(pathname: string): boolean {
  const path = normalize(pathname);
  return !UNFRAMED.some((pattern) => pattern.test(path));
}

/** The dev preview with one persistent frame over every preview surface. */
export const ADMIN_FRAME_PREVIEW_BASE = "/dev/admin-okvir-preview";
const EVENTS_PREVIEW_BASE = "/dev/admin-events-preview";

/** Single-surface dev previews → the admin route they show. */
const PREVIEW_ROUTES: Readonly<Record<string, string>> = {
  "/dev/admin-dashboard-preview": "/admin",
  "/dev/admin-clients-preview": "/admin/klijenti",
  "/dev/admin-client-profile-preview": "/admin/klijenti/preview",
  "/dev/admin-inbox-preview": "/admin/inbox",
  "/dev/admin-tasks-preview": "/admin/zadaci",
  "/dev/admin-orders-preview": "/admin/operativa/porudzbine",
  "/dev/admin-products-preview": "/admin/operativa/proizvodi",
  "/dev/admin-qr-preview": "/admin/operativa/qr",
  "/dev/admin-services-preview": "/admin/usluge/links",
  "/dev/admin-settings-preview": "/admin/podesavanja",
  "/dev/admin-team-preview": "/admin/tim",
  "/dev/admin-finance-preview": "/admin/finansije",
  "/dev/admin-18-preview": "/admin/pretraga",
  "/dev/admin-mail-preview": "/admin/posta",
};

export type AdminRoute = {
  /** The admin path this page stands for (a dev preview maps to its admin route). */
  key: string;
  /** `Događaji` of one event: the base of its section links and the segments below it. */
  events: { base: string; segments: string[] } | null;
  /** Set inside the persistent dev preview: `/admin/x` links go to `<previewBase>/x`. */
  previewBase: string | null;
};

function segmentsOf(path: string): string[] {
  return path.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

function below(path: string, base: string): string | null {
  if (path === base) return "";
  return path.startsWith(`${base}/`) ? path.slice(base.length) : null;
}

export function adminRoute(pathname: string): AdminRoute {
  const path = normalize(pathname);

  const inFramePreview = below(path, ADMIN_FRAME_PREVIEW_BASE);
  if (inFramePreview !== null) {
    const eventsBase = `${ADMIN_FRAME_PREVIEW_BASE}/dogadjaji`;
    const inEvents = below(path, eventsBase);
    if (inEvents !== null) return { key: `/admin/dogadjaji/preview${inEvents}`, events: { base: eventsBase, segments: segmentsOf(inEvents) }, previewBase: ADMIN_FRAME_PREVIEW_BASE };
    return { key: `/admin${inFramePreview}`, events: null, previewBase: ADMIN_FRAME_PREVIEW_BASE };
  }

  const inEventsPreview = below(path, EVENTS_PREVIEW_BASE);
  if (inEventsPreview !== null) return { key: `/admin/dogadjaji/preview${inEventsPreview}`, events: { base: EVENTS_PREVIEW_BASE, segments: segmentsOf(inEventsPreview) }, previewBase: null };

  if (Object.hasOwn(PREVIEW_ROUTES, path)) return { key: PREVIEW_ROUTES[path], events: null, previewBase: null };

  const event = /^\/admin\/dogadjaji\/([^/]+)(\/.*)?$/.exec(path);
  if (event) return { key: path, events: { base: `/admin/dogadjaji/${event[1]}`, segments: segmentsOf(event[2] ?? "") }, previewBase: null };

  return { key: path, events: null, previewBase: null };
}

/** An admin link as it must be written on this page (the persistent dev preview keeps its own base). */
export function previewHref(href: string, previewBase: string | null): string {
  if (!previewBase || (href !== "/admin" && !href.startsWith("/admin/"))) return href;
  return `${previewBase}${href.slice("/admin".length)}`;
}
