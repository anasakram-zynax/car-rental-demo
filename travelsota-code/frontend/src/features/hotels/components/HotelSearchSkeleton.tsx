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
      <div className="flex flex-col sm:flex-row">
        {/* Image placeholder */}
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden sm:aspect-auto sm:w-60 lg:w-72">
          <div className="absolute inset-0 animate-pulse bg-zinc-200" />
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
          {/* Hotel name */}
          <Skeleton variant="text" width="65%" className="h-5" />

          {/* Star rating + destination */}
          <div className="mt-2 flex items-center gap-3">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-3.5 w-3.5 animate-pulse rounded bg-zinc-200" />
              ))}
            </div>
            <Skeleton variant="text" width="120px" className="h-3" />
          </div>

          {/* Amenities */}
          <div className="mt-4">
            <Skeleton variant="text" width="100px" className="mb-2 h-3" />
            <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="h-3.5 w-3.5 animate-pulse rounded bg-zinc-200" />
                  <Skeleton variant="text" width={`${[80, 100, 70, 90][i]}px`} className="h-3" />
                </div>
              ))}
            </div>
          </div>

          {/* Tags row */}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            <div className="h-5 w-16 animate-pulse rounded-md bg-zinc-200" />
            <div className="h-5 w-20 animate-pulse rounded-md bg-zinc-200" />
          </div>
        </div>

        {/* Price rail */}
        <div className="flex items-center justify-between gap-3 border-t border-dashed border-gray-200 px-4 py-4 sm:w-52 sm:shrink-0 sm:flex-col sm:items-stretch sm:justify-center sm:border-l sm:border-t-0 sm:px-5 sm:text-right">
          {/* Rating score */}
          <div className="flex items-center gap-2 sm:flex-row-reverse sm:justify-end">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-zinc-200" />
            <div className="space-y-1">
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-200" />
              <div className="h-2.5 w-12 animate-pulse rounded bg-zinc-200" />
            </div>
          </div>

          {/* Price */}
          <div className="space-y-1 sm:mt-4">
            <div className="h-7 w-24 animate-pulse rounded bg-zinc-200" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-zinc-200" />
            <div className="h-2.5 w-14 animate-pulse rounded bg-zinc-200" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface HotelSearchSkeletonProps {
  count?: number;
}

export function HotelSearchSkeleton({ count = 5 }: HotelSearchSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} index={i} />
      ))}
    </div>
  );
}
