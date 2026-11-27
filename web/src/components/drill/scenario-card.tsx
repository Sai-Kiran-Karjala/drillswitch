import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { StartDrillButton, type DrillMode } from "@/components/start-drill-button";
import type { Scenario } from "@/lib/drill/scenario";

/** A drill in the library: what's on fire, which flag, and a button to run it. */
export function ScenarioCard({
  scenario,
  mode,
  actions,
  footnote,
}: {
  scenario: Scenario;
  mode: DrillMode;
  actions?: ReactNode;
  footnote?: ReactNode;
}) {
  const { incident, flag, customers } = scenario;
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-incident/40 font-mono text-incident">
            {incident.severity}
          </Badge>
          <code className="font-mono text-xs text-muted-foreground">{flag.name}</code>
        </div>
        <CardTitle className="text-pretty text-base leading-snug">{incident.title}</CardTitle>
        <CardDescription className="line-clamp-3 text-pretty">{incident.summary}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto text-xs text-muted-foreground">
        {customers.length} identities · {scenario.segments.length} segments
        {scenario.baseline.overrides.length > 0 && ` · ${scenario.baseline.overrides.length} existing override`}
        {footnote}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2">
        <StartDrillButton label="Run this drill" size="sm" mode={mode} scenario={scenario.id} />
        {actions}
      </CardFooter>
    </Card>
  );
}
