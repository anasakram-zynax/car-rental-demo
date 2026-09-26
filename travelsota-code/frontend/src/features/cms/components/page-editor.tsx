'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminCmsPage, useCreateCmsPage, useUpdateCmsPage } from '../hooks';
import { TipTapEditor } from '@/features/blog/components/tiptap-editor';
import { ImageUpload } from '@/features/upload/components/image-upload';
import { SeoPreview } from '@/features/shared/seo-preview';
import { useToast } from '@/hooks/useToast';

const LANGUAGES = [
  { code: 'ar', name: 'العربية' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'zh', name: '中文' },
  { code: 'tr', name: 'Türkçe' },
] as const;

type LangCode = (typeof LANGUAGES)[number]['code'];

interface PageEditorProps {
  pageId?: string;
}

type CmsLayout = 'standard' | 'landing' | 'legal';

const LAYOUT_OPTIONS: { value: CmsLayout; label: string; hint: string }[] = [
  { value: 'standard', label: 'Standard page', hint: 'Centered content with a readable prose column. Best for About, Contact, Help.' },
  { value: 'landing', label: 'Landing page', hint: 'Full-width sections with a hero area. Best for marketing pages and featured content.' },
  { value: 'legal', label: 'Legal / Policy', hint: 'Narrower reading width. Best for Terms, Privacy, and compliance pages.' },
];

interface FormState {
  name: string;
  slug: string;
  description: string;
  content: string;
  layout: CmsLayout;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  canonicalUrl: string;
  noindex: boolean;
  nameTranslations: Record<string, string>;
  contentTranslations: Record<string, string>;
}

function emptyForm(): FormState {
  return {
    name: '',
    slug: '',
    description: '',
    content: '',
    layout: 'standard',
    isActive: true,
    seoTitle: '',
    seoDescription: '',
    seoKeywords: '',
    canonicalUrl: '',
    noindex: false,
    nameTranslations: {},
    contentTranslations: {},
  };
}

export function PageEditor({ pageId }: PageEditorProps) {
  const router = useRouter();
  const toasts = useToast();
  const isEdit = !!pageId;

  const { data: page, isLoading } = useAdminCmsPage(pageId);
  const createMutation = useCreateCmsPage();
  const updateMutation = useUpdateCmsPage();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tab, setTab] = useState<'details' | 'seo' | 'translations'>('details');
  const [langTab, setLangTab] = useState<LangCode>('ar');

  useEffect(() => {
    if (page) {
      setForm({ // eslint-disable-line react-hooks/set-state-in-effect
        name: page.name,
        slug: page.slug,
        description: page.description ?? '',
        content: page.content ?? '',
        layout: ((page as unknown as Record<string, unknown>).layout as CmsLayout) || 'standard',
        isActive: page.isActive,
        seoTitle: page.seoTitle ?? '',
        seoDescription: page.seoDescription ?? '',
        seoKeywords: page.seoKeywords ?? '',
        canonicalUrl: page.canonicalUrl ?? '',
        noindex: page.noindex,
        nameTranslations: page.nameTranslations ?? {},
        contentTranslations: page.contentTranslations ?? {},
      });
    }
  }, [page]);

  const set = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const onNameChange = useCallback(
    (value: string) => {
      setForm((prev) => ({ ...prev, name: value }));
      if (!slugTouched) {
        const slug = value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '');
        setForm((prev) => ({ ...prev, name: value, slug }));
      }
    },
    [slugTouched],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = useCallback(() => {
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Page name is required.');
      return;
    }

    const input = {
      name: form.name.trim(),
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
      description: form.description.trim() || undefined,
      content: form.content,
      layout: form.layout,
      isActive: form.isActive,
      seoTitle: form.seoTitle.trim() || undefined,
      seoDescription: form.seoDescription.trim() || undefined,
      seoKeywords: form.seoKeywords.trim() || undefined,
      canonicalUrl: form.canonicalUrl.trim() || undefined,
      noindex: form.noindex,
      nameTranslations: form.nameTranslations,
      contentTranslations: form.contentTranslations,
    };

    const onSuccess = () => {
      toasts.success(isEdit ? 'Page updated' : 'Page created');
      router.push('/admin/cms/pages');
    };
    const onError = (err: unknown) => {
      toasts.error((err as { message?: string })?.message ?? 'Failed to save page');
    };

    if (isEdit) {
      updateMutation.mutate({ id: pageId!, input }, { onSuccess, onError });
    } else {
      createMutation.mutate(input, { onSuccess, onError });
    }
  }, [form, isEdit, pageId, createMutation, updateMutation, router, toasts]);

  if (isEdit && isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-teal-500" />
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30';

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'seo', label: 'SEO' },
    { key: 'translations', label: 'Translations' },
  ];

  const translationDone = (lang: LangCode) => {
    const hasName = !!form.nameTranslations[lang]?.trim();
    const hasContent = !!form.contentTranslations[lang]?.trim();
    return hasName || hasContent;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Page' : 'New Page'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {isEdit ? `Editing "${page?.name ?? ''}"` : 'Create a CMS page for the public site.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/cms/pages"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </Link>
          {form.slug ? (
            <a
              href={`/page/${form.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-teal/20 bg-brand-teal/5 px-4 py-2.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              View page
            </a>
          ) : null}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Page'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex gap-6 px-6" role="tablist" aria-label="Page editor sections">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                id={`cms-tab-${t.key}`}
                role="tab"
                aria-selected={tab === t.key}
                aria-controls={`cms-panel-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`relative whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'border-brand-teal-500 text-brand-teal-600 dark:border-brand-teal-400 dark:text-brand-teal-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {tab === 'details' && (
            <div role="tabpanel" id="cms-panel-details" aria-labelledby="cms-tab-details" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Page Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="e.g. About Us"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Slug</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set({ slug: e.target.value });
                    }}
                    placeholder="auto-generated"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Public URL: /page/{form.slug || '…'}</p>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => set({ description: e.target.value })}
                  rows={2}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Page Layout</label>
                <select
                  value={form.layout}
                  onChange={(e) => set({ layout: e.target.value as CmsLayout })}
                  className={inputClass}
                >
                  {LAYOUT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {LAYOUT_OPTIONS.find((o) => o.value === form.layout)?.hint}
                </p>
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Content
                  <ImageUpload onUploaded={(url) => set({ content: form.content + `<img src="${url}" alt="" />` })} />
                </label>
                <TipTapEditor value={form.content} onChange={(html) => set({ content: html })} />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => set({ isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-teal-500 focus:ring-brand-teal-500"
                />
                Active (visible on the public site)
              </label>
            </div>
          )}

          {tab === 'seo' && (
            <div role="tabpanel" id="cms-panel-seo" aria-labelledby="cms-tab-seo" className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">SEO Title</label>
                <input type="text" value={form.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Meta Description</label>
                <textarea
                  value={form.seoDescription}
                  onChange={(e) => set({ seoDescription: e.target.value })}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Meta Keywords</label>
                <input type="text" value={form.seoKeywords} onChange={(e) => set({ seoKeywords: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Canonical URL</label>
                <input type="text" value={form.canonicalUrl} onChange={(e) => set({ canonicalUrl: e.target.value })} className={inputClass} />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.noindex}
                  onChange={(e) => set({ noindex: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-teal-500 focus:ring-brand-teal-500"
                />
                Noindex (hide from search engines)
              </label>
              <div className="mt-5">
                <SeoPreview
                  title={form.seoTitle || form.name}
                  description={form.seoDescription || form.description}
                  slug={form.slug}
                />
              </div>
            </div>
          )}

          {tab === 'translations' && (
            <div role="tabpanel" id="cms-panel-translations" aria-labelledby="cms-tab-translations">
              <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-4 dark:border-gray-700">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setLangTab(lang.code)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      langTab === lang.code
                        ? 'bg-brand-teal-500 text-white'
                        : 'border border-gray-200 text-gray-600 hover:border-brand-teal-300 hover:text-brand-teal dark:border-gray-700 dark:text-gray-400'
                    }`}
                  >
                    <span className={`inline-block h-2 w-2 rounded-full ${translationDone(lang.code) ? 'bg-success-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    {lang.name}
                  </button>
                ))}
              </div>

              <div key={langTab} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Translated Name ({langTab.toUpperCase()})
                  </label>
                  <input
                    type="text"
                    value={form.nameTranslations[langTab] ?? ''}
                    onChange={(e) =>
                      set({ nameTranslations: { ...form.nameTranslations, [langTab]: e.target.value } })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Translated Content ({langTab.toUpperCase()})
                  </label>
                  <TipTapEditor
                    value={form.contentTranslations[langTab] ?? ''}
                    onChange={(html) =>
                      set({ contentTranslations: { ...form.contentTranslations, [langTab]: html } })
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {formError ? <p className="text-sm text-error-600 dark:text-error-400">{formError}</p> : null}
      {(createMutation.isError || updateMutation.isError) ? (
        <p className="text-sm text-error-600 dark:text-error-400">
          {(createMutation.error ?? updateMutation.error as { message?: string } | null)?.message ?? 'Failed to save page'}
        </p>
      ) : null}
    </div>
  );
}
