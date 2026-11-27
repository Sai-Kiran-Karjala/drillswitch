// Traffic simulator: plays DrillSwitch drills through the real app API, so every simulated
// player goes through the same path as a human: Flagsmith experiment assignment, a real
// write to Flagsmith, real identity evaluation, and experiment events (Simulation environment).
//
//   npm run simulate -- --players 60 --concurrency 4 --seed 7 [--scenario eu-card-payments]
//
// Simulated players follow the behaviour model below. They prove the pipeline works end to
// end; they are not evidence about how people behave. The "Real players" tab is.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BUILT_IN_SCENARIOS,
  candidateChanges,
  grade,
  predictOutcome,
  type Change,
  type ConsoleVariant,
  type Scenario,
  type Verdict,
} from "../src/lib/drill/scenario";

// ---------- Behaviour model (identical for both variants, except what B can see) ----------

/**
 * What a player reaches for first, before checking anything, by kind of change. Each kind's
 * weight is shared by the drill's changes of that kind; kinds a drill doesn't have drop out.
 */
const INSTINCT_WEIGHTS = {
  correct: 40, // the scoped fix
  global: 35, // the environment-wide kill switch, when it isn't the fix
  staging: 10, // the right idea in the wrong environment
  wrong_target: 10, // a segment or identity that doesn't fit
  wrong_action: 5, // flips the flag the wrong way
};

function instincts(s: Scenario): { change: Change; weight: number }[] {
  const safe = s.safeState ? "on" : "off";
  const kinds = new Map<keyof typeof INSTINCT_WEIGHTS, Change[]>();
  for (const c of candidateChanges(s)) {
    const kind =
      c.environment === "production" && grade(s, predictOutcome(s, c), true).verdict === "scoped_recovery"
        ? "correct"
        : c.action !== safe
          ? c.environment === "production"
            ? "wrong_action"
            : null
          : c.environment === "staging"
            ? "staging"
            : c.target === "all"
              ? "global"
              : "wrong_target";
    if (kind) kinds.set(kind, [...(kinds.get(kind) ?? []), c]);
  }
  return [...kinds].flatMap(([kind, changes]) =>
    changes.map((change) => ({ change, weight: INSTINCT_WEIGHTS[kind] / changes.length })),
  );
}
/** Share of players who freeze and never apply anything within 90 seconds. */
const P_TIMEOUT = 0.07;
/** Variant A: chance that re-reading the runbook makes a player doubt a bad draft. */
const P_RUNBOOK_SELF_CHECK = 0.15;
/** Variant B: chance that a player notices a bad draft in the blast-radius preview. */
const P_NOTICE_PREVIEW = 0.7;
/** How many times a doubting player redrafts before applying whatever they have. */
const MAX_REDRAFTS = 2;

// ---------- Arguments and config ----------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readSimSecret(): string {
  if (process.env.DRILL_SIM_SECRET) return process.env.DRILL_SIM_SECRET;
  try {
    const line = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("DRILL_SIM_SECRET="));
    if (line) return line.slice("DRILL_SIM_SECRET=".length).trim();
  } catch {}
  throw new Error("DRILL_SIM_SECRET not found. Run `npm run bootstrap` first, or set it in the environment.");
}

const APP = arg("app", process.env.DRILLSWITCH_URL ?? "http://localhost:3100").replace(/\/$/, "");
const PLAYERS = Number(arg("players", "40"));
const CONCURRENCY = Number(arg("concurrency", "4"));
const SEED = Number(arg("seed", String(Date.now() % 1_000_000)));
const SCENARIO = arg("scenario", "random");
const SECRET = readSimSecret();

// Seeded RNG (mulberry32) so a run can be reproduced.
let state = SEED >>> 0;
function random() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pick(options: { change: Change; weight: number }[]): Change {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = random() * total;
  for (const o of options) if ((r -= o.weight) < 0) return o.change;
  return options[options.length - 1].change;
}

const same = (a: Change, b: Change) =>
  a.environment === b.environment && a.target === b.target && a.action === b.action;

/** Decides what a simulated player applies, or null if they run out of time. */
function decide(s: Scenario, variant: ConsoleVariant): { change: Change | null; redrafts: number } {
  if (random() < P_TIMEOUT) return { change: null, redrafts: 0 };
  const options = instincts(s);
  const rejected: Change[] = [];
  let draft = pick(options);
  let redrafts = 0;
  while (redrafts < MAX_REDRAFTS) {
    const looksWrong =
      variant === "scope_preview"
        ? // B sees exactly what the UI shows: the predicted state of every customer.
          grade(s, predictOutcome(s, draft), true).verdict !== "scoped_recovery" && random() < P_NOTICE_PREVIEW
        : // A only has the runbook; a self-check catches a bad draft occasionally.
          grade(s, predictOutcome(s, draft), true).verdict !== "scoped_recovery" && random() < P_RUNBOOK_SELF_CHECK;
    if (!looksWrong) break;
    rejected.push(draft);
    draft = pick(options.filter((o) => !rejected.some((r) => same(r, o.change))));
    redrafts++;
  }
  return { change: draft, redrafts };
}

// ---------- Talking to the app ----------

async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${APP}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${data.error ?? ""}`.trim());
  return data as T;
}

type Outcome = Verdict | "timed_out" | "error";
const tally: Record<ConsoleVariant, Record<Outcome, number> & { players: number }> = {
  runbook: { players: 0, scoped_recovery: 0, collateral_damage: 0, not_recovered: 0, out_of_time: 0, timed_out: 0, error: 0 },
  scope_preview: { players: 0, scoped_recovery: 0, collateral_damage: 0, not_recovered: 0, out_of_time: 0, timed_out: 0, error: 0 },
};

let done = 0;
async function playOne(n: number) {
  const session = await post<{ id: string; variant: ConsoleVariant; scenario: Scenario }>(
    "/api/drill",
    {
      source: "sim",
      // Drawn from the seeded RNG so a seed replays the same drills.
      scenario: SCENARIO === "random" ? BUILT_IN_SCENARIOS[Math.floor(random() * BUILT_IN_SCENARIOS.length)].id : SCENARIO,
    },
    { "x-sim-secret": SECRET },
  );
  const t = tally[session.variant];
  t.players++;
  const { change, redrafts } = decide(session.scenario, session.variant);
  let outcome: Outcome = "timed_out";
  try {
    if (change) {
      const result = await post<{ grade: { verdict: Verdict } }>(`/api/drill/${session.id}/apply`, change);
      outcome = result.grade.verdict;
    }
  } catch (error) {
    outcome = "error";
    console.error(`  player ${n}: ${(error as Error).message}`);
  }
  t[outcome]++;
  done++;
  const label = session.variant === "scope_preview" ? "B" : "A";
  const what = change ? `${change.environment}/${change.target}/${change.action}` : "no change";
  console.log(
    `[${String(done).padStart(3)}/${PLAYERS}] ${label} ${session.scenario.id.padEnd(22)} ${what.padEnd(40)} ${outcome}${redrafts ? ` (redrafted ${redrafts}x)` : ""}`,
  );
}

async function main() {
  console.log(`Simulating ${PLAYERS} players against ${APP} (concurrency ${CONCURRENCY}, seed ${SEED})\n`);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
    while (next < PLAYERS) {
      const n = ++next;
      try {
        await playOne(n);
      } catch (error) {
        console.error(`  player ${n} could not start: ${(error as Error).message}`);
      }
    }
  });
  await Promise.all(workers);

  console.log("\nVariant                               Players  Scoped fix  Collateral  Other");
  for (const [key, label] of [
    ["runbook", "A · Runbook only"],
    ["scope_preview", "B · Runbook + blast-radius preview"],
  ] as const) {
    const t = tally[key];
    const other = t.players - t.scoped_recovery - t.collateral_damage;
    const pct = (v: number) => (t.players ? `${Math.round((v / t.players) * 100)}%` : "-");
    console.log(
      `${label.padEnd(38)}${String(t.players).padStart(7)}  ${pct(t.scoped_recovery).padStart(10)}  ${pct(t.collateral_damage).padStart(10)}  ${String(other).padStart(5)}`,
    );
  }
  console.log(
    "\nEvents go to the Simulation environment's experiment. Flagsmith recomputes results at most every\n5 minutes; open /results → Simulated players.",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
