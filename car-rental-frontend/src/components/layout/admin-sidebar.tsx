"use client";

import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const adminNavigation = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/cars", label: "Cars", icon: CarFront },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/", label: "Back to Site", icon: ArrowLeft },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-white/10 bg-[#101d37] p-3 text-white shadow-[0_18px_50px_rgba(16,29,55,0.18)] lg:sticky lg:top-0 lg:min-h-svh lg:self-start lg:border-r lg:border-b-0 lg:p-5">
      <div className="flex items-center justify-between gap-4 lg:block">
        <Link
          href="/admin"
          className="inline-flex items-center gap-3 rounded-control px-2 py-2 font-semibold outline-none focus-visible:ring-4 focus-visible:ring-white/30"
        >
          <span className="grid size-9 place-items-center rounded-control bg-blue-500 text-white shadow-lg shadow-blue-950/30">
            <CarFront aria-hidden="true" size={19} />
          </span>
          <span>
            <span className="block text-sm">Northstar</span>
            <span className="block text-[10px] font-medium tracking-[0.16em] text-slate-400 uppercase">
              Administration
            </span>
          </span>
        </Link>
        <nav aria-label="Admin navigation" className="lg:mt-8">
          <ul className="flex flex-wrap gap-1 lg:grid">
            {adminNavigation.map(({ href, icon: Icon, label }) => {
              const isActive =
                href === "/admin"
                  ? pathname === href
                  : href.startsWith("/admin") && pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-label={label}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25",
                      isActive && "bg-white/[0.12] text-white shadow-sm",
                      href === "/" &&
                        "lg:mt-4 lg:border-t lg:border-white/10 lg:pt-4",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={isActive ? "text-blue-300" : "text-slate-400"}
                      size={18}
                    />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
