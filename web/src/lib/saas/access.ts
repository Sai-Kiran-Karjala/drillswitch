import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { clerkEnabled } from "./clerk-enabled";

/** The signed-in user's active workspace and whether they administer it. Call inside <Suspense>. */
export async function workspaceAccess() {
  if (!clerkEnabled) return { enabled: false, userId: null, orgId: null, isAdmin: false } as const;
  const { userId, orgId, has } = await auth();
  return { enabled: true, userId, orgId: orgId ?? null, isAdmin: Boolean(orgId) && has({ role: "org:admin" }) };
}

export interface Member {
  userId: string;
  name: string;
  identifier: string;
  imageUrl: string;
  role: string;
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100 });
  return data
    .filter((m) => m.publicUserData?.userId)
    .map((m) => {
      const u = m.publicUserData!;
      return {
        userId: u.userId,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.identifier,
        identifier: u.identifier,
        imageUrl: u.imageUrl,
        role: m.role,
      };
    });
}
