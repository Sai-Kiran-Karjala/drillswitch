"use client";

import { Loader2, Send, ToggleLeft } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  describeChange,
  ENVIRONMENT_LABELS,
  segmentRule,
  type Change,
  type EnvironmentChoice,
  type FlagAction,
  type Scenario,
  type Target,
} from "@/lib/drill/scenario";

export type Draft = Partial<Change>;

export function isComplete(draft: Draft): draft is Change {
  return Boolean(draft.environment && draft.target && draft.action);
}

export { describeChange };

export function ChangePanel({
  scenario,
  draft,
  onChange,
  onApply,
  applying,
  disabled,
  sandboxFlag,
}: {
  scenario: Scenario;
  draft: Draft;
  onChange: (draft: Draft) => void;
  onApply: () => void;
  applying: boolean;
  disabled: boolean;
  sandboxFlag: string;
}) {
  const complete = isComplete(draft);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ToggleLeft className="size-4 text-muted-foreground" aria-hidden />
          Change <code className="font-mono text-sm">{scenario.flag.name}</code>
        </CardTitle>
        <CardDescription>You get one change. It is written to Flagsmith when you confirm.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="environment">Environment</Label>
          <Select
            value={draft.environment}
            onValueChange={(v) => onChange({ ...draft, environment: v as EnvironmentChoice })}
            disabled={disabled}
          >
            <SelectTrigger id="environment" className="w-full">
              <SelectValue placeholder="Choose environment" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ENVIRONMENT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="target">Target</Label>
          <Select
            value={draft.target}
            onValueChange={(v) => onChange({ ...draft, target: v as Target })}
            disabled={disabled}
          >
            <SelectTrigger id="target" className="w-full">
              <SelectValue placeholder="Who should this apply to?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone (environment default)</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Segment override</SelectLabel>
                {scenario.segments.map((g) => (
                  <SelectItem key={g.key} value={`segment:${g.key}`}>
                    {g.key} <span className="font-mono text-xs text-muted-foreground">({segmentRule(g)})</span>
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Identity override</SelectLabel>
                {scenario.customers.map((c) => (
                  <SelectItem key={c.id} value={`identity:${c.id}`}>
                    {c.name} <span className="font-mono text-xs text-muted-foreground">({c.id})</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend id="action-label" className="mb-2 text-sm font-medium">
            Action
          </legend>
          <RadioGroup
            aria-labelledby="action-label"
            value={draft.action ?? ""}
            onValueChange={(v) => onChange({ ...draft, action: v as FlagAction })}
            className="grid grid-cols-2 gap-2"
          >
            {(["off", "on"] as const).map((value) => (
              <Label
                key={value}
                htmlFor={`action-${value}`}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5 has-[[data-state=checked]]:border-foreground/40 has-[[data-state=checked]]:bg-accent"
              >
                <RadioGroupItem id={`action-${value}`} value={value} />
                Turn {value.toUpperCase()}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" disabled={!complete || disabled || applying} className="gap-2">
              {applying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {applying ? "Applying in Flagsmith…" : "Apply change"}
            </Button>
          </AlertDialogTrigger>
          {complete && (
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apply this change?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="flex flex-col gap-3">
                    <code className="block rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
                      {describeChange(draft, scenario)}
                    </code>
                    <span>This is your only attempt. Flagsmith then re-evaluates every customer.</span>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Review again</AlertDialogCancel>
                <AlertDialogAction onClick={onApply}>Apply</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          )}
        </AlertDialog>
        <p className="text-center font-mono text-xs text-muted-foreground">
          sandbox flag in Flagsmith: {sandboxFlag}
        </p>
      </CardFooter>
    </Card>
  );
}
