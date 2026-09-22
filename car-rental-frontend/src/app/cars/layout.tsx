import type { ReactNode } from "react";
import { GhostFibersBackground } from "@/components/backgrounds";
import { Header } from "@/components/layout/header";

export default function CarsLayout({ children }: { children: ReactNode }) {
  return (
    <GhostFibersBackground>
      <Header />
      <main>{children}</main>
    </GhostFibersBackground>
  );
}
