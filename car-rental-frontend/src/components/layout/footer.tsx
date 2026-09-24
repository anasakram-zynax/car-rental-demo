import { CarFront } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/cars", label: "Cars" },
  { href: "/my-bookings", label: "My Booking" },
  { href: "/admin", label: "Admin" },
] as const;

export function Footer() {
  return (
    <footer className="relative z-10 mt-auto border-t border-border/70 bg-surface-glass/70">
      <PageContainer className="flex min-w-0 flex-col gap-5 py-7 text-sm text-muted md:flex-row md:items-center md:justify-between">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-control font-semibold text-foreground outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
        >
          <CarFront aria-hidden="true" size={17} strokeWidth={1.8} />
          Northstar Rentals
        </Link>
        <nav className="w-full min-w-0 md:w-auto" aria-label="Footer navigation">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-y-2">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-control outline-none transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="max-w-full whitespace-normal">© {new Date().getFullYear()} Northstar Rentals</p>
      </PageContainer>
    </footer>
  );
}
