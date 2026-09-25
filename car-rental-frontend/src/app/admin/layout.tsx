import type { ReactNode } from "react";
import { GhostFibersBackground } from "@/components/backgrounds";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <GhostFibersBackground>
      <div className="home-theme min-h-svh bg-[#f4f7fb] text-foreground lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <AdminSidebar />
        <main className="min-w-0">{children}</main>
      </div>
    </GhostFibersBackground>
  );
}
