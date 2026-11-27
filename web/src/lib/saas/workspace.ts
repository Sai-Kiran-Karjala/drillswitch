import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { adminRequest, listOf, vendorConnection, type FlagsmithTarget } from "@/lib/drill/flagsmith-admin";
import { getConfig } from "@/lib/drill/config";
import { decryptSecret, encryptSecret } from "./crypto";
import { getEntitlements, type Plan } from "./entitlements";
import { ensureEnvironments, provisionDrillProject, type ProvisionedProject } from "./provision";
import { checkFlagsmithUrl } from "./url-guard";

/** Stored in the Clerk organisation's privateMetadata (server-only). */
interface ByoRecord extends ProvisionedProject {
  url: string;
  encryptedKey: string;
  organisationName: string;
  connectedAt: string;
}
interface FlagsmithMeta {
  active: "hosted" | "byo";
  hosted?: ProvisionedProject;
  byo?: ByoRecord;
}

export type FlagsmithMode = "hosted" | "byo";

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  plan: Plan;
  members: number;
  /** Clerk's enforced seat cap for this organisation (0 = unlimited). */
  seatCap: number;
  mode: FlagsmithMode;
  byo?: { url: string; organisationName: string; projectId: number; connectedAt: string };
  hostedProjectId?: number;
}

const BYO_PROJECT_NAME = "DrillSwitch drills";

async function clerk() {
  return clerkClient();
}

function readMeta(privateMetadata: unknown): FlagsmithMeta {
  const m = (privateMetadata as { flagsmith?: FlagsmithMeta } | null)?.flagsmith;
  return m ?? { active: "hosted" };
}

async function saveMeta(orgId: string, meta: FlagsmithMeta) {
  const client = await clerk();
  // updateOrganizationMetadata deep-merges; send the whole flagsmith object.
  await client.organizations.updateOrganizationMetadata(orgId, { privateMetadata: { flagsmith: meta } });
}

export async function getWorkspace(orgId: string): Promise<Workspace> {
  const client = await clerk();
  const org = await client.organizations.getOrganization({ organizationId: orgId, includeMembersCount: true });
  const meta = readMeta(org.privateMetadata);
  const plan = (org.publicMetadata as { plan?: Plan } | null)?.plan === "team" ? "team" : "free";
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan,
    members: org.membersCount ?? 0,
    seatCap: org.maxAllowedMemberships ?? 0,
    mode: meta.active === "byo" && meta.byo ? "byo" : "hosted",
    byo: meta.byo && {
      url: meta.byo.url,
      organisationName: meta.byo.organisationName,
      projectId: meta.byo.projectId,
      connectedAt: meta.byo.connectedAt,
    },
    hostedProjectId: meta.hosted?.projectId,
  };
}

const provisioning = new Map<string, Promise<ProvisionedProject>>();

/**
 * Hosted mode: each workspace gets its own Production and Staging environments inside
 * DrillSwitch's Flagsmith project. Environments isolate flag state between workspaces;
 * the eu/us/staff segments are identical for everyone, so they are shared.
 * (Self-hosted Flagsmith's free subscription allows one project per organisation.)
 */
async function ensureHosted(orgId: string, meta: FlagsmithMeta): Promise<ProvisionedProject> {
  if (meta.hosted) return meta.hosted;
  let pending = provisioning.get(orgId);
  if (!pending) {
    pending = (async () => {
      const { projectId, segments } = getConfig();
      const env = await ensureEnvironments(vendorConnection(), projectId, {
        production: `${orgId} · Production`,
        staging: `${orgId} · Staging`,
      });
      const hosted: ProvisionedProject = { projectId, env, segments };
      await saveMeta(orgId, { ...meta, hosted });
      return hosted;
    })().finally(() => provisioning.delete(orgId));
    provisioning.set(orgId, pending);
  }
  return pending;
}

/** Where this workspace's drills run. */
export async function resolveTarget(orgId: string): Promise<{ target: FlagsmithTarget; mode: FlagsmithMode }> {
  const client = await clerk();
  const org = await client.organizations.getOrganization({ organizationId: orgId });
  const meta = readMeta(org.privateMetadata);
  if (meta.active === "byo" && meta.byo) {
    const { url, encryptedKey, projectId, env, segments } = meta.byo;
    return { target: { url, adminKey: decryptSecret(encryptedKey), projectId, env, segments }, mode: "byo" };
  }
  const hosted = await ensureHosted(orgId, meta);
  return { target: { ...vendorConnection(), ...hosted }, mode: "hosted" };
}

/**
 * Makes Clerk enforce the seat limit Flagsmith serves for this plan. Runs whenever a
 * workspace page loads, so a new workspace (or a limit changed in Flagsmith) is picked up.
 */
export async function syncSeatLimit(workspace: Workspace, maxMembers: number): Promise<void> {
  if (workspace.seatCap === maxMembers) return;
  const client = await clerk();
  await client.organizations
    .updateOrganization(workspace.id, { maxAllowedMemberships: maxMembers })
    .catch((error) => console.error("syncSeatLimit failed", error));
}

/** Changes the plan, then applies the seat limit that Flagsmith serves for it. */
export async function setPlan(orgId: string, plan: Plan): Promise<void> {
  const client = await clerk();
  const ent = await getEntitlements(orgId, plan);
  await client.organizations.updateOrganizationMetadata(orgId, { publicMetadata: { plan } });
  await client.organizations.updateOrganization(orgId, { maxAllowedMemberships: ent.maxMembers });
  if (!ent.byoFlagsmith) {
    const org = await client.organizations.getOrganization({ organizationId: orgId });
    const meta = readMeta(org.privateMetadata);
    if (meta.active === "byo") await saveMeta(orgId, { ...meta, active: "hosted" });
  }
}

/** Connects the team's own Flagsmith organisation and prepares a drill project inside it. */
export async function connectByo(orgId: string, rawUrl: string, apiKey: string): Promise<void> {
  const workspace = await getWorkspace(orgId);
  const ent = await getEntitlements(orgId, workspace.plan);
  if (!ent.byoFlagsmith) throw new Error("Connecting your own Flagsmith is part of the Team plan.");
  const key = apiKey.trim();
  if (key.length < 20 || /\s/.test(key)) throw new Error("That does not look like a Flagsmith organisation API key.");

  const url = await checkFlagsmithUrl(rawUrl);
  const conn = { url, adminKey: key };
  let orgs;
  try {
    orgs = listOf(await adminRequest(conn, "GET", "organisations/"));
  } catch {
    throw new Error("Flagsmith rejected that key. Use an organisation admin API key from Organisation settings → API Keys.");
  }
  const fsOrg = orgs[0];
  if (!fsOrg) throw new Error("That key has no organisation.");
  let project: ProvisionedProject;
  try {
    project = await provisionDrillProject(conn, Number(fsOrg.id), BYO_PROJECT_NAME);
  } catch (error) {
    if (String(error).includes("POST projects/ -> 403")) {
      throw new Error(
        `Flagsmith would not let this key create the "${BYO_PROJECT_NAME}" project. Your Flagsmith plan may have no free project slot. Create a project with that name yourself and connect again.`,
      );
    }
    throw error;
  }

  const client = await clerk();
  const org = await client.organizations.getOrganization({ organizationId: orgId });
  const meta = readMeta(org.privateMetadata);
  await saveMeta(orgId, {
    ...meta,
    active: "byo",
    byo: {
      ...project,
      url,
      encryptedKey: encryptSecret(key),
      organisationName: String(fsOrg.name),
      connectedAt: new Date().toISOString(),
    },
  });
}

/** Switches back to the hosted sandbox and forgets the stored key. */
export async function disconnectByo(orgId: string): Promise<void> {
  const client = await clerk();
  const org = await client.organizations.getOrganization({ organizationId: orgId });
  const meta = readMeta(org.privateMetadata);
  await client.organizations.updateOrganizationMetadata(orgId, {
    privateMetadata: { flagsmith: { ...meta, active: "hosted", byo: null } },
  });
}
