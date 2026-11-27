import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { DrillEditor } from "@/components/dashboard/drill-editor";
import { NoWorkspace } from "@/components/dashboard/no-workspace";
import { TeamsDisabled } from "@/components/dashboard/teams-disabled";
import { getWorkspaceScenario } from "@/lib/drill/scenario-store";
import { workspaceAccess } from "@/lib/saas/access";

export const metadata: Metadata = { title: "Edit drill — DrillSwitch" };

async function EditDrill({ params }: { params: PageProps<"/dashboard/drills/[id]">["params"] }) {
  const { enabled, orgId, isAdmin } = await workspaceAccess();
  if (!enabled) return <TeamsDisabled />;
  if (!orgId) return <NoWorkspace />;
  const { id } = await params;
  const scenario = await getWorkspaceScenario(orgId, id);
  if (!scenario) notFound();
  if (!isAdmin) return <p className="text-sm text-muted-foreground">Only workspace admins can edit drills.</p>;
  return <DrillEditor existing={scenario} />;
}

export default function EditDrillPage({ params }: PageProps<"/dashboard/drills/[id]">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Edit drill</h1>
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <EditDrill params={params} />
      </Suspense>
    </>
  );
}
