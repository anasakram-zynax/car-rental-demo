'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Heading {
  id: string;
  text: string;
}

interface TocProps {
  headings: Heading[];
}

export function TableOfContents({ headings }: TocProps) {
  const tCommon = useTranslations('Common');
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );

    const els = headings.map((h) => document.getElementById(h.id)).filter(Boolean) as HTMLElement[];
    els.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm" aria-label={tCommon('blogTocTitle')}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">{tCommon('blogTocTitle')}</h2>
      <ul className="mt-3 space-y-1">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(h.id);
                if (el) {
                  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                  el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
                  setActiveId(h.id);
                }
              }}
              className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                activeId === h.id
                  ? 'bg-brand-teal-50 font-medium text-brand-teal-700'
                  : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
