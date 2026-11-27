import "server-only";
import { adminRequest, listOf, type FlagsmithConnection, type FlagsmithTarget } from "@/lib/drill/flagsmith-admin";

const ENVIRONMENTS = { production: "Production", staging: "Staging" } as const;
const SEGMENTS = [
  { key: "eu_customers", property: "region", value: "eu", description: "Customers billed in the EU" },
  { key: "us_customers", property: "region", value: "us", description: "Customers billed in the US" },
  { key: "internal_staff", property: "plan", value: "internal", description: "Employees dogfooding new features" },
] as const;

export type ProvisionedProject = Omit<FlagsmithTarget, keyof FlagsmithConnection>;

/** Finds or creates environments by name in one project; returns their client keys. */
export async function ensureEnvironments<K extends string>(
  conn: FlagsmithConnection,
  projectId: number,
  names: Record<K, string>,
): Promise<Record<K, string>> {
  const envs = listOf(await adminRequest(conn, "GET", `environments/?project=${projectId}`));
  const out = {} as Record<K, string>;
  for (const [key, name] of Object.entries(names) as [K, string][]) {
    const found =
      envs.find((e) => e.name === name) ??
      (await adminRequest<Record<string, unknown>>(conn, "POST", "environments/", { name, project: projectId }));
    out[key] = String(found.api_key);
  }
  return out;
}

/**
 * Makes sure a Flagsmith project exists with what a drill needs (Production and Staging
 * environments, and the eu/us/staff segments). Safe to run again: it reuses what is there.
 */
export async function provisionDrillProject(
  conn: FlagsmithConnection,
  organisationId: number,
  projectName: string,
): Promise<ProvisionedProject> {
  const projects = listOf(await adminRequest(conn, "GET", `projects/?organisation=${organisationId}`));
  const project =
    projects.find((p) => p.name === projectName) ??
    (await adminRequest<Record<string, unknown>>(conn, "POST", "projects/", { name: projectName, organisation: organisationId }));
  const projectId = Number(project.id);

  const env = await ensureEnvironments(conn, projectId, ENVIRONMENTS);

  const segs = listOf(await adminRequest(conn, "GET", `projects/${projectId}/segments/?page_size=100`));
  const segments = {} as ProvisionedProject["segments"];
  for (const s of SEGMENTS) {
    const found =
      segs.find((e) => e.name === s.key) ??
      (await adminRequest<Record<string, unknown>>(conn, "POST", `projects/${projectId}/segments/`, {
      name: s.key,
      description: s.description,
      project: projectId,
        rules: [{ type: "ALL", rules: [{ type: "ANY", conditions: [{ property: s.property, operator: "EQUAL", value: s.value }] }] }],
      }));
    segments[s.key] = Number(found.id);
  }

  return { projectId, env, segments };
}
