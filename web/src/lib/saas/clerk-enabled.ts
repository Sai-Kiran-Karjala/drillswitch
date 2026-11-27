// Team workspaces need Clerk. Without keys, DrillSwitch runs as the single-player demo,
// so the self-hosted kit works with no third-party account.
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
