import "server-only";
import { randomBytes } from "node:crypto";
import { appDb } from "@/lib/saas/db";
import { BUILT_IN_SCENARIOS, getBuiltInScenario, type Scenario } from "./scenario";

/** Drills a workspace wrote, newest first. */
export async function listWorkspaceScenarios(workspaceId: string): Promise<Scenario[]> {
  const db = await appDb();
  const rows = await db<{ scenario: Scenario }[]>`
    SELECT scenario FROM drill_scenarios WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC`;
  return rows.map((r) => r.scenario);
}

export async function getWorkspaceScenario(workspaceId: string, id: string): Promise<Scenario | undefined> {
  const db = await appDb();
  const [row] = await db<{ scenario: Scenario }[]>`
    SELECT scenario FROM drill_scenarios WHERE workspace_id = ${workspaceId} AND id = ${id}`;
  return row?.scenario;
}

export function newScenarioId() {
  return `team-${randomBytes(5).toString("hex")}`;
}

export async function saveWorkspaceScenario(workspaceId: string, userId: string, scenario: Scenario): Promise<void> {
  const db = await appDb();
  const value = { ...scenario, workspaceId };
  await db`
    INSERT INTO drill_scenarios (id, workspace_id, created_by, scenario)
    VALUES (${scenario.id}, ${workspaceId}, ${userId}, ${db.json(value as never)})
    ON CONFLICT (id) DO UPDATE SET scenario = EXCLUDED.scenario, updated_at = now()
    WHERE drill_scenarios.workspace_id = ${workspaceId}`;
}

export async function deleteWorkspaceScenario(workspaceId: string, id: string): Promise<void> {
  const db = await appDb();
  await db`DELETE FROM drill_scenarios WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}

export function randomBuiltIn(): Scenario {
  return BUILT_IN_SCENARIOS[Math.floor(Math.random() * BUILT_IN_SCENARIOS.length)];
}

/**
 * The drill to run: a built-in by id, the workspace's own drill by id, or a random built-in
 * for "random" or no id. Returns undefined for an id nobody owns.
 */
export async function resolveScenario(id: string | undefined, workspaceId: string | null): Promise<Scenario | undefined> {
  if (!id || id === "random") return randomBuiltIn();
  const builtIn = getBuiltInScenario(id);
  if (builtIn) return builtIn;
  if (!workspaceId) return undefined;
  return getWorkspaceScenario(workspaceId, id);
}
