import Link from "next/link";
import { Siren } from "lucide-react";
import { AccountNav } from "@/components/account-nav";
import { clerkEnabled } from "@/lib/saas/clerk-enabled";

const NAV = [
  { href: "/drills", label: "Drills" },
  { href: "/pricing", label: "Pricing" },
  { href: "/results", label: "Lab results" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid size-7 place-items-center rounded-md bg-incident/15 text-incident">
            <Siren className="size-4" aria-hidden />
          </span>
          DrillSwitch
        </Link>
        <div className="flex items-center gap-2">
          <nav
            aria-label="Main"
            className="hidden items-center gap-1 text-sm sm:flex"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {clerkEnabled && <AccountNav />}
        </div>
      </div>
    </header>
  );
}
