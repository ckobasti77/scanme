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
    (isProtectedAdminRoute(request) || isProtectedLinksEditorRoute(request)) &&
    !isAdminLogin(request) &&
    !(await convexAuth.isAuthenticated())
  ) {
    return nextjsMiddlewareRedirect(request, "/admin/login");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api)(.*)"],
};
