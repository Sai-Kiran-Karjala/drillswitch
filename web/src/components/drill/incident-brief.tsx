import { AlertTriangle, ListChecks, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RUNBOOK, segmentRule, type Scenario } from "@/lib/drill/scenario";

export function IncidentBrief({ scenario }: { scenario: Scenario }) {
  const { incident, flag, baseline } = scenario;
  return (
    <Card className="border-incident/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-incident" aria-hidden />
          Incident brief
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-pretty">{incident.summary}</p>
        <ul className="flex flex-col gap-1.5 font-mono text-xs text-muted-foreground">
          {incident.signals.map((s) => (
            <li key={s} className="flex gap-2">
              <span aria-hidden className="text-incident">
                ›
              </span>
              {s}
            </li>
          ))}
        </ul>
        <p className="rounded-md bg-incident/10 px-3 py-2 font-medium text-foreground">{incident.ask}</p>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">
            <code className="font-mono text-foreground">{flag.name}</code> in Production right now
          </h3>
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {baseline.overrides.map((o) => {
              const segment = scenario.segments.find((g) => g.key === o.segment);
              return (
                <li key={o.segment}>
                  Segment override {o.segment}
                  {segment ? ` (${segmentRule(segment)})` : ""} → {o.enabled ? "ON" : "OFF"}
                </li>
              );
            })}
            <li>Environment default → {baseline.enabled ? "ON" : "OFF"}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function Runbook() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden />
          Runbook: scoped containment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3 text-sm">
          {RUNBOOK.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-xs text-muted-foreground">
                {i + 1}
              </span>
              <span className="text-pretty text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Who is on this flag. Both console versions see it; only version B sees predicted effects. */
export function CustomerRoster({ scenario }: { scenario: Scenario }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Identities on {scenario.flag.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {scenario.customers.map((c) => (
            <li key={c.id} className="flex flex-col rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium">{c.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {Object.entries(c.traits)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
