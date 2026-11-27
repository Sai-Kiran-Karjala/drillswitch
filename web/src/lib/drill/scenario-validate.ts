// Rules for drills a workspace writes. Pure: the editor runs them live, the server runs them again on save.
import { beforeOutcome, solutions, type Condition, type Scenario, type Severity } from "./scenario";

export const LIMITS = {
  segments: 6,
  customers: 8,
  minCustomers: 3,
  signals: 5,
  overrides: 3,
  conditions: 3,
};

const KEY = /^[a-z][a-z0-9_]{1,29}$/;
const FLAG = /^[a-z][a-z0-9_]{2,39}$/;
const TRAIT_VALUE = /^[A-Za-z0-9_.-]{1,40}$/;
const SEVERITIES: Severity[] = ["SEV-1", "SEV-2", "SEV-3"];

/** Parses "region=eu and plan=enterprise" (or comma/space separated) into conditions. */
export function parsePairs(text: string): { pairs: Condition[]; error?: string } {
  const parts = text
    .split(/\s+and\s+|,|\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const pairs: Condition[] = [];
  for (const part of parts) {
    const [property, value, ...rest] = part.split("=");
    if (rest.length || !property || value === undefined) return { pairs, error: `"${part}" should look like key=value` };
    if (!KEY.test(property)) return { pairs, error: `"${property}" isn't a valid trait name (lowercase letters, digits, _)` };
    if (!TRAIT_VALUE.test(value)) return { pairs, error: `"${value}" isn't a valid trait value` };
    pairs.push({ property, value });
  }
  return { pairs };
}

export const formatPairs = (pairs: Condition[], joiner = " and ") => pairs.map((p) => `${p.property}=${p.value}`).join(joiner);

export function slug(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "customer"
  );
}

const len = (value: string, min: number, max: number) => value.trim().length >= min && value.trim().length <= max;

/** Everything wrong with a drill, in the order the editor shows its sections. Empty means it can be saved. */
export function validateScenario(s: Scenario): string[] {
  const errors: string[] = [];
  const { incident, flag } = s;

  if (!len(incident.title, 5, 100)) errors.push("Title: 5 to 100 characters.");
  if (!SEVERITIES.includes(incident.severity)) errors.push("Pick a severity.");
  if (!len(incident.summary, 20, 500)) errors.push("Summary: 20 to 500 characters, describing what's broken and for whom.");
  if (incident.signals.length < 1 || incident.signals.length > LIMITS.signals) {
    errors.push(`Signals: 1 to ${LIMITS.signals} lines.`);
  } else if (incident.signals.some((l) => !len(l, 3, 160))) errors.push("Each signal: 3 to 160 characters.");
  if (!len(incident.ask, 5, 200)) errors.push("The ask: 5 to 200 characters.");

  if (!FLAG.test(flag.name)) errors.push("Flag name: 3 to 40 lowercase letters, digits or underscores, starting with a letter.");
  if (flag.description.length > 120) errors.push("Flag description: at most 120 characters.");

  if (s.segments.length < 1 || s.segments.length > LIMITS.segments) errors.push(`Segments: 1 to ${LIMITS.segments}.`);
  const keys = new Set<string>();
  for (const g of s.segments) {
    if (!KEY.test(g.key)) errors.push(`Segment "${g.key || "(unnamed)"}": use 2 to 30 lowercase letters, digits or underscores.`);
    if (keys.has(g.key)) errors.push(`Two segments are called "${g.key}".`);
    keys.add(g.key);
    if (g.conditions.length < 1 || g.conditions.length > LIMITS.conditions) {
      errors.push(`Segment "${g.key}": 1 to ${LIMITS.conditions} rules like region=eu.`);
    }
  }

  if (s.baseline.overrides.length > LIMITS.overrides) errors.push(`At most ${LIMITS.overrides} existing overrides.`);
  const overridden = new Set<string>();
  for (const o of s.baseline.overrides) {
    if (!keys.has(o.segment)) errors.push(`The existing override uses a segment that doesn't exist: "${o.segment}".`);
    if (overridden.has(o.segment)) errors.push(`"${o.segment}" has two existing overrides.`);
    overridden.add(o.segment);
  }

  if (s.customers.length < LIMITS.minCustomers || s.customers.length > LIMITS.customers) {
    errors.push(`Customers: ${LIMITS.minCustomers} to ${LIMITS.customers}.`);
  }
  const ids = new Set<string>();
  for (const c of s.customers) {
    if (!len(c.name, 1, 40)) errors.push("Each customer needs a name of up to 40 characters.");
    if (ids.has(c.id)) errors.push(`Two customers are called "${c.name}". Give them different names.`);
    ids.add(c.id);
    if (Object.keys(c.traits).length < 1) errors.push(`${c.name || "A customer"}: add at least one trait, like region=eu.`);
  }
  if (!s.customers.some((c) => c.affected)) errors.push("Mark at least one customer as affected.");
  if (!s.customers.some((c) => !c.affected)) errors.push("Leave at least one customer healthy, so a drill can cause collateral damage.");

  // Only check the incident itself once the parts are sound.
  if (errors.length === 0) {
    const before = beforeOutcome(s);
    const safe = s.safeState ? "ON" : "OFF";
    const alreadySafe = s.customers.filter((c) => c.affected && before[c.id] === s.safeState);
    if (alreadySafe.length) {
      errors.push(
        `${alreadySafe.map((c) => c.name).join(", ")} ${alreadySafe.length === 1 ? "is" : "are"} marked affected but already get${alreadySafe.length === 1 ? "s" : ""} ${flag.name} ${safe}.`,
      );
    } else if (solutions(s).length === 0) {
      errors.push(
        "No single change contains this incident without collateral damage. Add a segment that matches exactly the affected customers, or check the existing overrides.",
      );
    }
  }
  return errors;
}
