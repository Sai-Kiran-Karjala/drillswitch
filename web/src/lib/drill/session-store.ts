import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/saas/crypto";
import { appDb } from "@/lib/saas/db";
import type { DrillSession } from "./sessions";

// Drill sessions live in the app database, so any server instance (or serverless function)
// can serve any drill. The Flagsmith admin key in a session's target is stored encrypted.

/** A claim that is never released (a crashed function) expires after this long. */
const APPLY_CLAIM_TTL = "60 seconds";
const AGENT_CLAIM_TTL = "150 seconds"; // the copilot's run budget is 90 seconds

type Stored = Omit<DrillSession, "target"> & { target: Omit<DrillSession["target"], "adminKey"> };

function revive(data: Stored, adminKey: string): DrillSession {
  return { ...data, target: { ...data.target, adminKey: decryptSecret(adminKey) } } as DrillSession;
}

export async function putSession(s: DrillSession): Promise<void> {
  const db = await appDb();
  const { adminKey, ...target } = s.target;
  const data: Stored = { ...s, target };
  await db`
    INSERT INTO drill_sessions (id, data, admin_key, started_at)
    VALUES (${s.id}, ${db.json(data as never)}, ${encryptSecret(adminKey)}, ${new Date(s.startedAt)})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
}

export async function loadSession(id: string): Promise<DrillSession | undefined> {
  if (!/^[0-9a-f]{16}$/.test(id)) return undefined;
  const db = await appDb();
  const [row] = await db<{ data: Stored; admin_key: string }[]>`SELECT data, admin_key FROM drill_sessions WHERE id = ${id}`;
  return row ? revive(row.data, row.admin_key) : undefined;
}

/** Merges fields into a stored session without touching the others (no lost updates). */
export async function patchSession(id: string, fields: Partial<Omit<DrillSession, "target" | "id">>): Promise<void> {
  const db = await appDb();
  await db`UPDATE drill_sessions SET data = data || ${db.json(fields as never)} WHERE id = ${id}`;
}

export async function removeSession(id: string): Promise<void> {
  const db = await appDb();
  await db`DELETE FROM drill_sessions WHERE id = ${id}`;
}

/** Takes the "applying a change" or "copilot running" lock; false if someone else holds it. */
export async function claim(id: string, what: "apply" | "agent"): Promise<boolean> {
  const db = await appDb();
  const rows =
    what === "apply"
      ? await db`UPDATE drill_sessions SET applying_since = now()
                 WHERE id = ${id} AND (applying_since IS NULL OR applying_since < now() - ${APPLY_CLAIM_TTL}::interval) RETURNING id`
      : await db`UPDATE drill_sessions SET agent_since = now()
                 WHERE id = ${id} AND (agent_since IS NULL OR agent_since < now() - ${AGENT_CLAIM_TTL}::interval) RETURNING id`;
  return rows.length > 0;
}

export async function release(id: string, what: "apply" | "agent"): Promise<void> {
  const db = await appDb();
  if (what === "apply") await db`UPDATE drill_sessions SET applying_since = NULL WHERE id = ${id}`;
  else await db`UPDATE drill_sessions SET agent_since = NULL WHERE id = ${id}`;
}

/** Removes sessions started before the cutoff and returns them, so their flags can be cleaned up. */
export async function takeExpired(cutoff: number): Promise<DrillSession[]> {
  const db = await appDb();
  const rows = await db<{ data: Stored; admin_key: string }[]>`
    DELETE FROM drill_sessions WHERE started_at < ${new Date(cutoff)} RETURNING data, admin_key`;
  return rows.map((r) => revive(r.data, r.admin_key));
}
