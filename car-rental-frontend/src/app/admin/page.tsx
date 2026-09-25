import { ArrowRight, CalendarDays, CarFront } from "lucide-react";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";

export default function AdminPage() {
  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Administration</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Fleet workspace</h1>
        <p className="mt-3 max-w-xl leading-7 text-muted">Manage the fleet catalog and review booking activity from one focused workspace.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <AdminSectionCard href="/admin/cars" icon={CarFront} title="Cars Management" description="View the current fleet and manage availability." />
        <AdminSectionCard href="/admin/bookings" icon={CalendarDays} title="Bookings Management" description="Review reservations and manage payment statuses." />
      </div>
    </PageContainer>
  );
}

function AdminSectionCard({ href, icon: Icon, title, description }: { href: string; icon: typeof CarFront; title: string; description: string }) {
  return <Surface variant="elevated" className="group flex flex-col items-start overflow-hidden border-white bg-white transition-transform duration-200 hover:-translate-y-0.5" padding="lg"><span className="grid size-11 place-items-center rounded-control bg-blue-50 text-accent"><Icon aria-hidden="true" size={22} /></span><h2 className="mt-5 text-xl font-semibold tracking-[-0.025em]">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{description}</p><Link href={href} className={buttonStyles({ className: "mt-6", variant: "secondary" })}>Open section <ArrowRight aria-hidden="true" size={16} /></Link></Surface>;
}
