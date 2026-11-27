"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

/** The header's links on small screens, where the inline nav is hidden. */
export function MobileNav({ items, showAccount }: { items: NavItem[]; showAccount: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigating (adjusting state during render, as React recommends), and on Escape.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const linkClass = (href: string) =>
    cn(
      "block rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
      pathname === href || pathname.startsWith(`${href}/`)
        ? "bg-accent text-foreground"
        : "text-muted-foreground",
    );

  return (
    <div className="sm:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </Button>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="absolute inset-x-0 top-14 z-50 border-b border-border/60 bg-background px-4 pb-4 pt-2 shadow-sm"
        >
          <ul className="space-y-1">
            {showAccount && (
              <Show when="signed-in">
                <li>
                  <Link href="/dashboard" className={linkClass("/dashboard")}>
                    Dashboard
                  </Link>
                </li>
              </Show>
            )}
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClass(item.href)}>
                  {item.label}
                </Link>
              </li>
            ))}
            {showAccount && (
              <Show when="signed-out">
                <li className="border-t border-border/60 pt-1">
                  <Link href="/sign-in" className={linkClass("/sign-in")}>
                    Sign in
                  </Link>
                </li>
              </Show>
            )}
          </ul>
        </nav>
      )}
    </div>
  );
}
