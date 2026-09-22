"use client";

import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { BackgroundShell } from "./background-shell";
import { GradientWaves } from "./gradient-waves";

interface GradientWavesBackgroundProps {
  children: ReactNode;
  className?: string;
}

export function GradientWavesBackground({
  children,
  className,
}: GradientWavesBackgroundProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <BackgroundShell
      className={className}
      visualClassName="landing-gradient-waves bottom-auto h-[min(58rem,100svh)] overflow-hidden"
      visual={
        <GradientWaves
          className="landing-gradient-waves-canvas"
          horizonColor="#f2f5f6"
          waveColor="#315f68"
          crestColor="#d7bd91"
          speed={shouldReduceMotion ? 0 : 0.18}
          amplitude={2.1}
          waveScale={0.72}
          waveRatio={0.8}
          swell={25}
          turbulence={12}
          tilt={1.08}
          zoom={0.9}
          height={5.9}
          fogDepth={23}
          detail="low"
          brightness={1.05}
          opacity={0.58}
          mouseInteraction={false}
          grain={!shouldReduceMotion}
          grainIntensity={0.018}
        />
      }
    >
      {children}
    </BackgroundShell>
  );
}
