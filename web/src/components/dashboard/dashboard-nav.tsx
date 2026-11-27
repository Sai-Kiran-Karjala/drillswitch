"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Readiness" },
  { href: "/dashboard/drills", label: "Drills" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/settings", label: "Plan & Flagsmith" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active = tab.href === "/dashboard" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
