"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/** `signedIn` comes from the server session, so nothing here waits for Clerk to load. */
export function AccountNav({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/sign-up">Start free</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link href="/dashboard">Dashboard</Link>
      </Button>
      <OrganizationSwitcher
        hidePersonal
        afterCreateOrganizationUrl="/dashboard"
        afterSelectOrganizationUrl="/dashboard"
        appearance={{ elements: { rootBox: "hidden md:flex" } }}
      />
      {/* Holds the avatar's space until Clerk's script draws it. */}
      <div className="grid size-7 place-items-center">
        <UserButton />
      </div>
    </div>
  );
}
