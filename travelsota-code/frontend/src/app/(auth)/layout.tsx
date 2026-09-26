"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { PaperPlaneIcon } from "@/icons";

const destinations = [
  {
    src: "/images/home/hotels/st-regis-maldives.webp",
    name: "St. Regis Maldives",
    tag: "Overwater villas",
    price: "$1,240",
    rating: "4.9",
  },
  {
    src: "/images/home/hotels/atlantis-the-palm.webp",
    name: "Atlantis The Palm",
    tag: "Dubai",
    price: "$860",
    rating: "4.8",
  },
  {
    src: "/images/home/hotels/w-barcelona.webp",
    name: "W Barcelona",
    tag: "Seafront suites",
    price: "$540",
    rating: "4.7",
  },
  {
    src: "/images/home/hotels/park-hyatt-tokyo.webp",
    name: "Park Hyatt Tokyo",
    tag: "Skyline views",
    price: "$720",
    rating: "4.8",
  },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(0);
  const current = destinations[active];

  useEffect(() => {
    // ponytail: fixed 6s rotation; add pause-on-hover only if users ask
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % destinations.length), 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex w-full min-h-[100dvh] bg-white dark:bg-void">
      {/* Left side - Auth form */}
      <div className="flex flex-col justify-center lg:w-1/2 w-full bg-white dark:bg-void p-6 sm:p-8 lg:px-12 lg:py-8">
        {children}
      </div>

      {/* Right side - Travel destination showcase */}
      <div className="relative lg:w-1/2 w-0 lg:flex items-end justify-center overflow-hidden bg-charcoal">
        {/* Crossfading destination photos w/ slow Ken Burns zoom */}
        {destinations.map((d, i) => (
          <motion.div
            key={d.src}
            className="absolute inset-0"
            initial={false}
            animate={{ opacity: i === active ? 1 : 0, scale: i === active ? 1.06 : 1.14 }}
            transition={{
              opacity: { duration: 1.4, ease: "easeInOut" },
              scale: { duration: 7.5, ease: "easeOut" },
            }}
          >
            <Image
              src={d.src}
              alt=""
              fill
              priority={i === 0}
              sizes="50vw"
              className="object-cover"
            />
          </motion.div>
        ))}

        {/* Brand gradient overlays for depth + readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/35 to-brand-teal-900/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-teal/25 to-transparent" />

        {/* Floating glass destination card */}
        <div className="absolute bottom-[12%] left-[10%] w-[min(320px,70%)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.src}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-white/15 bg-white/[0.08] p-5 backdrop-blur-xl shadow-2xl shadow-black/30"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs font-medium tracking-wide uppercase text-white/60">
                    {current.tag}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-white leading-snug">
                    {current.name}
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.363 1.118l1.285 3.958c.3.922-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 00-1.175 0l-3.367 2.446c-.783.57-1.838-.196-1.538-1.118l1.285-3.958a1 1 0 00-.363-1.118L2.063 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.285-3.958z" />
                  </svg>
                  {current.rating}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-white/10 pt-3">
                <span className="text-xs text-white/60">from</span>
                <span className="text-xl font-bold text-white">{current.price}</span>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Slide indicators */}
          <div className="mt-4 flex items-center gap-2 pl-1">
            {destinations.map((d, i) => (
              <button
                key={d.src}
                type="button"
                aria-label={`Show ${d.name}`}
                onClick={() => setActive(i)}
                className={`h-1.5 rounded-full transition-all duration-500 cursor-pointer ${
                  i === active ? "w-7 bg-white" : "w-2.5 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Floating flight-route glass chip */}
        <motion.div
          className="absolute top-[14%] right-[12%] flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.08] px-4 py-2.5 backdrop-blur-xl shadow-lg shadow-black/20"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <PaperPlaneIcon className="h-4 w-4 -rotate-12 text-white" />
          <span className="text-sm font-medium tracking-wide text-white">DXB</span>
          <svg className="h-3.5 w-8 text-white/50" viewBox="0 0 32 14" fill="none">
            <path d="M1 7h26m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3" />
          </svg>
          <span className="text-sm font-medium tracking-wide text-white">MLE</span>
        </motion.div>

        {/* Soft ambient glow */}
        <motion.div
          className="absolute -top-1/4 -left-1/4 w-[80vh] h-[80vh] rounded-full opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.5), transparent 60%)" }}
          animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
