// The built-in drill library. Each drill practises a different Flagsmith move.
import type { Customer, Scenario, SegmentDef } from "./scenario";

const company = (
  id: string,
  name: string,
  region: "eu" | "us",
  city: string,
  plan: "enterprise" | "growth" | "starter",
  affected: boolean,
): Customer => ({
  id,
  name,
  detail: `${region.toUpperCase()} · ${city} · ${plan[0].toUpperCase()}${plan.slice(1)}`,
  traits: { region, plan },
  affected,
});

const EU: SegmentDef = { key: "eu_customers", description: "Customers billed in the EU", conditions: [{ property: "region", value: "eu" }] };
const US: SegmentDef = { key: "us_customers", description: "Customers billed in the US", conditions: [{ property: "region", value: "us" }] };
const STAFF: SegmentDef = {
  key: "internal_staff",
  description: "Employees dogfooding new features",
  conditions: [{ property: "plan", value: "internal" }],
};
const ENTERPRISE: SegmentDef = {
  key: "enterprise_plan",
  description: "Customers on the Enterprise plan",
  conditions: [{ property: "plan", value: "enterprise" }],
};

export const BUILT_IN_SCENARIOS: Scenario[] = [
  {
    id: "eu-card-payments",
    incident: {
      id: "INC-2041",
      severity: "SEV-2",
      title: "Card payments failing for EU customers",
      detectedAt: "10:42 UTC",
      summary:
        "Since the new_checkout rollout, the 3-D Secure redirect fails for cards issued in the EU. EU customers cannot complete payment.",
      signals: [
        "EU payment success rate dropped from 97% to 41%",
        "US checkout conversion is up 4% on the new flow",
        "Finance asks to keep new_checkout on for US customers",
      ],
      ask: "Stop the bleeding for affected customers without touching anyone who is healthy.",
    },
    flag: { name: "new_checkout", description: "New checkout flow with the 3-D Secure v2 redirect" },
    baseline: { enabled: true, overrides: [] },
    safeState: false,
    segments: [EU, US, STAFF],
    customers: [
      company("cust-acme-gmbh", "Acme GmbH", "eu", "Berlin", "enterprise", true),
      company("cust-lumen-sarl", "Lumen SARL", "eu", "Paris", "growth", true),
      company("cust-fjord-ab", "Fjord AB", "eu", "Stockholm", "growth", true),
      company("cust-bluefin-inc", "Bluefin Inc", "us", "Austin", "enterprise", false),
      company("cust-cascade-llc", "Cascade LLC", "us", "Seattle", "growth", false),
      company("cust-harbor-co", "Harbor & Co", "us", "Boston", "starter", false),
    ],
  },
  {
    id: "android-upload-crash",
    incident: {
      id: "INC-2077",
      severity: "SEV-1",
      title: "Android app crashes on photo upload",
      detectedAt: "07:15 UTC",
      summary:
        "Since new_image_pipeline reached everyone, the Android app crashes when people upload a receipt photo. iOS and web are fine.",
      signals: [
        "Android crash-free sessions dropped from 99.6% to 81%",
        "iOS and web error rates are flat",
        "The mobile beta group wants to keep the new pipeline: it halves upload time on iOS",
      ],
      ask: "Stop the crashes without taking the faster pipeline away from anyone it works for.",
    },
    flag: { name: "new_image_pipeline", description: "Client-side image compression before upload" },
    baseline: { enabled: true, overrides: [] },
    safeState: false,
    segments: [
      { key: "android_users", description: "People on the Android app", conditions: [{ property: "platform", value: "android" }] },
      { key: "ios_users", description: "People on the iOS app", conditions: [{ property: "platform", value: "ios" }] },
      { key: "mobile_beta", description: "Mobile beta testers", conditions: [{ property: "beta", value: "true" }] },
    ],
    customers: [
      { id: "user-priya", name: "Priya", detail: "Android · beta tester", traits: { platform: "android", beta: "true" }, affected: true },
      { id: "user-marco", name: "Marco", detail: "Android", traits: { platform: "android", beta: "false" }, affected: true },
      { id: "user-chen", name: "Chen", detail: "Android", traits: { platform: "android", beta: "false" }, affected: true },
      { id: "user-sofia", name: "Sofia", detail: "iOS · beta tester", traits: { platform: "ios", beta: "true" }, affected: false },
      { id: "user-james", name: "James", detail: "iOS", traits: { platform: "ios", beta: "false" }, affected: false },
      { id: "user-amara", name: "Amara", detail: "Web", traits: { platform: "web", beta: "false" }, affected: false },
    ],
  },
  {
    id: "one-customer-export",
    incident: {
      id: "INC-2102",
      severity: "SEV-2",
      title: "Acme's data export times out before month-end close",
      detectedAt: "16:20 UTC",
      summary:
        "bulk_export_v2 runs each export as one job. Acme GmbH has 40 million rows, so their export times out after 30 minutes and their finance team can't close the month.",
      signals: [
        "Acme: 6 failed exports today; their CFO escalated the ticket",
        "Every other customer's median export time fell from 9 to 2 minutes on v2",
        "Acme is the only account over 5 million rows",
      ],
      ask: "Get Acme back on the old exporter without slowing anyone else down.",
    },
    flag: { name: "bulk_export_v2", description: "Single-job streaming exporter" },
    baseline: { enabled: true, overrides: [] },
    safeState: false,
    segments: [ENTERPRISE, EU, US],
    customers: [
      company("cust-acme-gmbh", "Acme GmbH", "eu", "Berlin", "enterprise", true),
      company("cust-lumen-sarl", "Lumen SARL", "eu", "Paris", "growth", false),
      company("cust-fjord-ab", "Fjord AB", "eu", "Stockholm", "growth", false),
      company("cust-bluefin-inc", "Bluefin Inc", "us", "Austin", "enterprise", false),
      company("cust-cascade-llc", "Cascade LLC", "us", "Seattle", "growth", false),
      company("cust-harbor-co", "Harbor & Co", "us", "Boston", "starter", false),
    ],
  },
  {
    id: "staff-tool-leak",
    incident: {
      id: "INC-2115",
      severity: "SEV-1",
      title: "Customers can see the staff impersonation button",
      detectedAt: "09:18 UTC",
      summary:
        "admin_impersonation lets support staff sign in as a customer. It should only be on for staff, through the internal_staff segment override. At 09:10 someone switched its environment default ON in Production.",
      signals: [
        "3 customers reported an 'Impersonate user' button in their account menu",
        "Security wants it gone for customers within minutes",
        "Support still needs it for 12 open tickets",
      ],
      ask: "Hide it from every customer and keep it working for support staff.",
    },
    flag: { name: "admin_impersonation", description: "Lets support staff sign in as a customer" },
    baseline: { enabled: true, overrides: [{ segment: "internal_staff", enabled: true }] },
    safeState: false,
    segments: [STAFF, EU, US],
    customers: [
      company("cust-acme-gmbh", "Acme GmbH", "eu", "Berlin", "enterprise", true),
      company("cust-lumen-sarl", "Lumen SARL", "eu", "Paris", "growth", true),
      company("cust-bluefin-inc", "Bluefin Inc", "us", "Austin", "enterprise", true),
      company("cust-harbor-co", "Harbor & Co", "us", "Boston", "starter", true),
      { id: "staff-dana", name: "Dana (Support)", detail: "Staff · Dublin", traits: { region: "eu", plan: "internal" }, affected: false },
      { id: "staff-ravi", name: "Ravi (Support)", detail: "Staff · Denver", traits: { region: "us", plan: "internal" }, affected: false },
    ],
  },
  {
    id: "us-processor-outage",
    incident: {
      id: "INC-2130",
      severity: "SEV-1",
      title: "Card processor outage in the US",
      detectedAt: "13:05 UTC",
      summary:
        "Our US card processor is down. payments_fallback_provider routes card payments through the backup processor, and it is off for everyone.",
      signals: [
        "US card authorisations failing since 13:05: 100% error rate",
        "EU payments go through a different processor and are healthy",
        "Legal: EU payments must not use the backup processor; our EU contract doesn't cover it",
      ],
      ask: "Restore US payments without moving any EU traffic to the backup processor.",
    },
    flag: { name: "payments_fallback_provider", description: "Route card payments through the backup processor" },
    baseline: { enabled: false, overrides: [] },
    safeState: true,
    segments: [EU, US, ENTERPRISE],
    customers: [
      company("cust-bluefin-inc", "Bluefin Inc", "us", "Austin", "enterprise", true),
      company("cust-cascade-llc", "Cascade LLC", "us", "Seattle", "growth", true),
      company("cust-harbor-co", "Harbor & Co", "us", "Boston", "starter", true),
      company("cust-acme-gmbh", "Acme GmbH", "eu", "Berlin", "enterprise", false),
      company("cust-lumen-sarl", "Lumen SARL", "eu", "Paris", "growth", false),
      company("cust-fjord-ab", "Fjord AB", "eu", "Stockholm", "growth", false),
    ],
  },
];

export const DEFAULT_SCENARIO_ID = BUILT_IN_SCENARIOS[0].id;

export function getBuiltInScenario(id: string): Scenario | undefined {
  return BUILT_IN_SCENARIOS.find((s) => s.id === id);
}
