import Link from "next/link";
import { ArrowRight, FlaskConical, Gauge, Server, ShieldAlert, Target, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartDrillButton } from "@/components/start-drill-button";
import { BUILT_IN_SCENARIOS } from "@/lib/drill/scenario";

const FEATURED = BUILT_IN_SCENARIOS[0];
const INCIDENT = FEATURED.incident;

const TEAM_FEATURES = [
  {
    icon: Gauge,
    title: "Readiness at a glance",
    body: "See who on the rotation has landed a scoped fix, who caused collateral damage, and who has never drilled.",
  },
  {
    icon: Users,
    title: "Your whole rotation",
    body: "Invite on-call engineers to a workspace. Every drill they run counts toward the team's readiness.",
  },
  {
    icon: Server,
    title: "Practise on your own Flagsmith",
    body: "Start in a hosted sandbox. On the Team plan, connect your Flagsmith so drills run where real incidents do.",
  },
];

const STEPS = [
  {
    icon: ShieldAlert,
    title: "Read the page",
    body: "An incident brief tells you which customers are hurting and which ones are fine.",
  },
  {
    icon: Target,
    title: "Make one change",
    body: "Pick the environment, the target and the action. It is written to a real Flagsmith instance.",
  },
  {
    icon: Timer,
    title: "Beat the clock",
    body: "Within 90 seconds, Flagsmith re-evaluates every customer. Healthy ones must keep the feature.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-12 sm:px-6 sm:py-20">
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="font-mono text-xs uppercase tracking-widest text-incident">Incident drills for on-call teams</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Can you roll back a broken feature without breaking healthy customers?
          </h1>
          <p className="max-w-prose text-pretty text-lg text-muted-foreground">
            Kill switches are fast. They are also blunt. DrillSwitch gives every on-call engineer a 90-second practice
            incident on real Flagsmith, and shows the team who is ready before the real page fires.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <StartDrillButton label="Try a drill, no sign-up" />
            <Button asChild size="lg" variant="outline" className="h-11 gap-2 px-5 text-base">
              <Link href="/sign-up">
                Start free for your team <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <figure
          aria-label="Example incident page"
          className="rounded-lg border border-incident/30 bg-card p-5 font-mono text-sm shadow-sm"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="rounded bg-incident/15 px-2 py-0.5 font-semibold text-incident">
              {INCIDENT.severity} · TRIGGERED
            </span>
            <span className="text-muted-foreground">{INCIDENT.detectedAt}</span>
          </div>
          <p className="mt-4 font-sans text-base font-medium">
            {INCIDENT.id}: {INCIDENT.title}
          </p>
          <ul className="mt-3 space-y-1.5 text-muted-foreground">
            {INCIDENT.signals.map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden className="text-incident">
                  ›
                </span>
                {s}
              </li>
            ))}
          </ul>
          <figcaption className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Flag: <span className="text-foreground">{FEATURED.flag.name}</span> · on for everyone
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-6">
        <h2 id="how" className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          How it works
        </h2>
        <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2 bg-card p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <step.icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">{i + 1}.</span> {step.title}
              </div>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="teams" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="teams" className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            For teams
          </h2>
          <p className="max-w-prose text-pretty text-muted-foreground">
            A runbook that nobody has practised is a guess. Make scoped rollbacks a habit for everyone who carries the
            pager.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {TEAM_FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col gap-2 rounded-lg border border-border p-5">
              <f.icon className="size-5 text-muted-foreground" aria-hidden />
              <h3 className="font-medium">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>
        <Link
          href="/pricing"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Compare plans <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </section>

      <section
        aria-labelledby="experiment"
        className="flex flex-col gap-3 rounded-lg border border-border p-5 sm:flex-row sm:items-start sm:gap-4"
      >
        <FlaskConical className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <h2 id="experiment" className="font-medium">
            You are part of an A/B test
          </h2>
          <p className="text-sm text-muted-foreground">
            Half of players get the runbook only. The other half also get a live blast-radius preview of who their
            change will affect. Flagsmith Experimentation assigns your version and measures which one leads to more
            correct, first-try rollbacks.{" "}
            <Link href="/results" className="underline underline-offset-4 hover:text-foreground">
              See live results
            </Link>
            . Demo drills use a random ID per drill; team drills use your account ID. Nothing else is sent to Flagsmith.
          </p>
        </div>
      </section>
    </div>
  );
}
