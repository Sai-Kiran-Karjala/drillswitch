"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveDrill } from "@/app/dashboard/drills/actions";
import { beforeOutcome, describeChange, solutions, type Scenario, type Severity } from "@/lib/drill/scenario";
import { LIMITS, validateScenario } from "@/lib/drill/scenario-validate";
import { fromScenario, STARTER, toScenario, type EditorModel } from "./drill-editor-model";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DrillEditor({ existing }: { existing?: Scenario }) {
  const router = useRouter();
  const [m, setM] = useState<EditorModel>(() => (existing ? fromScenario(existing) : STARTER));
  const [state, action, pending] = useActionState(saveDrill, null);
  const set = <K extends keyof EditorModel>(key: K, value: EditorModel[K]) => setM((prev) => ({ ...prev, [key]: value }));

  const { scenario, parseErrors } = useMemo(() => toScenario(m, existing?.id ?? "draft"), [m, existing?.id]);
  const errors = useMemo(() => (parseErrors.length ? parseErrors : validateScenario(scenario)), [parseErrors, scenario]);
  const wins = useMemo(() => (errors.length ? [] : solutions(scenario)), [errors, scenario]);
  const before = useMemo(() => (parseErrors.length ? null : beforeOutcome(scenario)), [parseErrors, scenario]);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      router.push("/dashboard/drills");
    } else toast.error(state.message);
  }, [state, router]);

  const segmentKeys = m.segments.map((g) => g.key.trim()).filter(Boolean);
  const updateRow = <K extends "segments" | "customers" | "overrides">(key: K, i: number, patch: Partial<EditorModel[K][number]>) =>
    setM((prev) => ({ ...prev, [key]: prev[key].map((row, j) => (j === i ? { ...row, ...patch } : row)) }));
  const removeRow = (key: "segments" | "customers" | "overrides", i: number) =>
    setM((prev) => ({ ...prev, [key]: prev[key].filter((_, j) => j !== i) }));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <input type="hidden" name="scenario" value={JSON.stringify(scenario)} />
      <input type="hidden" name="id" value={existing?.id ?? ""} />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incident</CardTitle>
            <CardDescription>What the on-call engineer is paged with. Say who is hurt and who must not be touched.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <Field id="title" label="Title">
                <Input id="title" value={m.title} onChange={(e) => set("title", e.target.value)} maxLength={100} />
              </Field>
              <Field id="severity" label="Severity">
                <Select value={m.severity} onValueChange={(v) => set("severity", v as Severity)}>
                  <SelectTrigger id="severity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["SEV-1", "SEV-2", "SEV-3"] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field id="summary" label="Summary">
              <Textarea id="summary" rows={3} value={m.summary} onChange={(e) => set("summary", e.target.value)} maxLength={500} />
            </Field>
            <Field id="signals" label="Signals" hint={`One per line, up to ${LIMITS.signals}. Dashboards, tickets, requests from other teams.`}>
              <Textarea id="signals" rows={3} value={m.signals} onChange={(e) => set("signals", e.target.value)} />
            </Field>
            <Field id="ask" label="The ask">
              <Input id="ask" value={m.ask} onChange={(e) => set("ask", e.target.value)} maxLength={200} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flag</CardTitle>
            <CardDescription>Each drill gets a throwaway copy of this flag in Flagsmith.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="flagName" label="Flag name">
                <Input id="flagName" className="font-mono" value={m.flagName} onChange={(e) => set("flagName", e.target.value)} />
              </Field>
              <Field id="flagDescription" label="What it does">
                <Input id="flagDescription" value={m.flagDescription} onChange={(e) => set("flagDescription", e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
              <div className="flex items-center gap-3">
                <Switch id="baseline" checked={m.baselineEnabled} onCheckedChange={(v) => set("baselineEnabled", v)} />
                <Label htmlFor="baseline">Environment default is ON when the drill starts</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="safe" checked={m.safeState} onCheckedChange={(v) => set("safeState", v)} />
                <Label htmlFor="safe">Affected customers need it ON to recover</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segments</CardTitle>
            <CardDescription>Targets the engineer can pick. Include tempting wrong ones: that is the drill.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {m.segments.map((g, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-end gap-2">
                <Field id={`seg-key-${i}`} label={i === 0 ? "Name" : ""}>
                  <Input
                    id={`seg-key-${i}`}
                    aria-label="Segment name"
                    className="font-mono"
                    value={g.key}
                    onChange={(e) => updateRow("segments", i, { key: e.target.value })}
                  />
                </Field>
                <Field id={`seg-rules-${i}`} label={i === 0 ? "Rules (all must match)" : ""}>
                  <Input
                    id={`seg-rules-${i}`}
                    aria-label="Segment rules"
                    className="font-mono"
                    placeholder="region=eu and plan=enterprise"
                    value={g.rules}
                    onChange={(e) => updateRow("segments", i, { rules: e.target.value })}
                  />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove segment ${g.key}`} onClick={() => removeRow("segments", i)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit gap-1.5"
              disabled={m.segments.length >= LIMITS.segments}
              onClick={() => set("segments", [...m.segments, { key: "", rules: "" }])}
            >
              <Plus className="size-4" aria-hidden /> Add segment
            </Button>

            <div className="mt-2 flex flex-col gap-3 border-t border-border pt-4">
              <p className="text-sm font-medium">Overrides that already exist (optional)</p>
              {m.overrides.map((o, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3">
                  <Select value={o.segment} onValueChange={(v) => updateRow("overrides", i, { segment: v })}>
                    <SelectTrigger aria-label="Overridden segment" className="w-48 font-mono">
                      <SelectValue placeholder="Segment" />
                    </SelectTrigger>
                    <SelectContent>
                      {segmentKeys.map((k) => (
                        <SelectItem key={k} value={k}>
                          {k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Switch id={`ov-${i}`} checked={o.enabled} onCheckedChange={(v) => updateRow("overrides", i, { enabled: v })} />
                    <Label htmlFor={`ov-${i}`}>{o.enabled ? "ON" : "OFF"}</Label>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove override" onClick={() => removeRow("overrides", i)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit gap-1.5"
                disabled={m.overrides.length >= LIMITS.overrides || segmentKeys.length === 0}
                onClick={() => set("overrides", [...m.overrides, { segment: "", enabled: true }])}
              >
                <Plus className="size-4" aria-hidden /> Add existing override
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customers</CardTitle>
            <CardDescription>
              Identities Flagsmith evaluates after the change. Affected ones must recover; the rest must not change.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {m.customers.map((c, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto] items-end gap-2">
                <Field id={`cust-name-${i}`} label={i === 0 ? "Name" : ""}>
                  <Input
                    id={`cust-name-${i}`}
                    aria-label="Customer name"
                    value={c.name}
                    onChange={(e) => updateRow("customers", i, { name: e.target.value })}
                  />
                </Field>
                <Field id={`cust-traits-${i}`} label={i === 0 ? "Traits" : ""}>
                  <Input
                    id={`cust-traits-${i}`}
                    aria-label="Customer traits"
                    className="font-mono"
                    placeholder="region=eu plan=growth"
                    value={c.traits}
                    onChange={(e) => updateRow("customers", i, { traits: e.target.value })}
                  />
                </Field>
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id={`cust-aff-${i}`}
                    checked={c.affected}
                    onCheckedChange={(v) => updateRow("customers", i, { affected: v === true })}
                  />
                  <Label htmlFor={`cust-aff-${i}`}>Affected</Label>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${c.name || "customer"}`} onClick={() => removeRow("customers", i)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit gap-1.5"
              disabled={m.customers.length >= LIMITS.customers}
              onClick={() => set("customers", [...m.customers, { name: "", traits: "", affected: false }])}
            >
              <Plus className="size-4" aria-hidden /> Add customer
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className={errors.length ? "border-warning/40" : "border-success/40"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {errors.length ? (
                <CircleAlert className="size-4 text-warning" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4 text-success" aria-hidden />
              )}
              {errors.length ? "Not ready yet" : "Ready to run"}
            </CardTitle>
            <CardDescription>Checked as you type, with the same rules DrillSwitch grades with.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm" aria-live="polite">
            {errors.length > 0 ? (
              <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted-foreground">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground">
                  {wins.length === 1 ? "One change wins this drill:" : `${wins.length} changes win this drill:`}
                </p>
                {wins.slice(0, 3).map((w) => (
                  <code key={w.target + w.action} className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
                    {describeChange(w, scenario)}
                  </code>
                ))}
              </div>
            )}
            {before && scenario.customers.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">When the drill starts</p>
                <ul className="flex flex-col gap-1 font-mono text-xs">
                  {scenario.customers.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {c.name || "(unnamed)"}
                        {c.affected ? " · affected" : ""}
                      </span>
                      <span>{before[c.id] ? "ON" : "OFF"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {state && !state.ok && state.errors && (
              <div role="alert" className="flex flex-col gap-1 text-destructive">
                <p>{state.message}</p>
                <ul className="list-disc pl-4">
                  {state.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button type="submit" disabled={pending || errors.length > 0} className="gap-2">
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {existing ? "Save changes" : "Save drill"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
