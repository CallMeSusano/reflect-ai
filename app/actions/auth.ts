"use server";

import { cookies } from "next/headers";

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set("auth-token", token, {
    httpOnly: true,
    // When running in Docker locally (usually without HTTPS), you can set SECURE_COOKIES=false in your compose or env 
    secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("auth-token");
}
