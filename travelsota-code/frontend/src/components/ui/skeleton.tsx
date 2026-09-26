import type { HTMLAttributes } from 'react';

type SkeletonVariant = 'text' | 'circle' | 'rect';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
}

const variantStyles: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded',
  circle: 'h-10 w-10 rounded-full',
  rect: 'h-24 w-full rounded-xl',
};

export function Skeleton({ variant = 'text', width, height, className = '', style, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      className={`animate-pulse bg-zinc-200 ${variantStyles[variant]} ${className}`}
      style={{ width, height, ...style }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <Skeleton variant="text" width="60%" />
      <div className="mt-3 space-y-2">
        <Skeleton variant="text" />
        <Skeleton variant="text" width="80%" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Skeleton variant="text" width="30%" />
        <Skeleton variant="rect" width={80} height={32} />
      </div>
    </div>
  );
}
