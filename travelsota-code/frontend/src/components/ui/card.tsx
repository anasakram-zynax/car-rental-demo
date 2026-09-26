import type { ReactNode } from 'react';

type CardVariant = 'default' | 'elevated' | 'bordered';

interface CardProps {
  variant?: CardVariant;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'border border-zinc-200 bg-white',
  elevated: 'border border-zinc-200 bg-white shadow-md',
  bordered: 'border-2 border-zinc-300 bg-white',
};

export function Card({ variant = 'default', header, footer, children, className = '' }: CardProps) {
  return (
    <div className={`rounded-2xl ${variantStyles[variant]} ${className}`}>
      {header ? (
        <div className="border-b border-zinc-100 px-5 py-4">{header}</div>
      ) : null}
      <div className="px-5 py-4">{children}</div>
      {footer ? (
        <div className="border-t border-zinc-100 px-5 py-3">{footer}</div>
      ) : null}
    </div>
  );
}
