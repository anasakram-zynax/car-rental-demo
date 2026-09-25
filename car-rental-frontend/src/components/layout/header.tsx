"use client";

import { CarFront, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { cn } from "@/lib/cn";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/cars", label: "Cars" },
  { href: "/my-bookings", label: "My Booking" },
] as const;

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  function isActive(href: string) {
    return href === "/" ? pathname === href : pathname.startsWith(href);
  }

  return (
    <header className="home-theme relative z-40 border-b border-border/70 bg-white/95 text-foreground backdrop-blur-md">
      <PageContainer className="relative flex min-h-16 items-center justify-between gap-5 py-2.5">
        <Link
          href="/"
          onClick={() => setMenuOpen(false)}
          className="inline-flex items-center gap-2.5 rounded-control font-semibold tracking-[-0.02em] text-foreground outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <CarFront aria-hidden="true" size={20} strokeWidth={1.9} />
          </span>
          <span className="hidden min-[390px]:inline">Northstar Rentals</span>
        </Link>
        <button
          type="button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="customer-navigation"
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-10 place-items-center rounded-control border border-border bg-white text-foreground outline-none transition-colors hover:bg-background focus-visible:ring-4 focus-visible:ring-[var(--ring)] md:hidden"
        >
          {menuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
        </button>
        <nav
          id="customer-navigation"
          aria-label="Primary navigation"
          className={cn(
            "absolute inset-x-4 top-[calc(100%+0.5rem)] rounded-card border border-border bg-white p-2 shadow-elevated md:static md:block md:border-0 md:bg-transparent md:p-0 md:shadow-none",
            menuOpen ? "block" : "hidden",
          )}
        >
          <ul className="grid gap-1 text-sm font-medium md:flex md:items-center">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "block rounded-control px-3.5 py-2.5 text-muted outline-none transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--ring)] md:py-2",
                    isActive(item.href) && "bg-primary/8 text-primary",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-1 border-t border-border pt-2 md:mt-0 md:ml-2 md:border-0 md:pt-0">
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className={buttonStyles({
                  className: "w-full md:w-auto",
                  variant: "secondary",
                  size: "sm",
                })}
              >
                Admin
              </Link>
            </li>
          </ul>
        </nav>
      </PageContainer>
    </header>
  );
}
