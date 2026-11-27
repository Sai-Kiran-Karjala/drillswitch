"use server";

import { revalidatePath } from "next/cache";
import { workspaceAccess } from "@/lib/saas/access";
import type { Plan } from "@/lib/saas/entitlements";
import { connectByo, disconnectByo, setPlan } from "@/lib/saas/workspace";

export type ActionState = { ok: boolean; message: string } | null;

async function requireAdmin() {
  const { orgId, isAdmin } = await workspaceAccess();
  if (!orgId) throw new Error("Pick a workspace first.");
  if (!isAdmin) throw new Error("Only workspace admins can change this.");
  return orgId;
}

async function run(fn: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await fn();
    revalidatePath("/dashboard", "layout");
    return { ok: true, message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function changePlan(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const plan = form.get("plan") === "team" ? "team" : ("free" satisfies Plan);
    await setPlan(await requireAdmin(), plan);
    return plan === "team" ? "Upgraded to Team." : "Moved to Free.";
  });
}

export async function connectFlagsmith(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const orgId = await requireAdmin();
    await connectByo(orgId, String(form.get("url") ?? ""), String(form.get("apiKey") ?? ""));
    return "Connected. Your next drill runs in your own Flagsmith.";
  });
}

export async function disconnectFlagsmith(): Promise<ActionState> {
  return run(async () => {
    await disconnectByo(await requireAdmin());
    return "Disconnected. Drills run in the hosted sandbox again, and the stored key was deleted.";
  });
}
