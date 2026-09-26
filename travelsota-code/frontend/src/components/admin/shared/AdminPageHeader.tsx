"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export interface AdminBreadcrumbItem {
  label: string;
  href?: string;
}

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  /** Root crumb (default Admin → /admin). Agent pages pass { label: 'Agent', href: '/agent' }. */
  root?: AdminBreadcrumbItem;
  /** Crumbs after the root. Last crumb renders as the current page. */
  breadcrumbs?: AdminBreadcrumbItem[];
  /** Right-aligned actions (primary button, tabs, filters, status pills…). */
  actions?: ReactNode;
}

/**
 * Single consistent page-header pattern for every admin tab: breadcrumb →
 * title → description on the left, optional actions on the right.
 */
export function AdminPageHeader({
  title,
  description,
  root = { label: 'Admin', href: '/admin' },
  breadcrumbs = [],
  actions,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <li>
                <Link
                  href={root.href ?? '/admin'}
                  className="transition-colors hover:text-foreground"
                >
                  {root.label}
                </Link>
              </li>
              {breadcrumbs.map((crumb, i) => (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
