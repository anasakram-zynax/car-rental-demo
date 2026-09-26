'use client';

import { motion } from 'motion/react';
import { Skeleton } from '@/components/ui/skeleton';

const ease = [0.16, 1, 0.3, 1] as const;

function SkeletonCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease, delay: index * 0.04 }}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <div className="flex flex-col p-4 sm:flex-row sm:items-stretch sm:p-5">
        {/* Legs area */}
        <div className="flex-1 divide-y divide-gray-100">
          {/* Single leg skeleton */}
          <div className="pb-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              {/* Airline */}
              <div className="flex items-center gap-2.5 sm:w-40 sm:shrink-0">
                <div className="h-9 w-9 animate-pulse rounded-xl bg-zinc-200" />
                <div className="space-y-1.5">
                  <Skeleton variant="text" width="90px" className="h-3.5" />
                  <Skeleton variant="text" width="60px" className="h-2.5" />
                </div>
              </div>

              {/* Timeline */}
              <div className="flex flex-1 items-center gap-3 sm:gap-4">
                <div className="min-w-[46px] space-y-1 text-left sm:text-center">
                  <Skeleton variant="text" width="44px" className="mx-auto h-4" />
                  <Skeleton variant="text" width="28px" className="mx-auto h-2.5" />
                </div>

                <div className="flex flex-1 flex-col items-center gap-1.5">
                  <Skeleton variant="text" width="50px" className="h-2.5" />
                  <div className="flex w-full items-center">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-200" />
                    <div className="h-px flex-1 animate-pulse bg-zinc-200" />
                    <div className="mx-1 h-3.5 w-3.5 animate-pulse rounded bg-zinc-200" />
                    <div className="h-px flex-1 animate-pulse bg-zinc-200" />
                    <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-200" />
                  </div>
                  <div className="h-4 w-12 animate-pulse rounded-full bg-zinc-200" />
                </div>

                <div className="min-w-[46px] space-y-1 text-right sm:text-center">
                  <Skeleton variant="text" width="44px" className="ml-auto h-4" />
                  <Skeleton variant="text" width="28px" className="ml-auto h-2.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-1.5 pt-3.5">
            <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-200" />
            <div className="h-5 w-24 animate-pulse rounded-full bg-zinc-200" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-zinc-200" />
          </div>
        </div>

        {/* Price rail */}
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-gray-200 pt-4 sm:mt-0 sm:w-44 sm:shrink-0 sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:text-center">
          <div className="space-y-1 sm:order-2">
            <div className="h-7 w-20 animate-pulse rounded bg-zinc-200 sm:mx-auto" />
            <div className="h-2.5 w-14 animate-pulse rounded bg-zinc-200 sm:mx-auto" />
          </div>
          <div className="h-8 w-24 animate-pulse rounded-full bg-zinc-200 sm:order-3 sm:mx-auto sm:mt-3" />
        </div>
      </div>
    </motion.div>
  );
}

interface FlightSearchSkeletonProps {
  count?: number;
}

export function FlightSearchSkeleton({ count = 5 }: FlightSearchSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} index={i} />
      ))}
    </div>
  );
}
