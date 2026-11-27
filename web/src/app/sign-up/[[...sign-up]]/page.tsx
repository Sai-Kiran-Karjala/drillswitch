import { Suspense } from "react";
import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamsDisabled } from "@/components/dashboard/teams-disabled";
import { clerkEnabled } from "@/lib/saas/clerk-enabled";

export const metadata: Metadata = { title: "Start free — DrillSwitch" };

export default function SignUpPage() {
  if (!clerkEnabled) return <TeamsDisabled />;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Suspense fallback={<Skeleton className="h-[480px] w-full max-w-sm" />}>
        <SignUp />
      </Suspense>
    </div>
  );
}
