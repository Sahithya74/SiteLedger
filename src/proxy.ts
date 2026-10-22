import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: visitors without a session cookie are sent to the
 * login page before any page code runs. The real check (is the session valid,
 * what may this user do) happens on the server in every page and action.
 */
const PUBLIC_PATHS = ["/login", "/setup"];
const SESSION_COOKIES = ["sitecore_session", "__Host-sitecore_session"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" || pathname === "/dashboard" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|webmanifest)$).*)"],
};
