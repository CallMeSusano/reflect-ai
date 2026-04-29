"use server";

import { cookies } from "next/headers";

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("auth-token");
}
