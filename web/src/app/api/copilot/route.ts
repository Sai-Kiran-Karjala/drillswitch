import { NextResponse } from "next/server";
import { copilotConfigured } from "@/lib/copilot/agent";
import { demoTarget } from "@/lib/drill/flagsmith-admin";
import { resolveScenario } from "@/lib/drill/scenario-store";
import { createSession, toPublic } from "@/lib/drill/sessions";

/** Starts a copilot drill: a sandbox incident the AI copilot investigates and a person approves. */
export async function POST(request: Request) {
  if (!copilotConfigured()) {
    return NextResponse.json({ error: "The copilot isn't set up on this server." }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { scenario?: string };
  const scenario = await resolveScenario(typeof body.scenario === "string" ? body.scenario.slice(0, 64) : undefined, null);
  if (!scenario) return NextResponse.json({ error: "That drill doesn't exist." }, { status: 404 });
  try {
    const session = await createSession("agent", { scenario, target: demoTarget(), targetMode: "demo" });
    return NextResponse.json(toPublic(session), { status: 201 });
  } catch (error) {
    console.error("copilot createSession failed", error);
    return NextResponse.json({ error: "Could not reach Flagsmith to set up the incident. Try again." }, { status: 502 });
  }
}
