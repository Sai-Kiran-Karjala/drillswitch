import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DrillEditor } from "@/components/dashboard/drill-editor";
import { NoWorkspace } from "@/components/dashboard/no-workspace";
import { TeamsDisabled } from "@/components/dashboard/teams-disabled";
import { workspaceAccess } from "@/lib/saas/access";
import { getEntitlements } from "@/lib/saas/entitlements";
import { getWorkspace } from "@/lib/saas/workspace";

export const metadata: Metadata = { title: "New drill — DrillSwitch" };

async function NewDrill() {
  const { enabled, orgId, isAdmin } = await workspaceAccess();
  if (!enabled) return <TeamsDisabled />;
  if (!orgId) return <NoWorkspace />;
  const workspace = await getWorkspace(orgId);
  const ent = await getEntitlements(orgId, workspace.plan);
  if (!isAdmin || ent.customDrills <= 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Writing your own drills is part of the Team plan." : "Only workspace admins can write drills."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/drills">Back to drills</Link>
        </Button>
      </div>
    );
  }
  return <DrillEditor />;
}

export default function NewDrillPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">New drill</h1>
        <p className="text-sm text-muted-foreground">
          Describe a fire your team could really face. The editor checks it can be won with one Flagsmith change.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <NewDrill />
      </Suspense>
    </>
  );
}
