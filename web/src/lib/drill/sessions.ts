import "server-only";
import { randomBytes } from "node:crypto";
import type { AgentRun } from "@/lib/copilot/agent";
import { recordDrillRun } from "@/lib/saas/db";
import { claim, loadSession, patchSession, putSession, release, removeSession, takeExpired } from "./session-store";
import { assignVariant, trackOutcome, type TrafficSource } from "./experiment";
import {
  createDrillFeature,
  createIdentityOverride,
  createSegmentOverride,
  deleteFeature,
  ensureSegments,
  evaluateIdentity,
  listDrillFeatures,
  listVendorProjects,
  setEnvironmentDefault,
  setFeatureState,
  vendorConnection,
  type FlagsmithTarget,
} from "./flagsmith-admin";
import {
  beforeOutcome,
  describeChange,
  DRILL_SECONDS,
  grade,
  isValidChange,
  parseTarget,
  type Change,
  type ConsoleVariant,
  type EnvironmentChoice,
  type Grade,
  type Scenario,
} from "./scenario";

const GRACE_MS = 1500;
const SESSION_TTL_MS = 15 * 60 * 1000;

export interface CustomerOutcome {
  id: string;
  before: boolean;
  after: boolean;
}

export interface DrillResult {
  change: Change;
  grade: Grade;
  elapsedMs: number;
  customers: CustomerOutcome[];
  flagsmithCall: string;
}

/** Who a workspace drill belongs to. Demo and simulated drills have no owner. */
export interface DrillOwner {
  workspaceId: string;
  userId: string;
  userName: string;
}

export type DrillKind = "demo" | "workspace";
export type TargetMode = "demo" | "hosted" | "byo";

export interface DrillSession {
  id: string;
  scenario: Scenario;
  /** Drill segment key → Flagsmith segment id in this session's project. */
  segmentIds: Record<string, number>;
  /** Feature state ids of the overrides the drill starts with, per environment, by segment key. */
  baselineStates: Record<EnvironmentChoice, Record<string, number>>;
  kind: DrillKind;
  playerId: string;
  source: TrafficSource;
  variant: ConsoleVariant;
  target: FlagsmithTarget;
  targetMode: TargetMode;
  owner: DrillOwner | null;
  featureId: number;
  featureName: string;
  startedAt: number;
  deadline: number;
  result: DrillResult | null;
  /** Copilot drills: the agent's latest run, and how many runs this drill has used. */
  agentRun?: AgentRun | null;
  agentRuns?: number;
}

export type PublicSession = Pick<
  DrillSession,
  "id" | "scenario" | "kind" | "source" | "variant" | "targetMode" | "featureName" | "startedAt" | "deadline" | "result"
>;

const store = globalThis as unknown as { __drillLastSweep?: number };

export function toPublic(s: DrillSession): PublicSession {
  return {
    id: s.id,
    scenario: s.scenario,
    kind: s.kind,
    source: s.source,
    variant: s.variant,
    targetMode: s.targetMode,
    featureName: s.featureName,
    startedAt: s.startedAt,
    deadline: s.deadline,
    result: s.result,
  };
}

export function getSession(id: string): Promise<DrillSession | undefined> {
  return loadSession(id);
}

export { claim as claimSession, patchSession, release as releaseSession };

const SWEEP_EVERY_MS = 60 * 1000;

/**
 * Deletes sandbox flags older than the TTL. Expired sessions are cleaned in their own target;
 * then every project in DrillSwitch's Flagsmith organisation (demo and hosted workspaces) is
 * scanned, so flags whose session was lost go too. At most once a minute per server instance.
 */
async function sweep() {
  const now = Date.now();
  if (now - (store.__drillLastSweep ?? 0) < SWEEP_EVERY_MS) return;
  store.__drillLastSweep = now;
  const cutoff = now - SESSION_TTL_MS;
  for (const s of await takeExpired(cutoff).catch(() => [])) {
    if (!s.result || s.targetMode === "demo" || s.targetMode === "hosted") {
      await deleteFeature(s.target, s.featureId).catch(() => undefined);
    }
  }
  const conn = vendorConnection();
  for (const projectId of await listVendorProjects().catch(() => [])) {
    const stale = (await listDrillFeatures(conn, projectId).catch(() => [])).filter((f) => f.createdAt < cutoff);
    for (const f of stale) {
      await deleteFeature({ ...conn, projectId } as FlagsmithTarget, f.id).catch(() => undefined);
    }
  }
}

export async function createSession(
  source: TrafficSource,
  opts: { scenario: Scenario; target: FlagsmithTarget; targetMode: TargetMode; owner?: DrillOwner },
): Promise<DrillSession> {
  void sweep().catch(() => undefined);
  const { scenario, target: t } = opts;
  const id = randomBytes(8).toString("hex");
  const playerId = opts.owner ? `user-${opts.owner.userId}` : `${source === "human" ? "player" : source}-${id}`;
  const featureName = `drill_${id.slice(0, 8)}`;
  const segmentIds = await ensureSegments(t, scenario.segments);
  const featureId = await createDrillFeature(t, featureName, scenario.flag, scenario.baseline.enabled);
  const baselineStates: DrillSession["baselineStates"] = { production: {}, staging: {} };
  try {
    // Overrides the incident starts with, in priority order, in both environments.
    for (const env of ["production", "staging"] as const) {
      for (const o of scenario.baseline.overrides) {
        baselineStates[env][o.segment] = await createSegmentOverride(t, t.env[env], featureId, segmentIds[o.segment], o.enabled);
      }
    }
  } catch (error) {
    await deleteFeature(t, featureId).catch(() => undefined);
    throw error;
  }
  // The copilot always sees the blast radius and stays out of the experiment.
  const variant = source === "agent" ? "scope_preview" : await assignVariant(source, playerId);
  const startedAt = Date.now();
  const session: DrillSession = {
    id,
    scenario,
    segmentIds,
    baselineStates,
    kind: opts.owner ? "workspace" : "demo",
    playerId,
    source,
    variant,
    target: opts.target,
    targetMode: opts.targetMode,
    owner: opts.owner ?? null,
    featureId,
    featureName,
    startedAt,
    deadline: startedAt + DRILL_SECONDS * 1000,
    result: null,
  };
  try {
    await putSession(session);
  } catch (error) {
    await deleteFeature(t, featureId).catch(() => undefined);
    throw error;
  }
  return session;
}

function describeCall(change: Change, session: DrillSession): string {
  const env = change.environment === "production" ? "Production" : "Staging";
  const enabled = change.action === "on";
  const { kind, key } = parseTarget(change.target);
  const where = `${env} › ${session.featureName}`;
  if (kind === "all") return `PATCH ${where} environment default → enabled: ${enabled}`;
  if (kind === "identity") return `POST ${where} › identity override (identity: ${key}) → enabled: ${enabled}`;
  if (session.baselineStates[change.environment][key] !== undefined) {
    return `PATCH ${where} › existing segment override (segment: ${key}) → enabled: ${enabled}`;
  }
  return `POST ${where} › create-segment-override (segment: ${key}) → enabled: ${enabled}`;
}

export class DrillError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Applies the player's one change to Flagsmith, then asks Flagsmith what every customer now gets. */
export async function applyChange(id: string, change: Change, userId: string | null): Promise<DrillResult> {
  const session = await loadSession(id);
  if (!session) throw new DrillError("This drill has expired. Start a new one.", 404);
  if (session.owner && session.owner.userId !== userId) throw new DrillError("This drill belongs to someone else.", 403);
  if (session.result) return session.result;
  if (!isValidChange(session.scenario, change)) {
    throw new DrillError(`That target isn't part of this drill: ${describeChange(change, session.scenario)}`, 400);
  }
  if (!(await claim(id, "apply"))) throw new DrillError("A change is already being applied.", 409);
  // Another request may have finished applying between our read and the claim.
  const fresh = await loadSession(id).catch(() => undefined);
  if (fresh?.result) {
    await release(id, "apply").catch(() => undefined);
    return fresh.result;
  }

  try {
    const t = session.target;
    const { scenario } = session;
    const elapsedMs = Date.now() - session.startedAt;
    const envKey = t.env[change.environment];
    const enabled = change.action === "on";
    const { kind, key } = parseTarget(change.target);

    if (kind === "all") {
      await setEnvironmentDefault(t, envKey, session.featureId, enabled);
    } else if (kind === "identity") {
      await createIdentityOverride(t, envKey, key, session.featureId, enabled);
    } else {
      const existing = session.baselineStates[change.environment][key];
      if (existing !== undefined) await setFeatureState(t, envKey, existing, enabled);
      else await createSegmentOverride(t, envKey, session.featureId, session.segmentIds[key], enabled);
    }

    // Verify against real Flagsmith evaluation in Production, where the customers are.
    const after = await Promise.all(
      scenario.customers.map((c) => evaluateIdentity(t, t.env.production, c.id, c.traits, session.featureName)),
    );
    const afterMap = Object.fromEntries(scenario.customers.map((c, i) => [c.id, after[i]]));
    const before = beforeOutcome(scenario);
    // Copilot drills are graded on the outcome only: a person reviewing carefully is the point.
    const inTime = session.source === "agent" || elapsedMs <= DRILL_SECONDS * 1000 + GRACE_MS;
    const g = grade(scenario, afterMap, inTime);

    if (session.source !== "agent") {
      trackOutcome(session.source, session.playerId, {
        success: g.verdict === "scoped_recovery",
        collateral: g.healthyBroken > 0,
      });
    }

    session.result = {
      change,
      grade: g,
      elapsedMs,
      customers: scenario.customers.map((c) => ({ id: c.id, before: before[c.id], after: afterMap[c.id] })),
      flagsmithCall: describeCall(change, session),
    };
    await patchSession(id, { result: session.result });
    if (session.owner && session.source !== "agent") {
      await recordDrillRun({
        id: session.id,
        workspaceId: session.owner.workspaceId,
        scenarioId: scenario.id,
        scenarioTitle: scenario.incident.title,
        flagName: scenario.flag.name,
        userId: session.owner.userId,
        userName: session.owner.userName,
        variant: session.variant,
        verdict: g.verdict,
        elapsedMs,
        change,
        affectedRecovered: g.affectedRecovered,
        healthyBroken: g.healthyBroken,
      }).catch((error) => console.error("recordDrillRun failed", error));
    }

    // Remove the sandbox flag straight away when nobody needs to inspect it: simulated
    // drills, and drills in a team's own Flagsmith (we keep our footprint there minimal).
    if (session.source === "sim" || session.targetMode === "byo") {
      if (session.source === "sim") await removeSession(id).catch(() => undefined);
      await deleteFeature(t, session.featureId).catch(() => undefined);
    }
    return session.result;
  } finally {
    await release(id, "apply").catch(() => undefined);
  }
}
