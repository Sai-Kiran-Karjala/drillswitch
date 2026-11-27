import "server-only";
import { createHash } from "node:crypto";
import { getConfig } from "./config";
import { BUILT_IN_SCENARIOS, type SegmentDef } from "./scenario";

type Json = Record<string, unknown>;

/** Where admin calls go: a Flagsmith API base URL plus an organisation admin API key. */
export interface FlagsmithConnection {
  url: string;
  adminKey: string;
}

/** A Flagsmith project prepared for drills: two environments plus segments known so far (name → id). */
export interface FlagsmithTarget extends FlagsmithConnection {
  projectId: number;
  env: { production: string; staging: string };
  segments: Record<string, number>;
}

/**
 * fetch with one retry when the socket dies before any response arrives. Flagsmith's
 * server closes idle keep-alive connections, and Node may pick one of those for reuse.
 */
async function fetchOnce(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === "UND_ERR_SOCKET" || code === "ECONNRESET") return fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    throw error;
  }
}

export async function adminRequest<T = Json>(
  conn: FlagsmithConnection,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetchOnce(`${conn.url}/api/v1/${path}`, {
    method,
    headers: { Authorization: `Api-Key ${conn.adminKey}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Flagsmith ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export const listOf = <T = Json>(d: unknown): T[] =>
  (Array.isArray(d) ? d : ((d as { results?: T[] })?.results ?? [])) as T[];

/** The DrillSwitch vendor project: hosts the public demo drill and the A/B experiment. */
function vendor(): FlagsmithConnection {
  const { url, adminKey } = getConfig();
  return { url, adminKey };
}

export function demoTarget(): FlagsmithTarget {
  const { url, adminKey, projectId, env, segments } = getConfig();
  return { url, adminKey, projectId, env: { production: env.production, staging: env.staging }, segments };
}

/** Creates a throwaway copy of a drill's flag for one session, with the drill's starting default. */
export async function createDrillFeature(
  t: FlagsmithTarget,
  name: string,
  flag: { name: string; description: string },
  enabled: boolean,
): Promise<number> {
  const feature = await adminRequest<{ id: number }>(t, "POST", `projects/${t.projectId}/features/`, {
    name,
    description: `DrillSwitch sandbox copy of ${flag.name}: ${flag.description}. Deleted automatically.`,
    default_enabled: enabled,
    initial_value: null,
  });
  return feature.id;
}

export async function deleteFeature(t: FlagsmithTarget, featureId: number): Promise<void> {
  await adminRequest(t, "DELETE", `projects/${t.projectId}/features/${featureId}/`);
}

// ---------- Flagsmith flavours ----------
// Self-hosted (classic): feature states are edited in place, identities live in the core API.
// Flagsmith Cloud: environments use v2 feature versioning (every change is a published version)
// and identities are "edge" identities, served by the edge API, which catches up within seconds.

/** Flagsmith Cloud (or a team's own Cloud organisation), as opposed to a self-hosted instance. */
export function isFlagsmithCloud(url: string): boolean {
  return /(^|\.)flagsmith\.com$/.test(new URL(url).hostname);
}

/** Where SDK-style evaluation happens: Cloud's edge API applies identity overrides; self-hosted is one API. */
function sdkBase(t: FlagsmithConnection): string {
  return isFlagsmithCloud(t.url) ? "https://edge.api.flagsmith.com" : t.url;
}

const envInfoCache = ((globalThis as { __drillEnvInfo?: Map<string, { id: number; v2: boolean }> }).__drillEnvInfo ??=
  new Map());

/** An environment's numeric id and whether it uses v2 feature versioning. */
async function envInfo(t: FlagsmithTarget, envKey: string): Promise<{ id: number; v2: boolean }> {
  const cached = envInfoCache.get(`${t.url}|${envKey}`);
  if (cached) return cached;
  const env = await adminRequest<{ id: number; use_v2_feature_versioning?: boolean }>(t, "GET", `environments/${envKey}/`);
  const info = { id: Number(env.id), v2: Boolean(env.use_v2_feature_versioning) };
  envInfoCache.set(`${t.url}|${envKey}`, info);
  return info;
}

const EMPTY_VALUE = { type: "unicode", string_value: "" };

/** v2 versioning: publishes one new version of a feature in an environment with the given changes. */
async function publishVersion(
  t: FlagsmithTarget,
  envId: number,
  featureId: number,
  changes: { feature_states_to_create?: unknown[]; feature_states_to_update?: unknown[] },
): Promise<void> {
  await adminRequest(t, "POST", `environments/${envId}/features/${featureId}/versions/`, {
    ...changes,
    publish_immediately: true,
  });
}

/** Reads a feature's live environment default with an SDK-style request (works with or without versioning). */
export async function readFeatureState(
  t: FlagsmithTarget,
  envKey: string,
  featureName: string,
): Promise<{ defaultEnabled: boolean }> {
  const res = await fetchOnce(`${sdkBase(t)}/api/v1/flags/`, {
    headers: { "X-Environment-Key": envKey },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Flagsmith flags -> ${res.status}`);
  const flags = (await res.json()) as { enabled: boolean; feature: { name: string } }[];
  const flag = flags.find((f) => f.feature.name === featureName);
  if (!flag) throw new Error(`Feature ${featureName} not served yet`);
  return { defaultEnabled: flag.enabled };
}

/** Sets the environment-wide default for a feature (the "kill switch"). */
export async function setEnvironmentDefault(
  t: FlagsmithTarget,
  envKey: string,
  featureId: number,
  enabled: boolean,
): Promise<void> {
  const env = await envInfo(t, envKey);
  if (env.v2) {
    await publishVersion(t, env.id, featureId, { feature_states_to_update: [{ enabled, feature_state_value: EMPTY_VALUE }] });
    return;
  }
  const rows = listOf(await adminRequest(t, "GET", `environments/${envKey}/featurestates/?feature=${featureId}`));
  const base = rows.find((s) => !s.feature_segment && !s.identity);
  if (!base) throw new Error(`No environment default found for feature ${featureId}`);
  await adminRequest(t, "PATCH", `environments/${envKey}/featurestates/${base.id}/`, { enabled });
}

/**
 * Adds a segment override for a feature in one environment. Returns its feature state id on
 * classic environments, or 0 with versioning (versions are addressed by segment instead).
 */
export async function createSegmentOverride(
  t: FlagsmithTarget,
  envKey: string,
  featureId: number,
  segmentId: number,
  enabled: boolean,
): Promise<number> {
  const override = { enabled, feature_state_value: EMPTY_VALUE, feature_segment: { segment: segmentId } };
  const env = await envInfo(t, envKey);
  if (env.v2) {
    await publishVersion(t, env.id, featureId, { feature_states_to_create: [override] });
    return 0;
  }
  const state = await adminRequest<{ id: number }>(
    t,
    "POST",
    `environments/${envKey}/features/${featureId}/create-segment-override/`,
    override,
  );
  return Number(state.id);
}

/** Turns an existing segment override on or off. */
export async function updateSegmentOverride(
  t: FlagsmithTarget,
  envKey: string,
  featureId: number,
  segmentId: number,
  featureStateId: number,
  enabled: boolean,
): Promise<void> {
  const env = await envInfo(t, envKey);
  if (env.v2) {
    await publishVersion(t, env.id, featureId, {
      feature_states_to_update: [{ enabled, feature_state_value: EMPTY_VALUE, feature_segment: { segment: segmentId } }],
    });
    return;
  }
  // Segment overrides are edited through the general feature-states endpoint; the environment one
  // only covers defaults. It needs the environment and feature even for a partial update.
  await adminRequest(t, "PATCH", `features/featurestates/${featureStateId}/`, {
    enabled,
    environment: env.id,
    feature: featureId,
  });
}

/** Adds an identity override, creating the identity first if this environment hasn't seen it. */
export async function createIdentityOverride(
  t: FlagsmithTarget,
  envKey: string,
  identifier: string,
  featureId: number,
  enabled: boolean,
): Promise<void> {
  const edge = isFlagsmithCloud(t.url);
  const base = `environments/${envKey}/${edge ? "edge-identities" : "identities"}/`;
  const idOf = (i: Record<string, unknown>) => String(edge ? i.identity_uuid : i.id);
  const lookup = async () =>
    listOf(await adminRequest(t, "GET", `${base}?q=${encodeURIComponent(identifier)}`)).find(
      (i) => i.identifier === identifier,
    );
  let found = await lookup();
  if (!found) {
    try {
      found = await adminRequest<Record<string, unknown>>(t, "POST", base, { identifier });
    } catch (error) {
      found = await lookup(); // another drill created it a moment ago
      if (!found) throw error;
    }
  }
  await adminRequest(t, "POST", `${base}${idOf(found)}/${edge ? "edge-featurestates" : "featurestates"}/`, {
    feature: featureId,
    enabled,
    feature_state_value: null,
  });
}

const BUILT_IN_SEGMENTS = new Map(
  BUILT_IN_SCENARIOS.flatMap((s) => s.segments).map((g) => [g.key, JSON.stringify(g.conditions)]),
);

/**
 * The segment's name in Flagsmith. Built-in segments keep their key; a workspace's own segment
 * gets a suffix from its rules, so two workspaces can both have a "vip" segment that means different things.
 */
export function flagsmithSegmentName(segment: SegmentDef): string {
  const rules = JSON.stringify(segment.conditions);
  if (BUILT_IN_SEGMENTS.get(segment.key) === rules) return segment.key;
  return `${segment.key}_${createHash("sha256").update(rules).digest("hex").slice(0, 6)}`;
}

const segmentCache = ((globalThis as { __drillSegmentsV2?: Map<string, Map<string, number>> }).__drillSegmentsV2 ??= new Map());

const segmentLocks = new Map<string, Promise<unknown>>();

/**
 * Finds or creates the drill's segments in the target project; returns drill segment key → Flagsmith id.
 * Runs one at a time per project, so drills starting together don't create the same segment twice.
 */
export function ensureSegments(t: FlagsmithTarget, defs: SegmentDef[]): Promise<Record<string, number>> {
  const cacheKey = `${t.url}|${t.projectId}`;
  const run = (segmentLocks.get(cacheKey) ?? Promise.resolve()).catch(() => undefined).then(() => ensureSegmentsNow(t, defs));
  segmentLocks.set(cacheKey, run);
  return run;
}

async function ensureSegmentsNow(t: FlagsmithTarget, defs: SegmentDef[]): Promise<Record<string, number>> {
  const cacheKey = `${t.url}|${t.projectId}`;
  const known: Map<string, number> = segmentCache.get(cacheKey) ?? new Map(Object.entries(t.segments ?? {}));
  segmentCache.set(cacheKey, known);
  const names = new Map(defs.map((d) => [d.key, flagsmithSegmentName(d)]));
  if ([...names.values()].some((n) => !known.has(n))) {
    for (let page = 1; page <= 50; page++) {
      const data = await adminRequest<{ results: Json[]; next: string | null }>(
        t,
        "GET",
        `projects/${t.projectId}/segments/?page_size=100&page=${page}`,
      );
      for (const e of data.results) {
        const prev = known.get(String(e.name));
        if (prev === undefined || Number(e.id) < prev) known.set(String(e.name), Number(e.id));
      }
      if (!data.next) break;
    }
    for (const d of defs) {
      const name = names.get(d.key)!;
      if (known.has(name)) continue;
      const created = await adminRequest<{ id: number }>(t, "POST", `projects/${t.projectId}/segments/`, {
        name,
        description: d.description,
        project: t.projectId,
        rules: [
          {
            type: "ALL",
            rules: d.conditions.map((c) => ({
              type: "ANY",
              conditions: [{ property: c.property, operator: "EQUAL", value: c.value }],
            })),
          },
        ],
      });
      known.set(name, created.id);
    }
  }
  return Object.fromEntries(defs.map((d) => [d.key, known.get(names.get(d.key)!)!]));
}

/** Asks Flagsmith what one identity gets for a feature, without storing the identity. */
export async function evaluateIdentity(
  t: FlagsmithTarget,
  envKey: string,
  identifier: string,
  traits: Record<string, string>,
  featureName: string,
): Promise<boolean> {
  const res = await fetchOnce(`${sdkBase(t)}/api/v1/identities/`, {
    method: "POST",
    headers: { "X-Environment-Key": envKey, "content-type": "application/json" },
    body: JSON.stringify({
      identifier,
      transient: true,
      traits: Object.entries(traits).map(([trait_key, trait_value]) => ({ trait_key, trait_value })),
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Flagsmith identity evaluation -> ${res.status}`);
  const data = (await res.json()) as { flags: { enabled: boolean; feature: { name: string } }[] };
  const flag = data.flags.find((f) => f.feature.name === featureName);
  if (!flag) throw new Error(`Feature ${featureName} not returned for ${identifier}`);
  return flag.enabled;
}

export interface VariantStats {
  n: number;
  sum: number;
}
export interface Inference {
  lift: number;
  ci_low: number;
  ci_high: number;
  chance_to_win: number;
}
export interface ExperimentResults {
  asOf: string | null;
  metrics: { metric_id: number; variants: Record<string, VariantStats>; inference: Record<string, Inference> }[];
  exposures: Record<string, number>;
}
export interface ExperimentInfo {
  id: number;
  name: string;
  hypothesis: string;
  status: string;
  started_at: string | null;
  metrics: { id: number; name: string; event: string; direction: string }[];
}

export async function getExperiment(envKey: string, experimentId: number): Promise<ExperimentInfo> {
  const exp = await adminRequest<Json>(vendor(), "GET", `environments/${envKey}/experiments/${experimentId}/`);
  const metrics = listOf(await adminRequest(vendor(), "GET", `environments/${envKey}/experiment-metrics/`));
  return {
    id: exp.id as number,
    name: exp.name as string,
    hypothesis: (exp.hypothesis as string) ?? "",
    status: exp.status as string,
    started_at: (exp.started_at as string) ?? null,
    metrics: metrics.map((m) => ({
      id: m.id as number,
      name: m.name as string,
      event: (m.definition as { event: string }).event,
      direction: m.direction as string,
    })),
  };
}

/** Reads cached results; asks Flagsmith to recompute first (allowed once every 5 minutes). */
export async function getExperimentResults(envKey: string, experimentId: number): Promise<ExperimentResults> {
  const base = `environments/${envKey}/experiments/${experimentId}`;
  await adminRequest(vendor(), "POST", `${base}/exposures/refresh/`).catch(() => undefined);
  await adminRequest(vendor(), "POST", `${base}/results/refresh/`).catch(() => undefined);
  const results = await adminRequest<{ results: { as_of: string | null; payload: { metrics?: ExperimentResults["metrics"] } | null } }>(
    vendor(),
    "GET",
    `${base}/results/`,
  );
  const exposures = await adminRequest<{
    exposures: { payload: { timeseries?: { points: { new_identities: Record<string, number> }[] } } | null };
  }>(vendor(), "GET", `${base}/exposures/`);
  const totals: Record<string, number> = {};
  for (const p of exposures.exposures.payload?.timeseries?.points ?? []) {
    for (const [k, v] of Object.entries(p.new_identities)) totals[k] = (totals[k] ?? 0) + v;
  }
  return {
    asOf: results.results.as_of,
    metrics: results.results.payload?.metrics ?? [],
    exposures: totals,
  };
}

/** Lists sandbox drill features (drill_<8 hex>) in one project, with creation time. */
export async function listDrillFeatures(
  conn: FlagsmithConnection,
  projectId: number,
): Promise<{ id: number; name: string; createdAt: number }[]> {
  const out: { id: number; name: string; createdAt: number }[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await adminRequest<{ results: Json[]; next: string | null }>(
      conn,
      "GET",
      `projects/${projectId}/features/?search=drill_&page_size=100&page=${page}`,
    );
    for (const f of data.results) {
      const name = String(f.name);
      if (/^drill_[0-9a-f]{8}$/.test(name)) {
        out.push({ id: Number(f.id), name, createdAt: Date.parse(String(f.created_date)) });
      }
    }
    if (!data.next) break;
  }
  return out;
}

/** Projects in the vendor organisation: the demo project plus one hosted project per workspace. */
export async function listVendorProjects(): Promise<number[]> {
  const { organisationId } = getConfig();
  const projects = listOf(await adminRequest(vendor(), "GET", `projects/?organisation=${organisationId}`));
  return projects.map((p) => Number(p.id));
}

export function vendorConnection(): FlagsmithConnection {
  return vendor();
}
