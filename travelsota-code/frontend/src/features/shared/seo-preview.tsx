interface SeoPreviewProps {
  title?: string;
  description?: string;
  slug?: string;
}

export function SeoPreview({ title, description, slug }: SeoPreviewProps) {
  if (!title && !description) return null;

  const previewUrl = slug ? `https://travelsota.com/page/${slug}` : undefined;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 mb-3">SEO Preview</h3>
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
        {previewUrl ? (
          <p className="text-xs text-emerald-700 line-clamp-1 mb-1">{previewUrl}</p>
        ) : null}
        <p className="text-lg font-medium text-blue-700 line-clamp-1">{title || 'Untitled'}</p>
        <p className="mt-0.5 text-sm text-zinc-600 line-clamp-2">{description || 'No description set.'}</p>
      </div>
    </div>
  );
}
