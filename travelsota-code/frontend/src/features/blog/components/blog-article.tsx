'use client';

import { useEffect, useRef } from 'react';
import { slugifyHeading } from '../lib/slugify-heading';

export function BlogArticle({ bodyHtml }: { bodyHtml: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const headings = ref.current.querySelectorAll('h2, h3');
    const seen = new Map<string, number>();
    headings.forEach((el) => {
      const text = (el.textContent ?? 'section').trim();
      const base = slugifyHeading(text) || 'section';
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      el.id = count === 0 ? base : `${base}-${count + 1}`;
    });
  }, [bodyHtml]);

  return <div ref={ref} className="blog-body mt-10" dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
