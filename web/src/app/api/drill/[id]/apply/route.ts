import { after, NextResponse } from "next/server";
import { flushExperimentEvents } from "@/lib/drill/experiment";
import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/saas/clerk-enabled";
import { applyChange, DrillError } from "@/lib/drill/sessions";
import type { Change } from "@/lib/drill/scenario";

// Shape check only; applyChange checks the target belongs to the session's drill.
const ENVIRONMENTS = new Set(["production", "staging"]);
const ACTIONS = new Set(["off", "on"]);
const TARGET = /^(all|segment:[a-z0-9_]{1,40}|identity:[a-z0-9-]{1,64})$/;

function parseChange(body: unknown): Change | null {
  if (!body || typeof body !== "object") return null;
  const { environment, target, action } = body as Record<string, unknown>;
  if (
    typeof environment !== "string" ||
    typeof target !== "string" ||
    typeof action !== "string" ||
    !ENVIRONMENTS.has(environment) ||
    !TARGET.test(target) ||
    !ACTIONS.has(action)
  ) {
    return null;
  }
  return { environment, target, action } as Change;
}

export async function POST(request: Request, ctx: RouteContext<"/api/drill/[id]/apply">) {
  after(() => flushExperimentEvents()); // exposure and outcome events must leave before a serverless function freezes
  const { id } = await ctx.params;
  const change = parseChange(await request.json().catch(() => null));
  if (!change) return NextResponse.json({ error: "Pick an environment, a target and an action." }, { status: 400 });
  try {
    const userId = clerkEnabled ? (await auth()).userId : null;
    return NextResponse.json(await applyChange(id, change, userId ?? null));
  } catch (error) {
    if (error instanceof DrillError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("applyChange failed", error);
    return NextResponse.json({ error: "Flagsmith rejected the change. Try again." }, { status: 502 });
  }
}
