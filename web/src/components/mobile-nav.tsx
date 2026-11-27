"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

/** The header's links on small screens, where the inline nav is hidden. */
export function MobileNav({
  items,
  showAccount,
  signedIn,
}: {
  items: NavItem[];
  showAccount: boolean;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links: NavItem[] = [
    ...(showAccount && signedIn ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...items,
  ];

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
        <MenuPanel
          links={links}
          signInLink={showAccount && !signedIn}
          onNavigate={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// Only rendered once opened in the browser, so reading the URL here never holds up the
// server render (a dynamic route like /drill/[id] would otherwise need a Suspense boundary).
function MenuPanel({
  links,
  signInLink,
  onNavigate,
}: {
  links: NavItem[];
  signInLink: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const linkClass = (href: string) =>
    cn(
      "block rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
      pathname === href || pathname.startsWith(`${href}/`)
        ? "bg-accent text-foreground"
        : "text-muted-foreground",
    );

  return (
    <nav
      id="mobile-nav"
      aria-label="Main"
      className="absolute inset-x-0 top-14 z-50 border-b border-border/60 bg-background px-4 pb-4 pt-2 shadow-sm"
    >
      <ul className="space-y-1">
        {links.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={linkClass(item.href)} onClick={onNavigate}>
              {item.label}
            </Link>
          </li>
        ))}
        {signInLink && (
          <li className="border-t border-border/60 pt-1 [html[data-signed-in]_&]:hidden">
            <Link href="/sign-in" className={linkClass("/sign-in")} onClick={onNavigate}>
              Sign in
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
