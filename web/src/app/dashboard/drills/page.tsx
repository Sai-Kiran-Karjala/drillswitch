import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteDrillButton } from "@/components/dashboard/delete-drill-button";
import { NoWorkspace } from "@/components/dashboard/no-workspace";
import { TeamsDisabled } from "@/components/dashboard/teams-disabled";
import { ScenarioCard } from "@/components/drill/scenario-card";
import { BUILT_IN_SCENARIOS } from "@/lib/drill/scenario";
import { listWorkspaceScenarios } from "@/lib/drill/scenario-store";
import { workspaceAccess } from "@/lib/saas/access";
import { getEntitlements } from "@/lib/saas/entitlements";
import { getWorkspace } from "@/lib/saas/workspace";

export const metadata: Metadata = { title: "Drills — DrillSwitch" };

async function Drills() {
  const { enabled, orgId, isAdmin } = await workspaceAccess();
  if (!enabled) return <TeamsDisabled />;
  if (!orgId) return <NoWorkspace />;

  const workspace = await getWorkspace(orgId);
  const [ent, own] = await Promise.all([getEntitlements(orgId, workspace.plan), listWorkspaceScenarios(orgId)]);
  const canWrite = isAdmin && ent.customDrills > 0 && own.length < ent.customDrills;

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{workspace.name} drills</h1>
            <p className="text-sm text-muted-foreground">
              Drills written for your own stack. Results count toward the team&apos;s readiness.
            </p>
          </div>
          {ent.customDrills > 0 &&
            isAdmin &&
            (canWrite ? (
              <Button asChild className="gap-1.5">
                <Link href="/dashboard/drills/new">
                  <Plus className="size-4" aria-hidden /> New drill
                </Link>
              </Button>
            ) : (
              <Button disabled className="gap-1.5">
                <Plus className="size-4" aria-hidden /> Drill limit reached
              </Button>
            ))}
        </div>

        {ent.customDrills <= 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              Writing your own drills is part of the Team plan.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/settings">See plans</Link>
            </Button>
          </div>
        ) : own.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No team drills yet.{" "}
            {isAdmin
              ? "Start from the example in the editor, then swap in your own flag, segments and customers."
              : "Ask a workspace admin to write one."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {own.map((s) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                mode="workspace"
                actions={
                  isAdmin && (
                    <>
                      <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                        <Link href={`/dashboard/drills/${s.id}`}>
                          <Pencil className="size-4" aria-hidden /> Edit
                        </Link>
                      </Button>
                      <DeleteDrillButton id={s.id} title={s.incident.title} />
                    </>
                  )
                }
              />
            ))}
          </div>
        )}
        {ent.customDrills > 0 && (
          <p className="text-xs text-muted-foreground">
            {own.length} of {ent.customDrills} drills used. The limit is the Flagsmith flag{" "}
            <code className="font-mono">custom_drills</code>, targeted by plan.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Built-in drills</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT_IN_SCENARIOS.map((s) => (
            <ScenarioCard key={s.id} scenario={s} mode="workspace" />
          ))}
        </div>
      </section>
    </>
  );
}

export default function DashboardDrillsPage() {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading drills" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      }
    >
      <Drills />
    </Suspense>
  );
}
