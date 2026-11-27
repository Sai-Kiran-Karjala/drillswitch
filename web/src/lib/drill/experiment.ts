import "server-only";
import { Flagsmith } from "@flagsmith/nodejs";
import { getConfig } from "./config";
import type { ConsoleVariant } from "./scenario";

export type TrafficSource = "human" | "sim";

export const EXPERIMENT_FLAG = "drill_console";
export const EVENTS = {
  success: "scoped_recovery_verified",
  collateral: "healthy_customers_broken",
} as const;

const globalForSdk = globalThis as unknown as { __drillSdk?: Partial<Record<TrafficSource, Flagsmith>> };

/** Humans run in Production, simulated players in Simulation, so results never mix. */
function client(source: TrafficSource): Flagsmith {
  globalForSdk.__drillSdk ??= {};
  const cached = globalForSdk.__drillSdk[source];
  if (cached) return cached;
  const { url, env } = getConfig();
  const sdk = new Flagsmith({
    environmentKey: source === "human" ? env.production : env.simulation,
    apiUrl: `${url}/api/v1/`,
    enableEvents: true,
    // Self-hosted with the Flagsmith-database warehouse: events go to the API itself.
    eventProcessorConfig: { eventsApiUrl: `${url}/api/` },
  });
  globalForSdk.__drillSdk[source] = sdk;
  return sdk;
}

/** The SDK client for DrillSwitch's own Production environment (experiment + plan entitlements). */
export function vendorSdk(): Flagsmith {
  return client("human");
}

/**
 * Gets the player's console variant. This call also records the exposure, so it is made
 * when the console is about to be shown.
 */
export async function assignVariant(source: TrafficSource, playerId: string): Promise<ConsoleVariant> {
  const flag = await client(source).getExperimentFlag(EXPERIMENT_FLAG, playerId);
  return flag.value === "scope_preview" ? "scope_preview" : "runbook";
}

export function trackOutcome(source: TrafficSource, playerId: string, outcome: { success: boolean; collateral: boolean }) {
  const sdk = client(source);
  if (outcome.success) sdk.trackEvent(EVENTS.success, { identifier: playerId });
  if (outcome.collateral) sdk.trackEvent(EVENTS.collateral, { identifier: playerId });
}
