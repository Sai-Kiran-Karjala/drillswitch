import "server-only";
import { vendorSdk } from "@/lib/drill/experiment";

export type Plan = "free" | "team";

export interface Entitlements {
  maxMembers: number;
  historyDays: number;
  byoFlagsmith: boolean;
  /** How many drills the workspace may write; 0 when the plan doesn't include them. */
  customDrills: number;
}

/** Used only if Flagsmith cannot be reached: the most restrictive (Free) limits. */
const FALLBACK: Entitlements = { maxMembers: 3, historyDays: 7, byoFlagsmith: false, customDrills: 0 };

/**
 * Plan limits are not hard-coded: they are Flagsmith flags in the DrillSwitch project
 * (max_members, drill_history_days, byo_flagsmith, custom_drills) with a team_plan segment override.
 * The workspace is the identity; its plan is a trait. Evaluated transiently, so no
 * identity is stored in Flagsmith.
 */
export async function getEntitlements(workspaceId: string, plan: Plan): Promise<Entitlements> {
  try {
    const flags = await vendorSdk().getIdentityFlags(`workspace_${workspaceId}`, { workspace_plan: plan }, true);
    const num = (name: string, fallback: number) => {
      const v = Number(flags.getFeatureValue(name));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    return {
      maxMembers: num("max_members", FALLBACK.maxMembers),
      historyDays: num("drill_history_days", FALLBACK.historyDays),
      byoFlagsmith: flags.isFeatureEnabled("byo_flagsmith"),
      customDrills: flags.isFeatureEnabled("custom_drills") ? num("custom_drills", 0) : 0,
    };
  } catch (error) {
    console.error("entitlements: Flagsmith unavailable, using Free limits", error);
    return FALLBACK;
  }
}

export const PLANS: Record<Plan, { name: string; price: string; blurb: string }> = {
  free: { name: "Free", price: "$0", blurb: "For a small on-call rotation getting started." },
  team: { name: "Team", price: "$12 / seat / month", blurb: "For engineering orgs that drill every on-call engineer." },
};
