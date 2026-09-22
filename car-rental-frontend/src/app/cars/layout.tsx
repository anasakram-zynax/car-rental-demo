import type { ReactNode } from "react";
import { GhostFibersBackground } from "@/components/backgrounds";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export default function CarsLayout({ children }: { children: ReactNode }) {
  return (
    <GhostFibersBackground>
      <div className="flex min-h-svh flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </GhostFibersBackground>
  );
}
