import Link from "next/link";
import { BarChart3, CheckCircle2, CircleSlash, Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { explainFix, solutions, type Scenario, type Verdict } from "@/lib/drill/scenario";
import type { DrillResult } from "@/lib/drill/sessions";
import { StartDrillButton, type DrillMode } from "@/components/start-drill-button";
import { CustomerTable } from "./customer-table";
import { describeChange } from "@/lib/drill/scenario";

const VERDICTS: Record<Verdict, { title: string; body: string; icon: typeof CheckCircle2; tone: string }> = {
  scoped_recovery: {
    title: "Scoped recovery",
    body: "Every affected customer recovered and every healthy customer kept what they had.",
    icon: CheckCircle2,
    tone: "border-success/40 bg-success/10 text-success",
  },
  collateral_damage: {
    title: "Collateral damage",
    body: "Your change also reached healthy customers who were not part of the incident.",
    icon: CircleSlash,
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  not_recovered: {
    title: "Incident still open",
    body: "Some affected customers are still hit by the incident.",
    icon: XCircle,
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  out_of_time: {
    title: "Out of time",
    body: "The change landed after the 90-second window, so it does not count as a first-response fix.",
    icon: Clock,
    tone: "border-warning/40 bg-warning/10 text-warning",
  },
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function ResultView({
  scenario,
  result,
  mode = "demo",
}: {
  scenario: Scenario;
  result: DrillResult;
  mode?: DrillMode;
}) {
  const verdict = VERDICTS[result.grade.verdict];
  const before = Object.fromEntries(result.customers.map((c) => [c.id, c.before]));
  const after = Object.fromEntries(result.customers.map((c) => [c.id, c.after]));
  const isCorrect = result.grade.verdict === "scoped_recovery";
  const fix = isCorrect ? result.change : solutions(scenario)[0];

  return (
    <div className="flex flex-col gap-6">
      <div role="status" className={cn("flex items-start gap-3 rounded-lg border p-5", verdict.tone)}>
        <verdict.icon className="mt-0.5 size-6 shrink-0" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{verdict.title}</h2>
          <p className="text-sm text-foreground/80">{verdict.body}</p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <Stat label="Time to change" value={`${(result.elapsedMs / 1000).toFixed(1)}s`} />
        <Stat label="Affected recovered" value={`${result.grade.affectedRecovered}/${result.grade.affectedTotal}`} />
        <Stat label="Healthy broken" value={`${result.grade.healthyBroken}/${result.grade.healthyTotal}`} />
      </dl>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What Flagsmith now serves in Production</CardTitle>
          <CardDescription>Each customer was re-evaluated by Flagsmith after your change.</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerTable
            scenario={scenario}
            before={before}
            after={after}
            caption="Flagsmith evaluation of every customer after your change"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your change</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs">{describeChange(result.change, scenario)}</code>
            <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
              {result.flagsmithCall}
            </code>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isCorrect ? "Why it worked" : "The scoped fix"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            {fix && (
              <>
                <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
                  {describeChange(fix, scenario)}
                </code>
                <p className="text-pretty">{explainFix(scenario, fix)}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <StartDrillButton label="Run another drill" mode={mode} />
        {!isCorrect && (
          <StartDrillButton label="Retry this drill" mode={mode} scenario={scenario.id} variant="outline" />
        )}
        {mode === "workspace" ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <BarChart3 className="size-4" aria-hidden /> Back to your team&apos;s readiness
          </Link>
        ) : (
          <Link
            href="/results"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <BarChart3 className="size-4" aria-hidden /> See how both console versions are doing
          </Link>
        )}
      </div>
    </div>
  );
}
