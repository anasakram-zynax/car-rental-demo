'use client';

import React from "react";
import { useTranslations } from "next-intl";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  total,
  pageSize = 20,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
}) => {
  const t = useTranslations('Common');
  if (totalPages <= 1 && !onPageSizeChange) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  const safePageSize = pageSize > 0 ? pageSize : 20;
  const from = total ? (currentPage - 1) * safePageSize + 1 : 0;
  const to = total ? Math.min(currentPage * safePageSize, total) : 0;

  const navButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40";

  const strong = (chunks: React.ReactNode) => (
    <span className="font-semibold text-foreground">{chunks}</span>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Result summary */}
      <p className="text-sm text-muted-foreground">
        {total != null ? (
          t.rich('showingResults', {
            from: from.toLocaleString(),
            to: to.toLocaleString(),
            total: total.toLocaleString(),
            strong,
          })
        ) : (
          t.rich('pageOfTotal', { current: currentPage, total: totalPages, strong })
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t('rowsLabel')}</span>
            <select
              aria-label={t('rowsPerPage')}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 cursor-pointer rounded-lg border border-input bg-card px-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus:border-ring focus:ring-1 focus:ring-ring/30"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('previousPage')}
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className={navButton}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {pages.map((p, i) =>
              p === "..." ? (
                <span
                  key={`ellipsis-${i}`}
                  className="flex h-9 w-9 items-center justify-center text-sm text-muted-foreground"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  aria-label={t('goToPage', { page: p })}
                  aria-current={p === currentPage ? "page" : undefined}
                  onClick={() => onPageChange(p)}
                  className={
                    p === currentPage
                      ? "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      : "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  }
                >
                  {p}
                </button>
              ),
            )}

            <button
              type="button"
              aria-label={t('nextPage')}
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className={navButton}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;
