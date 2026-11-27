// The drill editor's form model: plain strings the author types, converted to a Scenario.
import type { Scenario, Severity } from "@/lib/drill/scenario";
import { formatPairs, parsePairs, slug } from "@/lib/drill/scenario-validate";

export interface EditorModel {
  title: string;
  severity: Severity;
  summary: string;
  signals: string;
  ask: string;
  flagName: string;
  flagDescription: string;
  baselineEnabled: boolean;
  safeState: boolean;
  segments: { key: string; rules: string }[];
  overrides: { segment: string; enabled: boolean }[];
  customers: { name: string; traits: string; affected: boolean }[];
}

/** A small, valid example so authors start from something that works. */
export const STARTER: EditorModel = {
  title: "Search returns nothing for Japanese queries",
  severity: "SEV-2",
  summary:
    "Since new_search_tokenizer rolled out, searches written in Japanese return zero results. English and German search are faster than before.",
  signals: "Zero-result rate for locale=ja jumped from 3% to 88%\nEnglish and German search latency is down 30%\nSupport has 40 tickets from Japanese customers",
  ask: "Fix search for Japanese customers without slowing it down for everyone else.",
  flagName: "new_search_tokenizer",
  flagDescription: "Unicode-aware search tokenizer",
  baselineEnabled: true,
  safeState: false,
  segments: [
    { key: "locale_ja", rules: "locale=ja" },
    { key: "locale_en", rules: "locale=en" },
    { key: "asia_pacific", rules: "region=apac" },
  ],
  overrides: [],
  customers: [
    { name: "Aiko", traits: "locale=ja region=apac", affected: true },
    { name: "Kenji", traits: "locale=ja region=apac", affected: true },
    { name: "Wei", traits: "locale=en region=apac", affected: false },
    { name: "Emma", traits: "locale=en region=eu", affected: false },
    { name: "Lukas", traits: "locale=de region=eu", affected: false },
  ],
};

export function fromScenario(s: Scenario): EditorModel {
  return {
    title: s.incident.title,
    severity: s.incident.severity,
    summary: s.incident.summary,
    signals: s.incident.signals.join("\n"),
    ask: s.incident.ask,
    flagName: s.flag.name,
    flagDescription: s.flag.description,
    baselineEnabled: s.baseline.enabled,
    safeState: s.safeState,
    segments: s.segments.map((g) => ({ key: g.key, rules: formatPairs(g.conditions) })),
    overrides: s.baseline.overrides.map((o) => ({ ...o })),
    customers: s.customers.map((c) => ({
      name: c.name,
      traits: formatPairs(
        Object.entries(c.traits).map(([property, value]) => ({ property, value })),
        " ",
      ),
      affected: c.affected,
    })),
  };
}

/** Converts the form to a Scenario. Parse problems come back separately, in the author's words. */
export function toScenario(m: EditorModel, id: string): { scenario: Scenario; parseErrors: string[] } {
  const parseErrors: string[] = [];
  const segments = m.segments.map((g) => {
    const { pairs, error } = parsePairs(g.rules);
    if (error) parseErrors.push(`Segment "${g.key || "(unnamed)"}": ${error}.`);
    return { key: g.key.trim(), description: `Drill segment: ${g.rules.trim()}`, conditions: pairs };
  });
  const seen = new Map<string, number>();
  const customers = m.customers.map((c) => {
    const { pairs, error } = parsePairs(c.traits);
    if (error) parseErrors.push(`${c.name || "A customer"}: ${error}.`);
    const base = `cust-${slug(c.name)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const traits = Object.fromEntries(pairs.map((p) => [p.property, p.value]));
    return {
      id: n === 1 ? base : `${base}-${n}`,
      name: c.name.trim(),
      detail: Object.entries(traits)
        .map(([k, v]) => `${k}=${v}`)
        .join(" · "),
      traits,
      affected: c.affected,
    };
  });
  return {
    parseErrors,
    scenario: {
      id,
      incident: {
        id: "",
        severity: m.severity,
        title: m.title.trim(),
        detectedAt: "",
        summary: m.summary.trim(),
        signals: m.signals
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        ask: m.ask.trim(),
      },
      flag: { name: m.flagName.trim(), description: m.flagDescription.trim() },
      baseline: { enabled: m.baselineEnabled, overrides: m.overrides.filter((o) => o.segment) },
      safeState: m.safeState,
      segments,
      customers,
    },
  };
}
