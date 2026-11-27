"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { solutions } from "@/lib/drill/scenario";
import type { DrillResult, PublicSession } from "@/lib/drill/sessions";
import { StartDrillButton } from "@/components/start-drill-button";
import { BlastRadius } from "./blast-radius";
import { ChangePanel, describeChange, isComplete, type Draft } from "./change-panel";
import { Countdown } from "./countdown";
import { CustomerRoster, IncidentBrief, Runbook } from "./incident-brief";
import { ResultView } from "./result-view";

function secondsUntil(deadline: number) {
  return Math.ceil((deadline - Date.now()) / 1000);
}

export function DrillConsole({ session }: { session: PublicSession }) {
  const { scenario } = session;
  const { incident } = scenario;
  const [draft, setDraft] = useState<Draft>({});
  const [result, setResult] = useState<DrillResult | null>(session.result);
  const [applying, setApplying] = useState(false);
  // Start from a value server and client agree on; the first tick corrects it to the real clock.
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil((session.deadline - session.startedAt) / 1000));
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (result) return;
    const tick = () => setSecondsLeft(secondsUntil(session.deadline));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [result, session.deadline]);

  useEffect(() => {
    if (result) headingRef.current?.focus();
  }, [result]);

  const timeUp = secondsLeft <= 0 && !result;

  async function apply() {
    if (!isComplete(draft)) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/drill/${session.id}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Flagsmith rejected the change.");
      setResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-incident/40 font-mono text-incident">
              {incident.severity}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {incident.id} · detected {incident.detectedAt}
            </span>
            {session.practice && (
              <Badge variant="secondary" className="font-normal" title="Only your first drill counts toward the live A/B test.">
                Practice run · not counted in the experiment
              </Badge>
            )}
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none sm:text-3xl">
            {result ? "Drill complete" : incident.title}
          </h1>
        </div>
        {!result && <Countdown secondsLeft={secondsLeft} />}
      </div>

      {result ? (
        <ResultView scenario={scenario} result={result} mode={session.kind} />
      ) : timeUp ? (
        <div role="status" className="flex flex-col gap-4 rounded-lg border border-warning/40 bg-warning/10 p-6">
          <h2 className="text-xl font-semibold text-warning">Time&apos;s up</h2>
          <p className="text-sm text-foreground/80">
            No change landed within 90 seconds, so the incident is still open. The scoped fix was:
          </p>
          {solutions(scenario)[0] && (
            <code className="w-fit rounded-md bg-muted px-3 py-2 font-mono text-xs">
              {describeChange(solutions(scenario)[0], scenario)}
            </code>
          )}
          <div>
            <StartDrillButton label="Try this drill again" mode={session.kind} scenario={scenario.id} />
          </div>
        </div>
      ) : (
        // Mobile order: brief → change panel → preview/runbook. Desktop: panel pinned in the right column.
        <div className="grid gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] lg:pb-0">
          <div className="lg:col-start-1 lg:row-start-1">
            <IncidentBrief scenario={scenario} />
          </div>
          <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <ChangePanel
              scenario={scenario}
              draft={draft}
              onChange={setDraft}
              onApply={apply}
              applying={applying}
              disabled={timeUp}
              sandboxFlag={session.featureName}
            />
          </div>
          <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-2">
            {session.variant === "scope_preview" && <BlastRadius scenario={scenario} draft={draft} />}
            <CustomerRoster scenario={scenario} />
            <Runbook />
          </div>
        </div>
      )}

      {!result && !timeUp && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <Countdown secondsLeft={secondsLeft} compact />
        </div>
      )}
    </div>
  );
}
