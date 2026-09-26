"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

interface SortOption {
  value: string;
  label: string;
}

interface BlogSearchSortProps {
  category?: string;
  sort?: string;
  q?: string;
  sortOptions: SortOption[];
}

export function BlogSearchSort({
  category,
  sort = "",
  q = "",
  sortOptions,
}: BlogSearchSortProps) {
  const router = useRouter();
  const tCommon = useTranslations("Common");
  const [searchTerm, setSearchTerm] = useState(q);

  const buildUrl = useCallback(
    (newQ?: string, newSort?: string) => {
      const p = new URLSearchParams();
      if (category) p.set("category", category);
      const activeQ = (newQ !== undefined ? newQ : searchTerm).trim();
      if (activeQ) p.set("q", activeQ);
      const activeSort = (newSort !== undefined ? newSort : sort).trim();
      if (activeSort) p.set("sort", activeSort);
      const qs = p.toString();
      return `/blog${qs ? `?${qs}` : ""}`;
    },
    [category, searchTerm, sort]
  );

  const handleSortChange = (newSort: string) => {
    router.push(buildUrl(undefined, newSort));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(buildUrl(searchTerm, undefined));
  };

  return (
    <form
      onSubmit={handleSearchSubmit}
      className="mt-8 flex flex-col gap-3 sm:flex-row"
    >
      <div className="relative flex-1 max-w-lg">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <label htmlFor="blog-search" className="sr-only">
          {tCommon('blogSearchAria')}
        </label>
        <input
          id="blog-search"
          type="text"
          name="q"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={tCommon('blogSearchPlaceholder')}
          autoComplete="off"
          className="h-12 w-full rounded-2xl border border-zinc-200 bg-white pl-12 pr-4 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm transition-all focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100"
        />
      </div>

      <label htmlFor="blog-sort" className="sr-only">
        {tCommon('blogSortAria')}
      </label>
      <select
        id="blog-sort"
        name="sort"
        value={sort}
        onChange={(e) => handleSortChange(e.target.value)}
        className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm transition-all focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 cursor-pointer"
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-brand-teal px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-teal-600 active:scale-[0.98]"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        {tCommon('search')}
      </button>
    </form>
  );
}

