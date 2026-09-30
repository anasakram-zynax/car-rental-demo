"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
export function CarsPagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  if (totalPages <= 1) return null;
  const go = (value: number) => {
    const next = new URLSearchParams(current.toString());
    next.set("page", String(value));
    router.push(`${pathname}?${next.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cls =
    "min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40";
  return (
    <nav
      aria-label="Cars results pages"
      className="mt-7 flex items-center justify-center gap-3"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        className={cls}
      >
        Previous
      </button>
      <span className="text-sm font-medium text-slate-500">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
        className={cls}
      >
        Next
      </button>
    </nav>
  );
}
