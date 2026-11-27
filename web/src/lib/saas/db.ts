import "server-only";
import postgres from "postgres";
import type { Change, ConsoleVariant, Verdict } from "@/lib/drill/scenario";

/** Bump when the schema below changes, so a running dev server re-applies it. */
const SCHEMA_VERSION = 3;
const g = globalThis as unknown as { __sql?: postgres.Sql; __schema?: Promise<void>; __schemaVersion?: number };

function sql(): postgres.Sql {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL. Run scripts/bootstrap.mjs.");
  // Hosted Postgres poolers (e.g. Neon's "-pooler" endpoint) run in transaction mode,
  // which doesn't support prepared statements.
  const pooled = /-pooler\./.test(process.env.DATABASE_URL);
  g.__sql ??= postgres(process.env.DATABASE_URL, { max: 5, prepare: !pooled, onnotice: () => undefined });
  return g.__sql;
}

async function ready(): Promise<postgres.Sql> {
  const db = sql();
  if (g.__schemaVersion !== SCHEMA_VERSION) {
    g.__schema = undefined;
    g.__schemaVersion = SCHEMA_VERSION;
  }
  g.__schema ??= (async () => {
    await db`
      CREATE TABLE IF NOT EXISTS drill_runs (
        id                 text PRIMARY KEY,
        workspace_id       text NOT NULL,
        user_id            text NOT NULL,
        user_name          text NOT NULL,
        variant            text NOT NULL,
        verdict            text NOT NULL,
        elapsed_ms         integer NOT NULL,
        change             jsonb NOT NULL,
        affected_recovered integer NOT NULL,
        healthy_broken     integer NOT NULL,
        created_at         timestamptz NOT NULL DEFAULT now()
      )`;
    await db`CREATE INDEX IF NOT EXISTS drill_runs_workspace_created ON drill_runs (workspace_id, created_at DESC)`;
    // Scenario library: which drill was run, with its title and flag kept for history.
    await db`ALTER TABLE drill_runs ADD COLUMN IF NOT EXISTS scenario_id text NOT NULL DEFAULT 'eu-card-payments'`;
    await db`ALTER TABLE drill_runs ADD COLUMN IF NOT EXISTS scenario_title text NOT NULL DEFAULT 'Card payments failing for EU customers'`;
    await db`ALTER TABLE drill_runs ADD COLUMN IF NOT EXISTS flag_name text NOT NULL DEFAULT 'new_checkout'`;
    await db`
      CREATE TABLE IF NOT EXISTS drill_scenarios (
        id            text PRIMARY KEY,
        workspace_id  text NOT NULL,
        created_by    text NOT NULL,
        scenario      jsonb NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )`;
    await db`CREATE INDEX IF NOT EXISTS drill_scenarios_workspace ON drill_scenarios (workspace_id, created_at DESC)`;
    // Live drill sessions. Kept in the database so any server instance can serve any drill.
    await db`
      CREATE TABLE IF NOT EXISTS drill_sessions (
        id             text PRIMARY KEY,
        data           jsonb NOT NULL,
        admin_key      text NOT NULL,
        started_at     timestamptz NOT NULL,
        applying_since timestamptz,
        agent_since    timestamptz
      )`;
    await db`CREATE INDEX IF NOT EXISTS drill_sessions_started ON drill_sessions (started_at)`;
  })().catch((error) => {
    g.__schema = undefined;
    throw error;
  });
  await g.__schema;
  return db;
}

export interface DrillRunInput {
  id: string;
  workspaceId: string;
  scenarioId: string;
  scenarioTitle: string;
  flagName: string;
  userId: string;
  userName: string;
  variant: ConsoleVariant;
  verdict: Verdict;
  elapsedMs: number;
  change: Change;
  affectedRecovered: number;
  healthyBroken: number;
}

export { ready as appDb };

export async function recordDrillRun(run: DrillRunInput): Promise<void> {
  const db = await ready();
  await db`
    INSERT INTO drill_runs (id, workspace_id, scenario_id, scenario_title, flag_name, user_id, user_name, variant, verdict,
                            elapsed_ms, change, affected_recovered, healthy_broken)
    VALUES (${run.id}, ${run.workspaceId}, ${run.scenarioId}, ${run.scenarioTitle}, ${run.flagName}, ${run.userId}, ${run.userName},
            ${run.variant}, ${run.verdict}, ${run.elapsedMs}, ${db.json(run.change as unknown as postgres.JSONValue)},
            ${run.affectedRecovered}, ${run.healthyBroken})
    ON CONFLICT (id) DO NOTHING`;
}

export interface ReadinessSummary {
  drills: number;
  scoped: number;
  collateral: number;
  people: number;
  medianScopedSeconds: number | null;
}

export interface MemberReadiness {
  userId: string;
  userName: string;
  drills: number;
  scoped: number;
  collateral: number;
  lastAt: Date;
  bestSeconds: number | null;
}

export interface ScenarioCoverage {
  scenarioId: string;
  scenarioTitle: string;
  drills: number;
  scoped: number;
  people: number;
}

export interface RecentRun {
  id: string;
  scenarioTitle: string;
  flagName: string;
  userName: string;
  verdict: Verdict;
  elapsedMs: number;
  change: Change;
  createdAt: Date;
}

export async function workspaceReadiness(workspaceId: string, days: number) {
  const db = await ready();
  const since = new Date(Date.now() - days * 86_400_000);
  const [summary] = await db<ReadinessSummary[]>`
    SELECT count(*)::int                                              AS drills,
           count(*) FILTER (WHERE verdict = 'scoped_recovery')::int   AS scoped,
           count(*) FILTER (WHERE healthy_broken > 0)::int            AS collateral,
           count(DISTINCT user_id)::int                               AS people,
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY elapsed_ms)
              FILTER (WHERE verdict = 'scoped_recovery') / 1000)::float AS "medianScopedSeconds"
    FROM drill_runs WHERE workspace_id = ${workspaceId} AND created_at >= ${since}`;
  const members = await db<MemberReadiness[]>`
    SELECT user_id AS "userId",
           (array_agg(user_name ORDER BY created_at DESC))[1]       AS "userName",
           count(*)::int                                             AS drills,
           count(*) FILTER (WHERE verdict = 'scoped_recovery')::int  AS scoped,
           count(*) FILTER (WHERE healthy_broken > 0)::int           AS collateral,
           max(created_at)                                           AS "lastAt",
           (min(elapsed_ms) FILTER (WHERE verdict = 'scoped_recovery') / 1000.0)::float AS "bestSeconds"
    FROM drill_runs WHERE workspace_id = ${workspaceId} AND created_at >= ${since}
    GROUP BY user_id ORDER BY scoped DESC, drills DESC`;
  const recent = await db<RecentRun[]>`
    SELECT id, scenario_title AS "scenarioTitle", flag_name AS "flagName", user_name AS "userName", verdict, elapsed_ms AS "elapsedMs", change, created_at AS "createdAt"
    FROM drill_runs WHERE workspace_id = ${workspaceId} AND created_at >= ${since}
    ORDER BY created_at DESC LIMIT 10`;
  const coverage = await db<ScenarioCoverage[]>`
    SELECT scenario_id AS "scenarioId",
           (array_agg(scenario_title ORDER BY created_at DESC))[1]                  AS "scenarioTitle",
           count(*)::int                                                            AS drills,
           count(*) FILTER (WHERE verdict = 'scoped_recovery')::int                 AS scoped,
           count(DISTINCT user_id) FILTER (WHERE verdict = 'scoped_recovery')::int  AS people
    FROM drill_runs WHERE workspace_id = ${workspaceId} AND created_at >= ${since}
    GROUP BY scenario_id`;
  return { summary, members, recent, coverage };
}
