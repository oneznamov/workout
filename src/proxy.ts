import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Optimistic check only — every page/action re-verifies the session server-side. */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("session");
  const { pathname } = request.nextUrl;
  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|pwa-icon|exercise-media|invite|reset|icon|apple-icon|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
