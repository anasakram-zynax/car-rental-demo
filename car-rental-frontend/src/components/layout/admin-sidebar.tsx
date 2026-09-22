import { ArrowLeft, CalendarDays, CarFront, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";

const adminNavigation = [
  { href: "/admin", label: "Dashboard / Cars", icon: LayoutDashboard },
  { href: "/admin/cars/new", label: "Add Car", icon: Plus },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/", label: "Back to Site", icon: ArrowLeft },
] as const;

export function AdminSidebar() {
  return (
    <aside className="border-b border-border bg-surface-glass p-3 backdrop-blur-md lg:min-h-svh lg:border-r lg:border-b-0 lg:p-5">
      <div className="flex items-center justify-between gap-4 lg:block">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-control px-2 py-2 font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
        >
          <CarFront aria-hidden="true" size={20} />
          <span>Rental Admin</span>
        </Link>
        <nav aria-label="Admin navigation" className="lg:mt-8">
          <ul className="flex flex-wrap gap-1 lg:grid">
            {adminNavigation.map(({ href, icon: Icon, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-black/[0.045] hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
                >
                  <Icon aria-hidden="true" size={17} />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
