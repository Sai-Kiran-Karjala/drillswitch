import { Suspense } from "react";
import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamsDisabled } from "@/components/dashboard/teams-disabled";
import { clerkEnabled } from "@/lib/saas/clerk-enabled";

export const metadata: Metadata = { title: "Sign in — DrillSwitch" };

export default function SignInPage() {
  if (!clerkEnabled) return <TeamsDisabled />;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Suspense fallback={<Skeleton className="h-[420px] w-full max-w-sm" />}>
        <SignIn />
      </Suspense>
    </div>
  );
}
