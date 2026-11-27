import { after, NextResponse } from "next/server";
import { flushExperimentEvents } from "@/lib/drill/experiment";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getConfig } from "@/lib/drill/config";
import { demoTarget } from "@/lib/drill/flagsmith-admin";
import { resolveScenario } from "@/lib/drill/scenario-store";
import { createSession, toPublic } from "@/lib/drill/sessions";
import { clerkEnabled } from "@/lib/saas/clerk-enabled";
import { resolveTarget } from "@/lib/saas/workspace";

/**
 * Starts a drill.
 *  - { mode: "workspace" }: signed-in member of the active workspace; runs in that workspace's Flagsmith.
 *  - { mode: "demo" } (default): anyone; runs in the public demo project.
 *  - { source: "sim" }: simulated player; needs the simulation secret.
 * Optional { scenario }: a built-in drill id, the workspace's own drill id, or "random" (default).
 */
export async function POST(request: Request) {
  after(() => flushExperimentEvents()); // exposure and outcome events must leave before a serverless function freezes
  const body = (await request.json().catch(() => ({}))) as { source?: string; mode?: string; scenario?: string };
  const scenarioId = typeof body.scenario === "string" ? body.scenario.slice(0, 64) : undefined;
  const wantsSim = body.source === "sim";
  if (wantsSim && request.headers.get("x-sim-secret") !== getConfig().simSecret) {
    return NextResponse.json({ error: "Simulated sessions need the simulation secret." }, { status: 403 });
  }

  try {
    if (!wantsSim && body.mode === "workspace") {
      if (!clerkEnabled) {
        return NextResponse.json({ error: "Team workspaces are not set up on this server." }, { status: 503 });
      }
      const { userId, orgId } = await auth();
      if (!userId) return NextResponse.json({ error: "Sign in to run a team drill." }, { status: 401 });
      if (!orgId) return NextResponse.json({ error: "Pick or create a workspace first." }, { status: 400 });
      const user = await currentUser();
      const userName =
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        user?.username ||
        user?.primaryEmailAddress?.emailAddress ||
        "Teammate";
      const scenario = await resolveScenario(scenarioId, orgId);
      if (!scenario) return NextResponse.json({ error: "That drill doesn't exist in this workspace." }, { status: 404 });
      const { target, mode } = await resolveTarget(orgId);
      const session = await createSession("human", {
        scenario,
        target,
        targetMode: mode,
        owner: { workspaceId: orgId, userId, userName },
      });
      return NextResponse.json(toPublic(session), { status: 201 });
    }

    const scenario = await resolveScenario(scenarioId, null);
    if (!scenario) return NextResponse.json({ error: "That drill doesn't exist." }, { status: 404 });
    const session = await createSession(wantsSim ? "sim" : "human", { scenario, target: demoTarget(), targetMode: "demo" });
    return NextResponse.json(toPublic(session), { status: 201 });
  } catch (error) {
    console.error("createSession failed", error);
    return NextResponse.json({ error: "Could not reach Flagsmith to set up your drill. Try again." }, { status: 502 });
  }
}
