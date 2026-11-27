// Demo shop for INC-2041. Not part of DrillSwitch: it only gives the skill real code to trace.
import Flagsmith from "flagsmith-nodejs";
import { chargeCard, redirectTo3DSecureV1, redirectTo3DSecureV2 } from "./payments";

const flagsmith = new Flagsmith({ environmentKey: process.env.FLAGSMITH_SERVER_KEY! });

export async function startCardPayment(customer: { id: string; region: string; plan: string }, amount: number) {
  const flags = await flagsmith.getIdentityFlags(customer.id, { region: customer.region, plan: customer.plan });

  if (flags.isFeatureEnabled("new_checkout")) {
    // New flow: 3-D Secure v2 redirect through the new payment page.
    return redirectTo3DSecureV2(customer, amount);
  }
  return redirectTo3DSecureV1(customer, amount);
}

export async function chargeSavedCard(customerId: string, amount: number) {
  return chargeCard(customerId, amount);
}
