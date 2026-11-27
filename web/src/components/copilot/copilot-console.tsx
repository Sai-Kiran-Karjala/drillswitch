"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerTable } from "@/components/drill/customer-table";
import { CustomerRoster, IncidentBrief } from "@/components/drill/incident-brief";
import { ResultView } from "@/components/drill/result-view";
import type { AgentRun } from "@/lib/copilot/agent";
import { beforeOutcome, grade, predictOutcome } from "@/lib/drill/scenario";
import type { DrillResult, PublicSession } from "@/lib/drill/sessions";
import { StartCopilotButton } from "./start-copilot-button";

const TOOL_LABELS: Record<string, string> = {
  get_flag_state: "Read flag state",
  evaluate_identities: "Evaluated identities",
  list_segments: "Listed segments",
  preview_change: "Previewed",
  propose_change: "Proposed",
};

const MAX_RUNS = 3;

export function CopilotConsole({ session, initialRun }: { session: PublicSession; initialRun: AgentRun | null }) {
  const { scenario } = session;
  const [run, setRun] = useState<AgentRun | null>(initialRun);
  const [runs, setRuns] = useState(initialRun ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<DrillResult | null>(session.result);
  const proposedAt = useRef<number | null>(null);
  useEffect(() => {
    if (initialRun?.proposal) proposedAt.current = Date.now();
  }, [initialRun]);
  const [reviewMs, setReviewMs] = useState<number | null>(null);

  async function ask() {
    setBusy(true);
    setRejected(false);
    try {
      const res = await fetch(`/api/copilot/${session.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The copilot hit an error.");
      setRun(data);
      setRuns((n) => n + 1);
      proposedAt.current = data.proposal ? Date.now() : null;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The copilot hit an error.");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!run?.proposal) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/drill/${session.id}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(run.proposal.change),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Flagsmith rejected the change.");
      if (proposedAt.current) setReviewMs(Date.now() - proposedAt.current);
      setResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setApplying(false);
    }
  }

  const before = beforeOutcome(scenario);
  const predicted = run?.proposal ? predictOutcome(scenario, run.proposal.change) : null;
  const predictedGrade = predicted ? grade(scenario, predicted, true) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-incident/40 font-mono text-incident">
            {scenario.incident.severity}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {scenario.incident.id} · copilot drill · sandbox flag {session.featureName}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {result ? "Incident handled" : scenario.incident.title}
        </h1>
      </div>

      {result ? (
        <div className="flex flex-col gap-6">
          {run && (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
              <div className="flex flex-col gap-1 bg-card p-4">
                <dt className="text-xs text-muted-foreground">Copilot investigation</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums">{(run.elapsedMs / 1000).toFixed(1)}s</dd>
              </div>
              <div className="flex flex-col gap-1 bg-card p-4">
                <dt className="text-xs text-muted-foreground">Your review before approving</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums">
                  {reviewMs == null ? "—" : `${(reviewMs / 1000).toFixed(1)}s`}
                </dd>
              </div>
              <div className="col-span-2 flex flex-col gap-1 bg-card p-4 sm:col-span-1">
                <dt className="text-xs text-muted-foreground">Model</dt>
                <dd className="font-mono text-sm">{run.model}</dd>
              </div>
            </dl>
          )}
          <ResultView scenario={scenario} result={result} />
          <div>
            <StartCopilotButton label="Page the copilot on another incident" variant="outline" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className="flex flex-col gap-6">
            <IncidentBrief scenario={scenario} />
            <CustomerRoster scenario={scenario} />
          </div>

          <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="size-4 text-muted-foreground" aria-hidden />
                  Incident copilot
                </CardTitle>
                <CardDescription>
                  It reads Flagsmith, tests options and proposes one change. Nothing is written to Flagsmith until you
                  approve.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4" aria-live="polite">
                {busy ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Investigating: reading the flag, evaluating identities, testing changes…
                  </p>
                ) : run ? (
                  <>
                    <ol className="flex flex-col gap-2">
                      {run.steps.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">
                            {i + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="font-medium">{TOOL_LABELS[s.tool] ?? s.tool}</span>{" "}
                            <span className="break-words font-mono text-xs text-muted-foreground">{s.summary}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-muted-foreground">
                      {run.model} · {(run.elapsedMs / 1000).toFixed(1)}s · {run.steps.length} Flagsmith tool calls
                    </p>
                    {!run.proposal && <p className="text-sm text-warning">{run.message}</p>}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The copilot has the same brief you see. It doesn&apos;t know which customers are affected; it has to
                    work that out.
                  </p>
                )}
              </CardContent>
              {(!run || !run.proposal || rejected) && !busy && (
                <CardFooter className="flex-col items-stretch gap-2">
                  <Button onClick={ask} disabled={runs >= MAX_RUNS} className="gap-2">
                    <Sparkles className="size-4" aria-hidden />
                    {run ? "Ask again" : "Ask the copilot"}
                  </Button>
                  {runs >= MAX_RUNS && (
                    <p className="text-center text-xs text-muted-foreground">That was the last try for this incident.</p>
                  )}
                </CardFooter>
              )}
            </Card>

            {run?.proposal && !rejected && predicted && predictedGrade && (
              <Card className="border-foreground/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                    Proposed change: needs your approval
                  </CardTitle>
                  <CardDescription className="text-pretty">{run.proposal.reasoning}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs">{run.proposal.description}</code>
                  <p className="text-sm text-muted-foreground">
                    Predicted: {predictedGrade.affectedRecovered} of {predictedGrade.affectedTotal} affected recover ·{" "}
                    {predictedGrade.healthyBroken} of {predictedGrade.healthyTotal} healthy change. Check the table before
                    you approve.
                  </p>
                  <CustomerTable
                    scenario={scenario}
                    before={before}
                    after={predicted}
                    afterLabel="Predicted"
                    compact
                    caption="Predicted effect of the proposed change"
                  />
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={applying} className="gap-2">
                        {applying ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <CheckCircle2 className="size-4" aria-hidden />
                        )}
                        {applying ? "Applying in Flagsmith…" : "Approve and apply"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apply the copilot&apos;s change?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="flex flex-col gap-3">
                            <code className="block rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
                              {run.proposal.description}
                            </code>
                            <span>
                              You are approving this change to Production. It is written to Flagsmith and every identity
                              is re-evaluated.
                            </span>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Not yet</AlertDialogCancel>
                        <AlertDialogAction onClick={approve}>Approve and apply</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button variant="outline" className="gap-2" onClick={() => setRejected(true)} disabled={applying}>
                    <XCircle className="size-4" aria-hidden /> Reject
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
