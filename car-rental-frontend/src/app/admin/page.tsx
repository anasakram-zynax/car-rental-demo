import { ArrowRight, CalendarDays, CarFront } from "lucide-react";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";

export default function AdminPage() {
  return (
    <PageContainer className="py-8 sm:py-12">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Administration</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Fleet workspace</h1>
        <p className="mt-3 text-muted">Manage your rental inventory and review booking activity from one place.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <AdminSectionCard href="/admin/cars" icon={CarFront} title="Cars Management" description="View the current fleet and manage availability." />
        <AdminSectionCard href="/admin/bookings" icon={CalendarDays} title="Bookings Management" description="Review reservations and manage payment statuses." />
      </div>
    </PageContainer>
  );
}

function AdminSectionCard({ href, icon: Icon, title, description }: { href: string; icon: typeof CarFront; title: string; description: string }) {
  return <Surface variant="glass" className="flex flex-col items-start" padding="lg"><Icon aria-hidden="true" className="text-primary" size={24} /><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{description}</p><Link href={href} className={buttonStyles({ className: "mt-6", variant: "secondary" })}>Open section <ArrowRight aria-hidden="true" size={16} /></Link></Surface>;
}
