import { ArrowUpRight, CarFront } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";

const exploreNavigation = [
  { href: "/", label: "Home" },
  { href: "/cars", label: "Cars" },
  { href: "/my-bookings", label: "My Booking" },
] as const;

export function Footer() {
  return (
    <footer className="home-theme relative z-10 mt-auto border-t border-border bg-white text-foreground">
      <PageContainer className="grid gap-10 py-10 text-sm text-muted sm:grid-cols-2 lg:grid-cols-[minmax(0,1.7fr)_0.7fr_0.7fr] lg:gap-16 lg:py-12">
        <div className="max-w-sm">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2.5 rounded-control font-semibold text-foreground outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <CarFront aria-hidden="true" size={17} strokeWidth={1.9} />
            </span>
            Northstar Rentals
          </Link>
          <p className="mt-4 leading-6">
            Find rental cars and fixed-route transfers through one clear booking
            experience.
          </p>
        </div>
        <nav aria-label="Explore">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-foreground uppercase">
            Explore
          </h2>
          <ul className="mt-4 grid gap-3">
            {exploreNavigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded outline-none transition-colors hover:text-primary focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Management">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-foreground uppercase">
            Management
          </h2>
          <Link
            href="/admin"
            className="mt-4 inline-flex items-center gap-1.5 rounded text-muted outline-none transition-colors hover:text-primary focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
          >
            Admin dashboard <ArrowUpRight aria-hidden="true" size={14} />
          </Link>
        </nav>
      </PageContainer>
      <div className="border-t border-border">
        <PageContainer className="py-4 text-xs text-muted">
          © {new Date().getFullYear()} Northstar Rentals
        </PageContainer>
      </div>
    </footer>
  );
}
