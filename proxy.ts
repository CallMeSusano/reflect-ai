import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) { // ← was "proxy"
  const token = request.cookies.get("auth-token")?.value;

  if (request.nextUrl.pathname.startsWith("/journal")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (request.nextUrl.pathname === "/login") {
    if (token) {
      return NextResponse.redirect(new URL("/journal", request.url));
    }
  }

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