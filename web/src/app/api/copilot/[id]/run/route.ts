import { NextResponse } from "next/server";
import { CopilotUnavailable, runCopilot } from "@/lib/copilot/agent";
import { getSession } from "@/lib/drill/sessions";

const RUNS_PER_DRILL = 3;
// The free Gemini tier has rate limits; keep a public demo from burning through them.
const WINDOW_MS = 10 * 60 * 1000;
const RUNS_PER_WINDOW = 30;
const recent = ((globalThis as { __copilotRuns?: number[] }).__copilotRuns ??= []);

/** Runs the copilot on a copilot drill. It only reads Flagsmith and returns a proposal. */
export async function POST(_: Request, ctx: RouteContext<"/api/copilot/[id]/run">) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session || session.source !== "agent") {
    return NextResponse.json({ error: "This incident has expired. Start a new one." }, { status: 404 });
  }
  if (session.result) return NextResponse.json({ error: "A change was already applied to this incident." }, { status: 409 });
  if (session.agentBusy) return NextResponse.json({ error: "The copilot is already working on this incident." }, { status: 409 });
  if ((session.agentRuns ?? 0) >= RUNS_PER_DRILL) {
    return NextResponse.json({ error: `The copilot can try ${RUNS_PER_DRILL} times per incident. Start a new one.` }, { status: 429 });
  }
  const now = Date.now();
  while (recent.length && recent[0] < now - WINDOW_MS) recent.shift();
  if (recent.length >= RUNS_PER_WINDOW) {
    return NextResponse.json({ error: "The copilot is busy. Try again in a few minutes." }, { status: 429 });
  }
  recent.push(now);

  session.agentBusy = true;
  session.agentRuns = (session.agentRuns ?? 0) + 1;
  try {
    const run = await runCopilot(session);
    session.agentRun = run;
    return NextResponse.json(run);
  } catch (error) {
    if (error instanceof CopilotUnavailable) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error("copilot run failed", error);
    return NextResponse.json({ error: "The copilot hit an error. Try again." }, { status: 502 });
  } finally {
    session.agentBusy = false;
  }
}
