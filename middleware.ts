import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;

  // Protect the journal route and its sub-routes
  if (request.nextUrl.pathname.startsWith("/journal")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Redirect authenticated users away from the login page
  if (request.nextUrl.pathname === "/login") {
    if (token) {
      return NextResponse.redirect(new URL("/journal", request.url));
    }
  }

  // Redirect authenticated users from landing page to journal
  if (request.nextUrl.pathname === "/") {
    if (token) {
      return NextResponse.redirect(new URL("/journal", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/journal/:path*", "/login", "/"],
};
