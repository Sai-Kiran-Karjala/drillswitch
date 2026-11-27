import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { OrganizationProfile } from "@clerk/nextjs";
import { Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { NoWorkspace } from "@/components/dashboard/no-workspace";
import { TeamsDisabled } from "@/components/dashboard/teams-disabled";
import { workspaceAccess } from "@/lib/saas/access";
import { getEntitlements, PLANS } from "@/lib/saas/entitlements";
import { getWorkspace, syncSeatLimit } from "@/lib/saas/workspace";

export const metadata: Metadata = { title: "Team — DrillSwitch" };

async function Seats() {
  const { enabled, orgId } = await workspaceAccess();
  if (!enabled) return <TeamsDisabled />;
  if (!orgId) return <NoWorkspace />;
  const workspace = await getWorkspace(orgId);
  const ent = await getEntitlements(orgId, workspace.plan);
  await syncSeatLimit(workspace, ent.maxMembers);
  const full = workspace.members >= ent.maxMembers;
  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Users className="size-5 text-muted-foreground" aria-hidden />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {workspace.members} of {ent.maxMembers} seats used on {PLANS[workspace.plan].name}
            </span>
            <span className="text-xs text-muted-foreground">
              {full && workspace.plan === "free" ? (
                <>
                  Workspace is full.{" "}
                  <Link href="/dashboard/settings" className="underline underline-offset-4 hover:text-foreground">
                    Upgrade to Team
                  </Link>{" "}
                  for {25} seats.
                </>
              ) : (
                "Seat limit is served by the Flagsmith flag max_members and enforced by Clerk."
              )}
            </span>
          </div>
        </div>
        <Progress
          value={Math.min(100, (workspace.members / ent.maxMembers) * 100)}
          aria-label="Seats used"
          className="h-2 sm:w-48"
        />
      </div>
      <OrganizationProfile routing="path" path="/dashboard/team" />
    </>
  );
}

export default function TeamPage() {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading team" className="flex flex-col gap-6">
          <Skeleton className="h-16" />
          <Skeleton className="h-[560px]" />
        </div>
      }
    >
      <Seats />
    </Suspense>
  );
}
