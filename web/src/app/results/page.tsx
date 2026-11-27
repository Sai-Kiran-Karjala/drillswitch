import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { FlaskConical, Users, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StartDrillButton } from "@/components/start-drill-button";
import { Skeleton } from "@/components/ui/skeleton";
import { getConfig } from "@/lib/drill/config";
import {
  getExperiment,
  getExperimentResults,
  type ExperimentInfo,
  type ExperimentResults,
} from "@/lib/drill/flagsmith-admin";

export const metadata: Metadata = { title: "Live results — DrillSwitch" };

const VARIANTS = [
  { key: "control", label: "A · Runbook only" },
  { key: "scope_preview", label: "B · Runbook + blast-radius preview" },
] as const;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;

type Loaded = { info: ExperimentInfo; results: ExperimentResults } | { error: string };

async function load(envKey: string, experimentId: number): Promise<Loaded> {
  try {
    const [info, results] = await Promise.all([
      getExperiment(envKey, experimentId),
      getExperimentResults(envKey, experimentId),
    ]);
    return { info, results };
  } catch (error) {
    console.error("results load failed", error);
    return { error: "Could not reach Flagsmith for results." };
  }
}

function ExperimentPanel({ data, audience }: { data: Loaded; audience: string }) {
  if ("error" in data) {
    return <p className="rounded-lg border border-destructive/40 p-6 text-sm text-destructive">{data.error}</p>;
  }
  const { info, results } = data;
  const totalExposed = VARIANTS.reduce((sum, v) => sum + (results.exposures[v.key] ?? 0), 0);

  if (totalExposed === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">No {audience} have finished a drill yet.</p>
        <StartDrillButton label="Be the first" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {VARIANTS.map((v) => (
          <div key={v.key} className="flex flex-col gap-1 bg-card p-4">
            <dt className="text-xs text-muted-foreground">{v.label}</dt>
            <dd className="font-mono text-2xl font-semibold tabular-nums">
              {results.exposures[v.key] ?? 0}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">players</span>
            </dd>
          </div>
        ))}
      </dl>

      {info.metrics.map((metric) => {
        const row = results.metrics.find((m) => m.metric_id === metric.id);
        const inference = row?.inference.scope_preview;
        return (
          <Card key={metric.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {metric.name}
                <Badge variant="outline" className="font-mono text-xs font-normal">
                  {metric.event}
                </Badge>
                <Badge variant="secondary" className="text-xs font-normal">
                  {metric.direction === "up" ? "higher is better" : "lower is better"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!row ? (
                <p className="text-sm text-muted-foreground">No results yet. Flagsmith recomputes at most every 5 minutes, so check back shortly.</p>
              ) : (
                <Table>
                  <caption className="sr-only">{metric.name} by console version</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead className="text-right">Players</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Lift vs A</TableHead>
                      <TableHead className="text-right">Chance to win</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {VARIANTS.map((v) => {
                      const stats = row.variants[v.key];
                      const isB = v.key === "scope_preview";
                      return (
                        <TableRow key={v.key}>
                          <TableCell className="font-medium">{v.label}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{stats?.n ?? 0}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{stats?.sum ?? 0}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {stats && stats.n ? pct(stats.sum / stats.n) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {isB && inference ? (
                              <span title={`95% interval ${signedPct(inference.ci_low)} to ${signedPct(inference.ci_high)}`}>
                                {signedPct(inference.lift)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {isB && inference ? pct(inference.chance_to_win) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              {inference && (
                <p className="mt-3 text-xs text-muted-foreground">
                  95% credible interval for B&apos;s lift: {signedPct(inference.ci_low)} to {signedPct(inference.ci_high)}.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Computed by Flagsmith&apos;s Bayesian engine{results.asOf ? ` as of ${new Date(results.asOf).toUTCString()}` : ""}.
        Flagsmith recomputes at most once every 5 minutes. Experiment status: {info.status}.
      </p>
    </div>
  );
}

async function LiveResults() {
  await connection();
  const { env, experiments } = getConfig();
  const [human, sim] = await Promise.all([
    load(env.production, experiments.production),
    load(env.simulation, experiments.simulation),
  ]);
  const hypothesis = "info" in human ? human.info.hypothesis : "info" in sim ? sim.info.hypothesis : "";

  return (
    <>
      {hypothesis && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardDescription>Hypothesis</CardDescription>
            <CardTitle className="text-pretty text-base font-normal leading-relaxed">{hypothesis}</CardTitle>
          </CardHeader>
        </Card>
      )}
      <Tabs defaultValue="human" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="human" className="gap-1.5">
            <Users className="size-4" aria-hidden /> Real players
          </TabsTrigger>
          <TabsTrigger value="sim" className="gap-1.5">
            <Bot className="size-4" aria-hidden /> Simulated players
          </TabsTrigger>
        </TabsList>
        <TabsContent value="human">
          <ExperimentPanel data={human} audience="real players" />
        </TabsContent>
        <TabsContent value="sim" className="flex flex-col gap-4">
          <p className="max-w-3xl rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Simulated players run real drills through Flagsmith, in a separate Simulation environment, but they
            decide using a scripted behaviour model (<code className="font-mono text-xs">scripts/simulate.ts</code>).
            They prove the experiment pipeline works end to end. They are not evidence about how people behave.
          </p>
          <ExperimentPanel data={sim} audience="simulated players" />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading results from Flagsmith" className="flex flex-col gap-4">
      <Skeleton className="h-24 max-w-3xl" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-24" />
      <Skeleton className="h-56" />
    </div>
  );
}

export default function ResultsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <FlaskConical className="size-3.5" aria-hidden /> Flagsmith Experimentation · live
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Does a blast-radius preview prevent collateral damage?</h1>
      </div>
      <Suspense fallback={<ResultsSkeleton />}>
        <LiveResults />
      </Suspense>
    </div>
  );
}
