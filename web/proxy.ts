import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie means no point rendering the app.
 * The real check (token lookup + expiry) happens in lib/dal.ts on every request.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("pp_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
