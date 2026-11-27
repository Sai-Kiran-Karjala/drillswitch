import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
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
const PLAYER_COOKIE = "ds_player";
const COUNTED_COOKIE = "ds_counted";
const YEAR = 60 * 60 * 24 * 365;

/**
 * Real players for the experiment: one anonymous id per browser (no personal data), so a person
 * keeps one version and is one player however often they visit. Only their first drill counts;
 * later drills are practice, because the hypothesis is about first attempts.
 */
async function experimentPlayer(): Promise<{ playerId: string; practice: boolean }> {
  const jar = await cookies();
  let id = jar.get(PLAYER_COOKIE)?.value;
  if (!id || !/^p_[0-9a-f]{16}$/.test(id)) id = `p_${randomBytes(8).toString("hex")}`;
  const practice = jar.get(COUNTED_COOKIE)?.value === "1";
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: YEAR, path: "/" };
  jar.set(PLAYER_COOKIE, id, options);
  jar.set(COUNTED_COOKIE, "1", options);
  return { playerId: `player-${id}`, practice };
}

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
      const { practice } = await experimentPlayer();
      const session = await createSession("human", {
        practice,
        scenario,
        target,
        targetMode: mode,
        owner: { workspaceId: orgId, userId, userName },
      });
      return NextResponse.json(toPublic(session), { status: 201 });
    }

    const scenario = await resolveScenario(scenarioId, null);
    if (!scenario) return NextResponse.json({ error: "That drill doesn't exist." }, { status: 404 });
    const player = wantsSim ? {} : await experimentPlayer();
    const session = await createSession(wantsSim ? "sim" : "human", {
      scenario,
      target: demoTarget(),
      targetMode: "demo",
      ...player,
    });
    return NextResponse.json(toPublic(session), { status: 201 });
  } catch (error) {
    console.error("createSession failed", error);
    return NextResponse.json({ error: "Could not reach Flagsmith to set up your drill. Try again." }, { status: 502 });
  }
}
