#!/usr/bin/env node
// Idempotent setup for DrillSwitch on a self-hosted Flagsmith instance.
//
// Needs: FLAGSMITH_URL (default http://localhost:8000) and FLAGSMITH_API_KEY
// (an organisation admin API key). Creates or reuses the project, environments,
// warehouse connections, segments, experiment flag, metrics and experiments,
// then writes web/.env.local for the app.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL_BASE = (process.env.FLAGSMITH_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const KEY = process.env.FLAGSMITH_API_KEY;
if (!KEY) {
  console.error('FLAGSMITH_API_KEY is required (organisation admin API key).');
  process.exit(1);
}

const PROJECT_NAME = 'DrillSwitch';
const ENVIRONMENTS = ['Production', 'Staging', 'Simulation'];
const EXPERIMENT_ENVS = ['Production', 'Simulation'];
const FLAG = 'drill_console';
const CONTROL = 'runbook';
const VARIANT = 'scope_preview';
const PLAN_SEGMENT = { name: 'team_plan', property: 'workspace_plan', value: 'team', description: 'Workspaces on the Team plan' };
const SEGMENTS = [
  PLAN_SEGMENT,
  { name: 'eu_customers', property: 'region', value: 'eu', description: 'Customers billed in the EU' },
  { name: 'us_customers', property: 'region', value: 'us', description: 'Customers billed in the US' },
  { name: 'internal_staff', property: 'plan', value: 'internal', description: 'Employees dogfooding new features' },
];
const METRICS = [
  {
    name: 'Scoped recovery verified',
    event: 'scoped_recovery_verified',
    direction: 'up',
    expected: 'increase',
    description: 'Affected cohort recovered on the first attempt within 90s, healthy cohort kept the feature.',
  },
  {
    name: 'Healthy customers broken',
    event: 'healthy_customers_broken',
    direction: 'down',
    expected: 'decrease',
    description: 'The applied change switched the feature off for at least one healthy customer.',
  },
];
// SaaS plan entitlements, served by Flagsmith: identity = workspace, trait workspace_plan.
const ENTITLEMENTS = [
  { name: 'max_members', description: 'Seats per workspace (remote config).', free: { enabled: true, value: '3' }, team: { enabled: true, value: '25' } },
  { name: 'drill_history_days', description: 'Days of drill history on the readiness dashboard (remote config).', free: { enabled: true, value: '7' }, team: { enabled: true, value: '90' } },
  { name: 'byo_flagsmith', description: 'Workspace may connect its own Flagsmith organisation.', free: { enabled: false, value: '' }, team: { enabled: true, value: '' } },
  { name: 'custom_drills', description: 'Workspace may write its own drills; the value is how many (remote config).', free: { enabled: false, value: '0' }, team: { enabled: true, value: '20' } },
];
const HYPOTHESIS =
  'Showing a live blast-radius preview of who a flag change affects increases correct, ' +
  'first-attempt scoped rollbacks within 90 seconds.';

async function api(method, p, body) {
  const res = await fetch(`${URL_BASE}/api/v1/${p}`, {
    method,
    headers: { Authorization: `Api-Key ${KEY}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const list = (d) => (Array.isArray(d) ? d : d?.results ?? []);
const log = (msg) => console.log(`  ${msg}`);

async function ensureProject() {
  const orgs = list(await api('GET', 'organisations/'));
  if (!orgs.length) throw new Error('No organisation found for this API key.');
  const org = orgs[0];
  const projects = list(await api('GET', `projects/?organisation=${org.id}`));
  let project = projects.find((p) => p.name === PROJECT_NAME);
  if (!project) {
    project = await api('POST', 'projects/', { name: PROJECT_NAME, organisation: org.id });
    log(`created project ${PROJECT_NAME}`);
  }
  return project;
}

async function ensureEnvironments(projectId) {
  const existing = list(await api('GET', `environments/?project=${projectId}`));
  const out = {};
  for (const name of ENVIRONMENTS) {
    let env = existing.find((e) => e.name === name);
    if (!env) {
      env = await api('POST', 'environments/', { name, project: projectId });
      log(`created environment ${name}`);
    }
    out[name] = env;
  }
  return out;
}

async function ensureWarehouse(envKey) {
  const conns = list(await api('GET', `environments/${envKey}/warehouse-connections/`));
  const good = conns.find((c) => c.config?.source === 'flagsmith_database');
  if (good) return;
  for (const c of conns) await api('DELETE', `environments/${envKey}/warehouse-connections/${c.id}/`);
  // The dashboard's "Flagsmith database" option is a postgres connection with this config.
  await api('POST', `environments/${envKey}/warehouse-connections/`, {
    warehouse_type: 'postgres',
    config: { source: 'flagsmith_database' },
  });
  log(`connected Flagsmith-database warehouse for ${envKey}`);
}

async function ensureSegments(projectId) {
  const existing = list(await api('GET', `projects/${projectId}/segments/?page_size=100`));
  const ids = {};
  for (const s of SEGMENTS) {
    let seg = existing.find((e) => e.name === s.name);
    if (!seg) {
      seg = await api('POST', `projects/${projectId}/segments/`, {
        name: s.name,
        description: s.description,
        project: projectId,
        rules: [
          {
            type: 'ALL',
            rules: [{ type: 'ANY', conditions: [{ property: s.property, operator: 'EQUAL', value: s.value }] }],
          },
        ],
      });
      log(`created segment ${s.name}`);
    }
    ids[s.name] = seg.id;
  }
  return ids;
}

async function findFeature(projectId, name) {
  const feats = list(await api('GET', `projects/${projectId}/features/?search=${name}&page_size=100`));
  return feats.find((f) => f.name === name);
}

async function ensureExperimentFlag(projectId) {
  let feature = await findFeature(projectId, FLAG);
  if (!feature) {
    feature = await api('POST', `projects/${projectId}/features/`, {
      name: FLAG,
      description: 'Which incident console a drill player sees (experiment flag).',
      default_enabled: true,
      initial_value: CONTROL,
    });
    log(`created flag ${FLAG}`);
  }
  const options = list(await api('GET', `projects/${projectId}/features/${feature.id}/mv-options/`));
  let option = options.find((o) => o.key === VARIANT);
  if (!option) {
    option = await api('POST', `projects/${projectId}/features/${feature.id}/mv-options/`, {
      feature: feature.id,
      type: 'unicode',
      string_value: VARIANT,
      key: VARIANT,
      default_percentage_allocation: 0,
    });
    log(`added variant ${VARIANT}`);
  }
  return { featureId: feature.id, optionId: option.id };
}

async function ensureEntitlements(projectId, env, planSegmentId) {
  for (const e of ENTITLEMENTS) {
    let feature = await findFeature(projectId, e.name);
    if (!feature) {
      feature = await api('POST', `projects/${projectId}/features/`, {
        name: e.name,
        description: e.description,
        default_enabled: e.free.enabled,
        initial_value: e.free.value || null,
      });
      log(`created entitlement ${e.name}`);
    }
    const overrides = list(await api('GET', `features/feature-segments/?environment=${env.id}&feature=${feature.id}`));
    if (!overrides.some((o) => o.segment === planSegmentId)) {
      await api('POST', `environments/${env.api_key}/features/${feature.id}/create-segment-override/`, {
        enabled: e.team.enabled,
        feature_state_value: { type: 'unicode', string_value: e.team.value },
        feature_segment: { segment: planSegmentId },
      });
      log(`added team_plan override for ${e.name} in ${env.name}`);
    }
  }
}

async function ensureMetrics(envKey) {
  const existing = list(await api('GET', `environments/${envKey}/experiment-metrics/`));
  const ids = [];
  for (const m of METRICS) {
    let metric = existing.find((e) => e.definition?.event === m.event);
    if (!metric) {
      metric = await api('POST', `environments/${envKey}/experiment-metrics/`, {
        name: m.name,
        description: m.description,
        aggregation: 'occurrence',
        direction: m.direction,
        definition: { version: 1, event: m.event },
      });
      log(`created metric ${m.event} in ${envKey}`);
    }
    ids.push({ metric: metric.id, expected_direction: m.expected });
  }
  return ids;
}

async function ensureExperiment(envKey, featureId, optionId, metrics) {
  const existing = list(await api('GET', `environments/${envKey}/experiments/`));
  let exp = existing.find((e) => (e.feature?.id ?? e.feature) === featureId && ['created', 'running', 'paused'].includes(e.status));
  if (!exp) {
    exp = await api('POST', `environments/${envKey}/experiments/`, {
      feature: featureId,
      name: 'Blast-radius preview vs runbook only',
      hypothesis: HYPOTHESIS,
      metrics,
      experiment_rollout: {
        enabled: true,
        rollout_percentage: 100,
        feature_state_value: { type: 'string', value: CONTROL },
        multivariate_feature_state_values: [{ multivariate_feature_option: optionId, percentage_allocation: 50 }],
      },
    });
    log(`created experiment in ${envKey}`);
  }
  if (exp.status === 'created') {
    exp = await api('POST', `environments/${envKey}/experiments/${exp.id}/start/`);
    log(`started experiment ${exp.id} in ${envKey}`);
  }
  return exp.id;
}

async function removeSmokeTest(projectId, envs) {
  const smoke = await findFeature(projectId, 'smoke_test');
  if (!smoke) return;
  for (const env of Object.values(envs)) {
    const exps = list(await api('GET', `environments/${env.api_key}/experiments/`));
    for (const e of exps.filter((x) => (x.feature?.id ?? x.feature) === smoke.id && x.status === 'running')) {
      await api('POST', `environments/${env.api_key}/experiments/${e.id}/complete/`, {}).catch(() => {});
    }
  }
  await api('DELETE', `projects/${projectId}/features/${smoke.id}/`).catch((e) => log(`could not delete smoke_test: ${e.message}`));
  log('removed smoke_test flag');
}

console.log(`Bootstrapping DrillSwitch on ${URL_BASE}`);
const project = await ensureProject();
const envs = await ensureEnvironments(project.id);
for (const name of EXPERIMENT_ENVS) await ensureWarehouse(envs[name].api_key);
const segments = await ensureSegments(project.id);
await removeSmokeTest(project.id, envs);
await ensureEntitlements(project.id, envs.Production, segments[PLAN_SEGMENT.name]);
const { featureId, optionId } = await ensureExperimentFlag(project.id);
const experiments = {};
for (const name of EXPERIMENT_ENVS) {
  const key = envs[name].api_key;
  experiments[name] = await ensureExperiment(key, featureId, optionId, await ensureMetrics(key));
}

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
// Keep keys this script does not own (Clerk keys, anything added by hand).
const current = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {};
const owned = {
  FLAGSMITH_URL: URL_BASE,
  FLAGSMITH_ADMIN_KEY: KEY,
  FLAGSMITH_PROJECT_ID: project.id,
  FLAGSMITH_ORGANISATION_ID: project.organisation,
  FLAGSMITH_ENV_PRODUCTION: envs.Production.api_key,
  FLAGSMITH_ENV_STAGING: envs.Staging.api_key,
  FLAGSMITH_ENV_SIMULATION: envs.Simulation.api_key,
  FLAGSMITH_SEGMENT_EU: segments.eu_customers,
  FLAGSMITH_SEGMENT_US: segments.us_customers,
  FLAGSMITH_SEGMENT_STAFF: segments.internal_staff,
  FLAGSMITH_EXPERIMENT_PRODUCTION: experiments.Production,
  FLAGSMITH_EXPERIMENT_SIMULATION: experiments.Simulation,
  DRILL_SIM_SECRET: process.env.DRILL_SIM_SECRET ?? current.DRILL_SIM_SECRET ?? randomBytes(16).toString('hex'),
  DATABASE_URL: current.DATABASE_URL ?? 'postgres://drillswitch:drillswitch@127.0.0.1:5433/drillswitch',
  DRILLSWITCH_ENCRYPTION_KEY: current.DRILLSWITCH_ENCRYPTION_KEY ?? randomBytes(32).toString('base64'),
};
const merged = { ...current, ...owned };
writeFileSync(
  envFile,
  ['# Written by scripts/bootstrap.mjs — do not commit. Keys you add by hand are kept.']
    .concat(Object.entries(merged).map(([k, v]) => `${k}=${v}`), [''])
    .join('\n'),
  { mode: 0o600 },
);
console.log(`Done. Wrote ${envFile}`);
console.log(
  `Dashboard: ${URL_BASE}/project/${project.id}/environment/${envs.Production.api_key}/experiments/${experiments.Production}`,
);
