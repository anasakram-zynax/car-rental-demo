"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import type { CarImage } from "../types";

const ease = [0.16, 1, 0.3, 1] as const;

export function CarGallery({
  images,
  name,
}: {
  images: CarImage[];
  name: string;
}) {
  const ordered = [...images].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.order - b.order,
  );
  const [selected, setSelected] = useState(0);
  if (ordered.length === 0)
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-[24px] bg-zinc-100 text-sm font-medium text-zinc-400">
        Image unavailable
      </div>
    );
  const active = ordered[Math.min(selected, ordered.length - 1)];
  return (
    <section aria-label={`${name} image gallery`}>
      <div className="relative aspect-[16/9] overflow-hidden rounded-[24px] bg-zinc-100 sm:aspect-[2/1]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.url}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.3, ease }}
            className="absolute inset-0"
          >
            <Image
              src={active.url}
              alt={`${name} photo ${selected + 1}`}
              fill
              priority={selected === 0}
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover"
            />
          </motion.div>
        </AnimatePresence>
      </div>
      {ordered.length > 1 && (
        <div
          className="custom-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1"
          role="list"
          aria-label="Choose car image"
        >
          {ordered.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`Show photo ${index + 1}`}
              aria-pressed={selected === index}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition sm:h-20 sm:w-28 ${selected === index ? "border-brand-teal shadow-[0_0_0_2px_rgba(3,61,74,0.12)]" : "border-transparent opacity-65 hover:opacity-100 focus-visible:opacity-100"}`}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="112px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
