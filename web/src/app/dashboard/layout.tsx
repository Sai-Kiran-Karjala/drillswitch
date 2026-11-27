import { Suspense } from "react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Suspense fallback={<div className="h-11" />}>
            <DashboardNav />
          </Suspense>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
