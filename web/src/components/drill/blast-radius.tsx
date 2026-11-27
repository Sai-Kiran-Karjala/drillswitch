"use client";

import { Radar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { beforeOutcome, grade, predictOutcome, type Scenario } from "@/lib/drill/scenario";
import { CustomerTable } from "./customer-table";
import { isComplete, type Draft } from "./change-panel";

/** Variant B: shows, before applying, which customers the drafted change would affect. */
export function BlastRadius({ scenario, draft }: { scenario: Scenario; draft: Draft }) {
  if (!isComplete(draft)) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="size-4 text-muted-foreground" aria-hidden />
            Blast-radius preview
          </CardTitle>
          <CardDescription>Choose an environment, target and action to see who your change affects.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const before = beforeOutcome(scenario);
  const after = predictOutcome(scenario, draft);
  const g = grade(scenario, after, true);
  const changesNothing = scenario.customers.every((c) => after[c.id] === before[c.id]);
  const good = g.verdict === "scoped_recovery";

  return (
    <Card className={cn(good ? "border-success/40" : "border-warning/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="size-4 text-muted-foreground" aria-hidden />
          Blast-radius preview
        </CardTitle>
        <CardDescription aria-live="polite">
          {changesNothing
            ? "This change does not affect any Production customer."
            : `${g.affectedRecovered} of ${g.affectedTotal} affected customers recover · ${g.healthyBroken} of ${g.healthyTotal} healthy customers change.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CustomerTable
          scenario={scenario}
          before={before}
          after={after}
          afterLabel="Predicted"
          caption="Predicted effect of your change on Production customers"
        />
      </CardContent>
    </Card>
  );
}
