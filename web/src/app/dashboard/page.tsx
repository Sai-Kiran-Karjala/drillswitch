import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleDashed, CircleAlert, Server, Cloud, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NoWorkspace } from "@/components/dashboard/no-workspace";
import { TeamsDisabled } from "@/components/dashboard/teams-disabled";
import { StartDrillButton } from "@/components/start-drill-button";
import { listMembers, workspaceAccess } from "@/lib/saas/access";
import { workspaceReadiness } from "@/lib/saas/db";
import { getEntitlements, PLANS } from "@/lib/saas/entitlements";
import { getWorkspace, syncSeatLimit } from "@/lib/saas/workspace";
import { BUILT_IN_SCENARIOS, describeChange, FIX_KIND_LABELS, fixKind, type Verdict } from "@/lib/drill/scenario";
import { listWorkspaceScenarios } from "@/lib/drill/scenario-store";

export const metadata: Metadata = { title: "Team readiness — DrillSwitch" };

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  scoped_recovery: { label: "Scoped fix", className: "border-success/40 text-success" },
  collateral_damage: { label: "Collateral damage", className: "border-destructive/40 text-destructive" },
  not_recovered: { label: "Not recovered", className: "border-warning/40 text-warning" },
  out_of_time: { label: "Out of time", className: "border-warning/40 text-warning" },
};

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const secs = (v: number | null) => (v == null ? "—" : `${Math.round(v)}s`);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const ago = (d: Date) => {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

async function Readiness() {
  const { enabled, orgId } = await workspaceAccess();
  if (!enabled) return <TeamsDisabled />;
  if (!orgId) return <NoWorkspace />;

  const workspace = await getWorkspace(orgId);
  const [ent, members] = await Promise.all([getEntitlements(orgId, workspace.plan), listMembers(orgId)]);
  await syncSeatLimit(workspace, ent.maxMembers);
  const [{ summary, members: stats, recent, coverage }, own] = await Promise.all([
    workspaceReadiness(orgId, ent.historyDays),
    listWorkspaceScenarios(orgId),
  ]);
  const covered = new Map(coverage.map((c) => [c.scenarioId, c]));
  const library = [...BUILT_IN_SCENARIOS, ...own];
  const byUser = new Map(stats.map((s) => [s.userId, s]));
  const ready = members.filter((m) => (byUser.get(m.userId)?.scoped ?? 0) > 0).length;

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{PLANS[workspace.plan].name} plan</Badge>
            <Badge variant="outline" className="gap-1.5 font-normal">
              {workspace.mode === "byo" ? (
                <>
                  <Server className="size-3" aria-hidden /> Your Flagsmith · {workspace.byo?.organisationName}
                </>
              ) : (
                <>
                  <Cloud className="size-3" aria-hidden /> Hosted Flagsmith sandbox
                </>
              )}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{workspace.name} readiness</h1>
          <p className="text-sm text-muted-foreground">
            {ready} of {members.length} {members.length === 1 ? "person has" : "people have"} landed a scoped fix in the
            last {ent.historyDays} days.
          </p>
        </div>
        <StartDrillButton mode="workspace" label="Run a team drill" />
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        {[
          { label: "Drills run", value: String(summary.drills) },
          { label: "Scoped-fix rate", value: pct(summary.scoped, summary.drills) },
          { label: "Collateral-damage rate", value: pct(summary.collateral, summary.drills) },
          { label: "Median time to scoped fix", value: secs(summary.medianScopedSeconds) },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1 bg-card p-4">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="font-mono text-2xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle className="text-base">On-call rotation</CardTitle>
              <CardDescription>Everyone in the workspace and how their drills went.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/dashboard/team">
                <UserPlus className="size-4" aria-hidden /> Invite
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <caption className="sr-only">Drill readiness per teammate</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Drills</TableHead>
                  <TableHead className="text-right">Scoped</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Best time</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Last drill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const s = byUser.get(m.userId);
                  const status = !s
                    ? { icon: CircleDashed, label: "Not drilled", className: "text-muted-foreground" }
                    : s.scoped > 0
                      ? { icon: CircleCheck, label: "Ready", className: "text-success" }
                      : { icon: CircleAlert, label: "Needs practice", className: "text-warning" };
                  return (
                    <TableRow key={m.userId}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-7">
                            <AvatarImage src={m.imageUrl} alt="" />
                            <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                          </Avatar>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{m.name}</span>
                            {m.role === "org:admin" && <span className="text-xs text-muted-foreground">Admin</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 text-sm ${status.className}`}>
                          <status.icon className="size-4" aria-hidden /> {status.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{s?.drills ?? 0}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{s?.scoped ?? 0}</TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                        {secs(s?.bestSeconds ?? null)}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                        {s ? ago(s.lastAt) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent drills</CardTitle>
            <CardDescription>The last 10 in this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No drills yet. Run the first one, then invite your on-call rotation.
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{r.userName}</span>
                      <Badge variant="outline" className={`shrink-0 font-normal ${VERDICT[r.verdict].className}`}>
                        {VERDICT[r.verdict].label}
                      </Badge>
                    </div>
                    <span className="truncate text-xs text-foreground/80">{r.scenarioTitle}</span>
                    <code className="truncate font-mono text-xs text-muted-foreground">
                      {describeChange(r.change, undefined, r.flagName)}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {secs(r.elapsedMs / 1000)} · {ago(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drill coverage</CardTitle>
          <CardDescription>
            Which kinds of fire the rotation has put out in the last {ent.historyDays} days. Gaps are the next drills to
            run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <caption className="sr-only">Drills by scenario</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Drill</TableHead>
                <TableHead className="hidden md:table-cell">Fix practised</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">People with a scoped fix</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Run it</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {library.map((s) => {
                const c = covered.get(s.id);
                const kind = fixKind(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.incident.title}</div>
                      <div className="text-xs text-muted-foreground">{s.workspaceId ? "Team drill" : "Built-in"}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {kind ? FIX_KIND_LABELS[kind] : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{c?.drills ?? 0}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {c?.people ? (
                        `${c.people} of ${members.length}`
                      ) : (
                        <span className="text-warning">None yet</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      <StartDrillButton label="Run" size="sm" variant="outline" mode="workspace" scenario={s.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        History window ({ent.historyDays} days) and seat limit ({ent.maxMembers}) come from Flagsmith flags{" "}
        <code className="font-mono">drill_history_days</code> and <code className="font-mono">max_members</code>,
        targeted by plan.
      </p>
    </>
  );
}

function ReadinessSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading team readiness" className="flex flex-col gap-6">
      <Skeleton className="h-20 w-2/3" />
      <Skeleton className="h-24" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<ReadinessSkeleton />}>
      <Readiness />
    </Suspense>
  );
}
