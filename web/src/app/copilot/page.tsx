import type { Metadata } from "next";
import { Bot, Eye, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { StartCopilotButton } from "@/components/copilot/start-copilot-button";
import { BUILT_IN_SCENARIOS } from "@/lib/drill/scenario";

export const metadata: Metadata = { title: "Incident copilot — DrillSwitch" };

const STEPS = [
  {
    icon: Eye,
    title: "Reads Flagsmith",
    body: "Live flag state, real identity evaluation and segment rules, through the Flagsmith API. Read-only.",
  },
  {
    icon: Bot,
    title: "Tests and proposes",
    body: "Previews candidate changes against every identity, then proposes the narrowest one with its reasoning.",
  },
  {
    icon: ShieldCheck,
    title: "You approve",
    body: "Nothing is written to Flagsmith until a person approves the exact change, after seeing who it affects.",
  },
];

export default function CopilotPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">AI incident copilot</p>
        <h1 className="text-3xl font-semibold tracking-tight">Let the copilot investigate. You make the call.</h1>
        <p className="text-pretty text-muted-foreground">
          Page the copilot on a drill incident. It works out who is affected, finds the smallest Flagsmith change that
          contains it, and hands you a proposal with its blast radius. It runs on Google Gemini&apos;s free tier, and
          every incident uses a throwaway sandbox flag.
        </p>
      </div>

      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 rounded-lg border border-border p-5">
            <s.icon className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="font-medium">
              {i + 1}. {s.title}
            </h2>
            <p className="text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Pick an incident</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT_IN_SCENARIOS.map((s) => (
            <Card key={s.id} className="flex flex-col">
              <CardHeader>
                <CardDescription className="font-mono text-xs">
                  {s.incident.severity} · {s.flag.name}
                </CardDescription>
                <CardTitle className="text-pretty text-base leading-snug">{s.incident.title}</CardTitle>
              </CardHeader>
              <CardContent className="mt-auto line-clamp-3 text-sm text-muted-foreground">{s.incident.summary}</CardContent>
              <CardFooter>
                <StartCopilotButton scenario={s.id} />
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
