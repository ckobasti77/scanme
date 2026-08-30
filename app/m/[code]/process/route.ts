import { POST as processPost } from "@/app/api/m/[code]/process/route";

// TASK-16 — POST /m/[code]/process: the browser-reachable alias of the
// TASK-15 pipeline route.
//
// Why the alias must exist: the guest cookie is scoped Path=/m/[code]
// (a TASK-14 constraint), and RFC 6265 path-matching means the browser
// attaches it ONLY to request URLs under /m/[code]/ — a fetch to
// /api/m/[code]/process therefore arrives cookie-less and is always 401 from
// a real browser. TASK-15's curl QA passed the Cookie header explicitly, so
// the gap only surfaces now that TASK-16 puts a browser on the other end.
// The handler itself is untouched and keeps living in app/api (its canonical,
// documented home); this file only re-mounts it where the cookie can reach.
//
// The RouteContext literal differs per mount point, but both resolve the same
// `{ code }` params shape — the cast bridges the type-level route name only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/m/[code]/process">,
) {
  return processPost(
    request,
    context as unknown as RouteContext<"/api/m/[code]/process">,
  );
}
