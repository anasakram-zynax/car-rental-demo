import { CarFront } from "lucide-react";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/cars", label: "Cars" },
  { href: "/my-bookings", label: "My Booking" },
] as const;

export function Header() {
  return (
    <header className="relative z-30 border-b border-border/70 bg-surface-glass backdrop-blur-md">
      <PageContainer className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-control font-semibold tracking-tight text-foreground outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
        >
          <span className="grid size-9 place-items-center rounded-control bg-primary text-primary-foreground shadow-sm">
            <CarFront aria-hidden="true" size={19} strokeWidth={1.8} />
          </span>
          <span className="hidden min-[390px]:inline">Northstar Rentals</span>
        </Link>
        <nav aria-label="Primary navigation">
          <ul className="flex flex-wrap items-center gap-1 text-sm font-medium">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-control px-3 py-2 text-muted transition-colors hover:bg-black/[0.045] hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="ml-1">
              <Link
                href="/admin"
                className={buttonStyles({ variant: "secondary", size: "sm" })}
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
