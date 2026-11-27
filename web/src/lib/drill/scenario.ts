// Incident drill scenarios: the model, a local Flagsmith-style evaluator (for the blast-radius
// preview and the simulator), grading and labels. Pure data and logic: safe to import anywhere.
// Real drills are graded on Flagsmith's own evaluation; the local evaluator only predicts it.

export type EnvironmentChoice = "production" | "staging";
export type FlagAction = "off" | "on";
export type ConsoleVariant = "runbook" | "scope_preview";
/** "all" = environment default · "segment:<key>" = segment override · "identity:<customerId>" = identity override. */
export type Target = "all" | `segment:${string}` | `identity:${string}`;

export interface Change {
  environment: EnvironmentChoice;
  target: Target;
  action: FlagAction;
}

/** A trait equals a value. A segment matches when all of its conditions match. */
export interface Condition {
  property: string;
  value: string;
}

export interface SegmentDef {
  key: string;
  description: string;
  conditions: Condition[];
}

export interface Customer {
  id: string;
  name: string;
  /** Short context shown next to the name, e.g. "EU · Berlin · Enterprise". */
  detail: string;
  traits: Record<string, string>;
  /** Hit by the incident. Everyone else is healthy and must keep their current state. */
  affected: boolean;
}

export type Severity = "SEV-1" | "SEV-2" | "SEV-3";

export interface Scenario {
  id: string;
  incident: {
    id: string;
    severity: Severity;
    title: string;
    detectedAt: string;
    summary: string;
    signals: string[];
    ask: string;
  };
  flag: { name: string; description: string };
  /** The flag in Production and Staging when the drill starts. Overrides are listed in priority order. */
  baseline: { enabled: boolean; overrides: { segment: string; enabled: boolean }[] };
  /** The flag state affected customers need for the incident to be over. */
  safeState: boolean;
  segments: SegmentDef[];
  customers: Customer[];
  /** Set for drills a workspace wrote; built-in drills have none. */
  workspaceId?: string;
}

export const DRILL_SECONDS = 90;

export const ENVIRONMENT_LABELS: Record<EnvironmentChoice, string> = {
  production: "Production",
  staging: "Staging",
};

export const RUNBOOK = [
  "Work out from the brief which customers are affected and which are healthy.",
  "Pick the environment those customers are actually using.",
  "Choose the smallest target that covers every affected customer and nobody else: an identity, a segment, or everyone.",
  "Apply one change, then verify that affected customers recovered and healthy ones did not change.",
];

// ---------- Local evaluation (mirrors Flagsmith: identity override > segment overrides by priority > default) ----------

export interface FlagState {
  enabled: boolean;
  overrides: { segment: string; enabled: boolean }[];
  identities: Record<string, boolean>;
}

export function baselineState(s: Scenario): FlagState {
  return { enabled: s.baseline.enabled, overrides: s.baseline.overrides.map((o) => ({ ...o })), identities: {} };
}

export function segmentMatches(segment: SegmentDef, customer: Customer): boolean {
  return segment.conditions.length > 0 && segment.conditions.every((c) => customer.traits[c.property] === c.value);
}

export function evaluate(s: Scenario, state: FlagState, customer: Customer): boolean {
  if (customer.id in state.identities) return state.identities[customer.id];
  for (const o of state.overrides) {
    const segment = s.segments.find((g) => g.key === o.segment);
    if (segment && segmentMatches(segment, customer)) return o.enabled;
  }
  return state.enabled;
}

/** A change only touches Production customers when it is made in Production. */
export function applyToState(state: FlagState, change: Change): FlagState {
  if (change.environment !== "production") return state;
  const next: FlagState = { ...state, overrides: state.overrides.map((o) => ({ ...o })), identities: { ...state.identities } };
  const value = change.action === "on";
  const { kind, key } = parseTarget(change.target);
  if (kind === "all") next.enabled = value;
  else if (kind === "identity") next.identities[key] = value;
  else {
    const existing = next.overrides.find((o) => o.segment === key);
    if (existing) existing.enabled = value;
    else next.overrides.push({ segment: key, enabled: value }); // new overrides go last, as in Flagsmith
  }
  return next;
}

export function outcome(s: Scenario, state: FlagState): Record<string, boolean> {
  return Object.fromEntries(s.customers.map((c) => [c.id, evaluate(s, state, c)]));
}

export const beforeOutcome = (s: Scenario) => outcome(s, baselineState(s));
export const predictOutcome = (s: Scenario, change: Change) => outcome(s, applyToState(baselineState(s), change));

// ---------- Grading ----------

export type Verdict = "scoped_recovery" | "collateral_damage" | "not_recovered" | "out_of_time";

export interface Grade {
  verdict: Verdict;
  affectedRecovered: number;
  affectedTotal: number;
  healthyBroken: number;
  healthyTotal: number;
}

/** Affected customers must reach the safe state; healthy customers must keep the state they had. */
export function grade(s: Scenario, after: Record<string, boolean>, inTime: boolean): Grade {
  const before = beforeOutcome(s);
  const affected = s.customers.filter((c) => c.affected);
  const healthy = s.customers.filter((c) => !c.affected);
  const affectedRecovered = affected.filter((c) => after[c.id] === s.safeState).length;
  const healthyBroken = healthy.filter((c) => after[c.id] !== before[c.id]).length;
  let verdict: Verdict;
  if (!inTime) verdict = "out_of_time";
  else if (healthyBroken > 0) verdict = "collateral_damage";
  else if (affectedRecovered < affected.length) verdict = "not_recovered";
  else verdict = "scoped_recovery";
  return { verdict, affectedRecovered, affectedTotal: affected.length, healthyBroken, healthyTotal: healthy.length };
}

/** How one customer comes out of a change. */
export type CustomerStatus = "recovered" | "still_failing" | "unaffected" | "changed";

export function customerStatus(s: Scenario, customer: Customer, before: boolean, after: boolean): CustomerStatus {
  if (customer.affected) return after === s.safeState ? "recovered" : "still_failing";
  return after === before ? "unaffected" : "changed";
}

// ---------- Targets, candidates and solutions ----------

export function parseTarget(target: string): { kind: "all" | "segment" | "identity"; key: string } {
  if (target === "all") return { kind: "all", key: "" };
  if (target.startsWith("identity:")) return { kind: "identity", key: target.slice("identity:".length) };
  if (target.startsWith("segment:")) return { kind: "segment", key: target.slice("segment:".length) };
  return { kind: "segment", key: target }; // drills recorded before scenarios: bare segment keys
}

export function targetsOf(s: Scenario): Target[] {
  return [
    "all",
    ...s.segments.map((g) => `segment:${g.key}` as Target),
    ...s.customers.map((c) => `identity:${c.id}` as Target),
  ];
}

export function isValidChange(s: Scenario, change: Change): boolean {
  return (
    (change.environment === "production" || change.environment === "staging") &&
    (change.action === "on" || change.action === "off") &&
    targetsOf(s).includes(change.target)
  );
}

/** Every single change a player could make. */
export function candidateChanges(s: Scenario): Change[] {
  const out: Change[] = [];
  for (const environment of ["production", "staging"] as const)
    for (const target of targetsOf(s)) for (const action of ["off", "on"] as const) out.push({ environment, target, action });
  return out;
}

const KIND_ORDER = { segment: 0, identity: 1, all: 2 } as const;

/** Single changes that fully contain the incident, narrowest kind first. Empty means the drill can't be won. */
export function solutions(s: Scenario): Change[] {
  return candidateChanges(s)
    .filter((c) => grade(s, predictOutcome(s, c), true).verdict === "scoped_recovery")
    .sort((a, b) => KIND_ORDER[parseTarget(a.target).kind] - KIND_ORDER[parseTarget(b.target).kind]);
}

export type FixKind = "segment" | "identity" | "all";

export const FIX_KIND_LABELS: Record<FixKind, string> = {
  segment: "Segment override",
  identity: "Identity override",
  all: "Environment default",
};

export function fixKind(s: Scenario): FixKind | null {
  const first = solutions(s)[0];
  return first ? parseTarget(first.target).kind : null;
}

export function targetLabel(s: Scenario | undefined, target: string): string {
  const { kind, key } = parseTarget(target);
  if (kind === "all") return "Everyone (environment default)";
  if (kind === "segment") return `Segment: ${key}`;
  const name = s?.customers.find((c) => c.id === key)?.name ?? key;
  return `Identity: ${name}`;
}

export function describeChange(change: Change, s?: Scenario, flagName = s?.flag.name ?? "flag") {
  return `${ENVIRONMENT_LABELS[change.environment]} › ${flagName} › ${targetLabel(s, change.target)} → ${change.action === "off" ? "OFF" : "ON"}`;
}

export function segmentRule(segment: SegmentDef): string {
  return segment.conditions.map((c) => `${c.property} = ${c.value}`).join(" and ");
}

/** One or two sentences on why a winning change contains the incident without collateral. */
export function explainFix(s: Scenario, change: Change): string {
  const { kind, key } = parseTarget(change.target);
  const state = change.action === "on" ? "ON" : "OFF";
  const flag = s.flag.name;
  if (kind === "identity") {
    const name = s.customers.find((c) => c.id === key)?.name ?? key;
    return `An identity override beats every segment override and the default, and it applies to ${name} alone. Nobody else's ${flag} changes.`;
  }
  if (kind === "segment") {
    const segment = s.segments.find((g) => g.key === key);
    const rule = segment ? segmentRule(segment) : key;
    return `A segment override in Production sets ${flag} to ${state} only for identities where ${rule}. The environment default is untouched, so everyone else keeps what they had.`;
  }
  const kept = s.baseline.overrides.map((o) => `${o.segment} (${o.enabled ? "ON" : "OFF"})`).join(", ");
  return kept
    ? `Changing the environment default reaches everyone without an override. The existing override for ${kept} is evaluated first, so those identities keep their state.`
    : `Changing the environment default sets ${flag} to ${state} for everyone in Production.`;
}

export { BUILT_IN_SCENARIOS, getBuiltInScenario, DEFAULT_SCENARIO_ID } from "./scenarios";
