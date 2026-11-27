import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getEntitlements, PLANS, type Entitlements, type Plan } from "@/lib/saas/entitlements";

export const metadata: Metadata = { title: "Pricing — DrillSwitch" };

const COMMON = ["Unlimited drills", "Blast-radius preview", "Team readiness dashboard"];

function lines(e: Entitlements) {
  return [
    `Up to ${e.maxMembers} people`,
    `${e.historyDays}-day drill history`,
    e.byoFlagsmith ? "Run drills in your own Flagsmith" : "Hosted Flagsmith sandbox",
    ...COMMON,
  ];
}

async function Plans() {
  await connection();
  // The same flags the product enforces, evaluated for a sample workspace on each plan.
  const [free, team] = await Promise.all([getEntitlements("pricing-free", "free"), getEntitlements("pricing-team", "team")]);
  const plans: { key: Plan; ent: Entitlements; cta: string }[] = [
    { key: "free", ent: free, cta: "Start free" },
    { key: "team", ent: team, cta: "Start free, upgrade later" },
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {plans.map(({ key, ent, cta }) => (
        <Card key={key} className={key === "team" ? "border-foreground/40" : undefined}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {PLANS[key].name}
              {key === "team" && <Badge variant="secondary">Most teams</Badge>}
            </CardTitle>
            <CardDescription>{PLANS[key].blurb}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="font-mono text-2xl font-semibold">{PLANS[key].price}</p>
            <ul className="flex flex-col gap-2 text-sm">
              {lines(ent).map((l) => (
                <li key={l} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-success" aria-hidden /> {l}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full" variant={key === "team" ? "default" : "outline"}>
              <Link href="/sign-up">{cta}</Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Drill the whole rotation</h1>
        <p className="mx-auto max-w-prose text-pretty text-muted-foreground">
          Plan limits on this page are read live from Flagsmith: the same flags the product enforces. Payments are not
          enabled during the hackathon, so upgrading is free.
        </p>
      </div>
      <Suspense
        fallback={
          <div aria-busy="true" aria-label="Loading plans" className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        }
      >
        <Plans />
      </Suspense>
    </div>
  );
}
