import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedAdminRoute = createRouteMatcher(["/admin", "/admin/(.*)"]);
const isAdminLogin = createRouteMatcher(["/admin/login"]);
const isProtectedLinksEditorRoute = createRouteMatcher(
  /^\/[^/]+\/editor\/?$/,
);
// Venue editor (RFC-001 §2.7, TASK-10): tačno dva segmenta — /{slug}/venue/editor.
// Regex traži literalne segmente "venue" pa "editor" posle sluga, pa ne može da
// uhvati ni /{slug} (nema segmenata posle sluga) ni /{slug}/editor (segment
// posle sluga je "editor", ne "venue"). Postojeći Links matcher iznad ostaje
// netaknut. Provera je pogodnost; autoritet je requireServiceEditorAccess u
// Convex funkcijama.
const isProtectedVenueEditorRoute = createRouteMatcher(
  /^\/[^/]+\/venue\/editor\/?$/,
);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (
    isProtectedLinksEditorRoute(request) &&
    !(await convexAuth.isAuthenticated())
  ) {
    // Editor koriste i klijenti: neprijavljene vodi na klijentsku prijavu
    // lokala iz adrese, a ne na admin login (koji ih posle odbija).
    const slug = request.nextUrl.pathname.split("/")[1] ?? "";
    return nextjsMiddlewareRedirect(request, `/${slug}/client-panel`);
  }
  if (
    isProtectedVenueEditorRoute(request) &&
    !(await convexAuth.isAuthenticated())
  ) {
    // Ista klijentska prijava kao za Links editor (RFC §2.7).
    const slug = request.nextUrl.pathname.split("/")[1] ?? "";
    return nextjsMiddlewareRedirect(request, `/${slug}/client-panel`);
  }
  if (
    isProtectedAdminRoute(request) &&
    !isAdminLogin(request) &&
    !(await convexAuth.isAuthenticated())
  ) {
    return nextjsMiddlewareRedirect(request, "/admin/login");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api)(.*)"],
};
