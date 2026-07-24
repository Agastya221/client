"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function TransitionContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const viewKey = `${pathname}_${viewParam || ""}`;

  return (
    <div key={viewKey} className="page-transition-enter w-full">
      {children}
    </div>
  );
}

export default function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="w-full">{children}</div>}>
      <TransitionContent>{children}</TransitionContent>
    </Suspense>
  );
}
