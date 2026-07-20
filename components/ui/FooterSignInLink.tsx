"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FooterSignInLink() {
  const pathname = usePathname();
  const callbackUrl = encodeURIComponent(pathname);
  return (
    <Link
      href={`/auth/signin?callbackUrl=${callbackUrl}`}
      className="text-sm text-white/50 hover:text-white transition-colors"
    >
      Sign In
    </Link>
  );
}
