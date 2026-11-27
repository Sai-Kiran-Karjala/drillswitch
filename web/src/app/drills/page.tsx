import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScenarioCard } from "@/components/drill/scenario-card";
import { StartDrillButton } from "@/components/start-drill-button";
import { BUILT_IN_SCENARIOS } from "@/lib/drill/scenario";

export const metadata: Metadata = { title: "Drill library — DrillSwitch" };

export default function DrillsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Drill library</h1>
          <p className="text-pretty text-muted-foreground">
            Each drill is a different fire. Sometimes the fix is a segment, sometimes one customer, sometimes the
            environment default. Every change runs against a real Flagsmith flag and is graded on what Flagsmith then
            serves.
          </p>
        </div>
        <StartDrillButton label="Surprise me" variant="outline" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BUILT_IN_SCENARIOS.map((s) => (
          <ScenarioCard key={s.id} scenario={s} mode="demo" />
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-dashed p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">Drill your own stack</h2>
          <p className="text-sm text-muted-foreground">
            On the Team plan, write drills with your own flags, segments and customers, and track who on the rotation
            has practised each one.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 gap-1.5">
          <Link href="/dashboard/drills">
            Team drills <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
