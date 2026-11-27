"use server";

import { revalidatePath } from "next/cache";
import { workspaceAccess } from "@/lib/saas/access";
import { getEntitlements } from "@/lib/saas/entitlements";
import { getWorkspace } from "@/lib/saas/workspace";
import {
  deleteWorkspaceScenario,
  getWorkspaceScenario,
  listWorkspaceScenarios,
  newScenarioId,
  saveWorkspaceScenario,
} from "@/lib/drill/scenario-store";
import { slug, validateScenario } from "@/lib/drill/scenario-validate";
import type { Scenario, Severity } from "@/lib/drill/scenario";

export type SaveDrillState = { ok: boolean; message: string; errors?: string[]; id?: string } | null;

async function requireAdmin() {
  const { orgId, userId, isAdmin } = await workspaceAccess();
  if (!orgId || !userId) throw new Error("Pick a workspace first.");
  if (!isAdmin) throw new Error("Only workspace admins can write drills.");
  return { orgId, userId };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown) => v === true;
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** Rebuilds a drill from untrusted JSON, keeping only known fields; ids are derived on the server. */
function sanitize(raw: Record<string, unknown>, id: string): Scenario {
  const incident = (raw.incident ?? {}) as Record<string, unknown>;
  const flag = (raw.flag ?? {}) as Record<string, unknown>;
  const baseline = (raw.baseline ?? {}) as Record<string, unknown>;
  const pairs = (v: unknown) =>
    list(v)
      .slice(0, 4)
      .map((p) => ({ property: str((p as Condition).property, 30), value: str((p as Condition).value, 40) }));
  type Condition = { property: string; value: string };
  const seen = new Map<string, number>();
  return {
    id,
    incident: {
      id: str(incident.id, 12) || `INC-${Math.floor(3000 + Math.random() * 6000)}`,
      severity: (["SEV-1", "SEV-2", "SEV-3"].includes(String(incident.severity)) ? incident.severity : "SEV-2") as Severity,
      title: str(incident.title, 100),
      detectedAt: str(incident.detectedAt, 20) || `${new Date().toISOString().slice(11, 16)} UTC`,
      summary: str(incident.summary, 500),
      signals: list(incident.signals)
        .map((l) => str(l, 160))
        .filter(Boolean)
        .slice(0, 5),
      ask: str(incident.ask, 200),
    },
    flag: { name: str(flag.name, 40), description: str(flag.description, 120) },
    baseline: {
      enabled: bool(baseline.enabled),
      overrides: list(baseline.overrides)
        .slice(0, 3)
        .map((o) => ({ segment: str((o as { segment: unknown }).segment, 30), enabled: bool((o as { enabled: unknown }).enabled) })),
    },
    safeState: bool(raw.safeState),
    segments: list(raw.segments)
      .slice(0, 6)
      .map((g) => {
        const seg = g as Record<string, unknown>;
        return { key: str(seg.key, 30), description: str(seg.description, 120), conditions: pairs(seg.conditions).slice(0, 3) };
      }),
    customers: list(raw.customers)
      .slice(0, 8)
      .map((c) => {
        const cust = c as Record<string, unknown>;
        const name = str(cust.name, 40);
        const base = `cust-${slug(name)}`;
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const rawTraits = cust.traits && typeof cust.traits === "object" ? Object.entries(cust.traits).slice(0, 4) : [];
        const traits = Object.fromEntries(rawTraits.map(([k, v]) => [str(k, 30), str(v, 40)]));
        return {
          id: n === 1 ? base : `${base}-${n}`,
          name,
          detail: str(cust.detail, 60) || Object.entries(traits).map(([k, v]) => `${k}=${v}`).join(" · "),
          traits,
          affected: bool(cust.affected),
        };
      }),
  };
}

export async function saveDrill(_: SaveDrillState, form: FormData): Promise<SaveDrillState> {
  try {
    const { orgId, userId } = await requireAdmin();
    const workspace = await getWorkspace(orgId);
    const ent = await getEntitlements(orgId, workspace.plan);
    if (ent.customDrills <= 0) return { ok: false, message: "Writing your own drills is part of the Team plan." };

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(String(form.get("scenario") ?? ""));
    } catch {
      return { ok: false, message: "The drill could not be read. Reload the page and try again." };
    }

    const existingId = str(form.get("id"), 20);
    if (existingId && !(await getWorkspaceScenario(orgId, existingId))) {
      return { ok: false, message: "That drill no longer exists." };
    }
    if (!existingId && (await listWorkspaceScenarios(orgId)).length >= ent.customDrills) {
      return { ok: false, message: `Your plan includes ${ent.customDrills} drills. Delete one to add another.` };
    }

    const scenario = sanitize(raw, existingId || newScenarioId());
    const errors = validateScenario(scenario);
    if (errors.length) return { ok: false, message: "Fix the problems below first.", errors };

    await saveWorkspaceScenario(orgId, userId, scenario);
    revalidatePath("/dashboard/drills");
    return { ok: true, message: existingId ? "Drill updated." : "Drill saved. Your team can run it now.", id: scenario.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function deleteDrill(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { orgId } = await requireAdmin();
    await deleteWorkspaceScenario(orgId, str(id, 20));
    revalidatePath("/dashboard/drills");
    return { ok: true, message: "Drill deleted." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong." };
  }
}
