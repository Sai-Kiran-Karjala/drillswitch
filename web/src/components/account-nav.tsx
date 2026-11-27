"use client";

import Link from "next/link";
import { OrganizationSwitcher, Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function AccountNav() {
  return (
    <div className="flex items-center gap-2">
      <Show
        when="signed-in"
        fallback={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Start free</Link>
            </Button>
          </>
        }
      >
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/dashboard"
          afterSelectOrganizationUrl="/dashboard"
          appearance={{ elements: { rootBox: "hidden md:flex" } }}
        />
        <UserButton />
      </Show>
    </div>
  );
}
