import Link from "next/link";
import { KeyRound } from "lucide-react";

export function TeamsDisabled() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <KeyRound className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">Team workspaces are not set up on this server</h1>
      <p className="text-sm text-muted-foreground">
        Add <code className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
        <code className="font-mono">CLERK_SECRET_KEY</code> to <code className="font-mono">web/.env.local</code> and
        restart. The single-player drill works without them.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to the drill
      </Link>
    </div>
  );
}
