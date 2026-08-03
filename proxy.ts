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
