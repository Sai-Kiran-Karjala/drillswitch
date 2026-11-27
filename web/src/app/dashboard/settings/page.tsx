import { Suspense } from "react";
import type { Metadata } from "next";
import { Check, Cloud, Lock, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NoWorkspace } from "@/components/dashboard/no-workspace";
import { TeamsDisabled } from "@/components/dashboard/teams-disabled";
import { ConnectFlagsmithForm, DisconnectFlagsmithButton, PlanButton } from "@/components/dashboard/settings-forms";
import { workspaceAccess } from "@/lib/saas/access";
import { getEntitlements, PLANS, type Entitlements, type Plan } from "@/lib/saas/entitlements";
import { getWorkspace } from "@/lib/saas/workspace";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Plan & Flagsmith — DrillSwitch" };

function features(e: Entitlements) {
  return [
    `${e.maxMembers} seats`,
    `${e.historyDays}-day drill history`,
    e.byoFlagsmith ? "Connect your own Flagsmith" : "Hosted Flagsmith sandbox only",
  ];
}

async function Settings() {
  const { enabled, orgId, isAdmin } = await workspaceAccess();
  if (!enabled) return <TeamsDisabled />;
  if (!orgId) return <NoWorkspace />;
  const workspace = await getWorkspace(orgId);
  const [free, team] = await Promise.all([getEntitlements(orgId, "free"), getEntitlements(orgId, "team")]);
  const plans: { key: Plan; ent: Entitlements }[] = [
    { key: "free", ent: free },
    { key: "team", ent: team },
  ];
  const current = workspace.plan === "team" ? team : free;

  return (
    <>
      <section aria-labelledby="plan-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 id="plan-heading" className="text-2xl font-semibold tracking-tight">
            Plan
          </h1>
          <p className="text-sm text-muted-foreground">
            Limits are Flagsmith flags targeted by a <code className="font-mono">team_plan</code> segment, so changing a
            plan is a trait change, not a deploy. Payments are not wired up in this demo.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map(({ key, ent }) => {
            const active = workspace.plan === key;
            return (
              <Card key={key} className={cn(active && "border-foreground/40")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {PLANS[key].name}
                    {active && <Badge variant="secondary">Current</Badge>}
                  </CardTitle>
                  <CardDescription>{PLANS[key].blurb}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="font-mono text-xl font-semibold">{PLANS[key].price}</p>
                  <ul className="flex flex-col gap-2 text-sm">
                    {features(ent).map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="size-4 text-success" aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                {!active && isAdmin && (
                  <CardFooter>
                    <PlanButton
                      plan={key}
                      label={key === "team" ? "Upgrade to Team (demo, no card)" : "Move to Free"}
                      variant={key === "team" ? "default" : "outline"}
                    />
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
        {!isAdmin && <p className="text-sm text-muted-foreground">Only workspace admins can change the plan.</p>}
      </section>

      <section aria-labelledby="fs-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="fs-heading" className="text-xl font-semibold tracking-tight">
            Where drills run
          </h2>
          <p className="text-sm text-muted-foreground">
            Every drill creates a throwaway copy of <code className="font-mono">new_checkout</code>, applies the
            player&apos;s change with real segment overrides, and asks Flagsmith what each customer now gets.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {workspace.mode === "byo" ? (
                <>
                  <Server className="size-4" aria-hidden /> Your Flagsmith
                </>
              ) : (
                <>
                  <Cloud className="size-4" aria-hidden /> Hosted Flagsmith sandbox
                </>
              )}
            </CardTitle>
            <CardDescription>
              {workspace.mode === "byo" && workspace.byo
                ? `Connected to “${workspace.byo.organisationName}” at ${workspace.byo.url}, project #${workspace.byo.projectId}.`
                : workspace.hostedProjectId
                  ? "Private Production and Staging environments in DrillSwitch's Flagsmith, created for this workspace."
                  : "Private Production and Staging environments in DrillSwitch's Flagsmith are created on your first drill."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workspace.mode === "byo" ? (
              isAdmin ? (
                <DisconnectFlagsmithButton />
              ) : (
                <p className="text-sm text-muted-foreground">Only admins can change the connection.</p>
              )
            ) : !current.byoFlagsmith ? (
              <div className="flex items-start gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  Connecting your own Flagsmith organisation is part of the Team plan (flag{" "}
                  <code className="font-mono">byo_flagsmith</code>). Drills then run in a project inside your account,
                  so your team practises on the tool they use during real incidents.
                </p>
              </div>
            ) : isAdmin ? (
              <ConnectFlagsmithForm />
            ) : (
              <p className="text-sm text-muted-foreground">Ask a workspace admin to connect your Flagsmith.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading settings" className="flex flex-col gap-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-48" />
        </div>
      }
    >
      <Settings />
    </Suspense>
  );
}
