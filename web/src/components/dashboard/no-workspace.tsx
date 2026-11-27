"use client";

import { OrganizationList } from "@clerk/nextjs";

export function NoWorkspace() {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your team workspace</h1>
        <p className="text-sm text-muted-foreground">
          A workspace holds your on-call rotation, their drill history and your Flagsmith sandbox. You can invite
          teammates right after.
        </p>
      </div>
      <OrganizationList hidePersonal afterCreateOrganizationUrl="/dashboard" afterSelectOrganizationUrl="/dashboard" />
    </div>
  );
}
