"use client";

const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

export function hasAuthSessionCookie(): boolean {
  if (typeof document === "undefined") return false;

  const cookies = document.cookie || "";
  return SESSION_COOKIE_NAMES.some((name) => cookies.includes(`${name}=`));
}
