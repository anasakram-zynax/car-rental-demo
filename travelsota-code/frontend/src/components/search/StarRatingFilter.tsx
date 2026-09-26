'use client';

interface StarRatingFilterProps {
  selected: number | null;
  onSelect: (stars: number | null) => void;
  maxStars?: number;
  counts?: Record<number, number>;
}

export function StarRatingFilter({
  selected,
  onSelect,
  maxStars = 5,
  counts = {},
}: StarRatingFilterProps) {
  return (
    <div className="space-y-1">
      {Array.from({ length: maxStars }, (_, i) => maxStars - i).map((stars) => {
        const active = selected === stars;
        const count = counts[stars] ?? 0;
        return (
          <button
            key={stars}
            type="button"
            onClick={() => onSelect(active ? null : stars)}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all duration-150 ${
              active
                ? 'bg-brand-teal/5 text-brand-teal font-semibold'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                active ? 'border-brand-teal' : 'border-zinc-200 bg-white'
              }`}>
                {active && <span className="h-2 w-2 rounded-full bg-brand-teal" />}
              </span>
              <span className="flex items-center gap-0.5">
                {Array.from({ length: stars }, (_, j) => (
                  <svg
                    key={j}
                    className={`h-3.5 w-3.5 ${active ? 'text-brand-teal' : 'text-amber-400'}`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                ))}
              </span>
            </span>
            {count > 0 && (
              <span className={`text-xs ${active ? 'text-brand-teal/60' : 'text-zinc-400'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
