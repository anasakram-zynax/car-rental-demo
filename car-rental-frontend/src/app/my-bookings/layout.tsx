import type { ReactNode } from "react";
import { GhostFibersBackground } from "@/components/backgrounds";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export default function MyBookingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <GhostFibersBackground>
      <div className="home-theme flex min-h-svh flex-col bg-[#f7faff] text-foreground">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </GhostFibersBackground>
  );
}
