'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminBlogCategories, useAdminBlogPost, useCreateBlogPost, useUpdateBlogPost } from '../hooks';
import { TipTapEditor } from './tiptap-editor';
import { ImageUpload } from '@/features/upload/components/image-upload';
import { estimateReadingTime } from '../lib/reading-time';
import { useToast } from '@/hooks/useToast';

/** Tiny inline counter with color feedback */
function CharCounter({ current, min, max, label }: { current: number; min?: number; max: number; label: string }) {
  const ok = (!min || current >= min) && current <= max;
  return (
    <span className={`ml-2 text-[10px] font-medium tabular-nums ${ok ? 'text-gray-400' : 'text-amber-500'}`}>
      {current}/{max} {label}
    </span>
  );
}

interface PostEditorProps {
  postId?: string;
}

interface FormState {
  title: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED';
  scheduledAt: string;
  categoryId: string;
  coverImageUrl: string;
  excerpt: string;
  bodyHtml: string;
  isFeatured: boolean;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  noindex: boolean;
  canonicalUrl: string;
}

function emptyForm(): FormState {
  return {
    title: '',
    slug: '',
    status: 'DRAFT',
    scheduledAt: '',
    categoryId: '',
    coverImageUrl: '',
    excerpt: '',
    bodyHtml: '',
    isFeatured: false,
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    noindex: false,
    canonicalUrl: '',
  };
}

export function PostEditor({ postId }: PostEditorProps) {
  const router = useRouter();
  const toasts = useToast();
  const isEdit = !!postId;

  const { data: categories } = useAdminBlogCategories();
  const { data: post, isLoading } = useAdminBlogPost(postId);
  const createMutation = useCreateBlogPost();
  const updateMutation = useUpdateBlogPost();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const categoryOptions = useMemo(
    () => categories ?? [],
    [categories],
  );

  useEffect(() => {
    if (post) {
      setForm({ // eslint-disable-line react-hooks/set-state-in-effect
        title: post.title,
        slug: post.slug,
        status: post.status,
        scheduledAt: post.status === 'DRAFT' ? (post.publishedAt?.slice(0, 16) ?? '') : '',
        categoryId: post.categoryId ?? '',
        coverImageUrl: post.coverImageUrl ?? '',
        excerpt: post.excerpt ?? '',
        bodyHtml: post.bodyHtml ?? '',
        isFeatured: post.isFeatured,
        metaTitle: post.metaTitle ?? '',
        metaDescription: post.metaDescription ?? '',
        metaKeywords: post.metaKeywords ?? '',
        noindex: post.noindex,
        canonicalUrl: post.canonicalUrl ?? '',
      });
    }
  }, [post]);

  const set = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const onTitleChange = useCallback(
    (value: string) => {
      set({ title: value });
      if (!slugTouched) {
        const slug = value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '');
        setForm((prev) => ({ ...prev, title: value, slug }));
      }
    },
    [slugTouched, set],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = useCallback(() => {
    setFormError('');
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }

    const input = {
      title: form.title.trim(),
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
      status: form.status,
      ...(form.categoryId ? { categoryId: form.categoryId } : {}),
      coverImageUrl: form.coverImageUrl.trim() || undefined,
      excerpt: form.excerpt.trim() || undefined,
      bodyHtml: form.bodyHtml,
      isFeatured: form.isFeatured,
      metaTitle: form.metaTitle.trim() || undefined,
      metaDescription: form.metaDescription.trim() || undefined,
      metaKeywords: form.metaKeywords.trim() || undefined,
      noindex: form.noindex,
      canonicalUrl: form.canonicalUrl.trim() || undefined,
      scheduledAt: form.scheduledAt || undefined,
    };

    const onSuccess = () => {
      toasts.success(isEdit ? 'Post updated' : 'Post created');
      router.push('/admin/blogs');
    };
    const onError = (err: unknown) => {
      toasts.error((err as { message?: string })?.message ?? 'Failed to save post');
    };

    if (isEdit) {
      updateMutation.mutate({ id: postId!, input }, { onSuccess, onError });
    } else {
      createMutation.mutate(input, { onSuccess, onError });
    }
  }, [form, isEdit, postId, createMutation, updateMutation, router, toasts]);

  if (isEdit && isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-teal-500" />
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Post' : 'New Post'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {isEdit ? `Editing "${post?.title ?? ''}"` : 'Write and publish a blog post.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/blogs"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </Link>
          {isEdit && form.slug ? (
            <a
              href={`/blog/${form.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-teal/20 bg-brand-teal/5 px-4 py-2.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Preview
            </a>
          ) : null}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : form.status === 'PUBLISHED' ? 'Publish' : 'Save Draft'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">Title *<CharCounter current={form.title.length} max={70} label="chars" /></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="e.g. How to Find Cheap Flights to Dubai"
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
                  placeholder="auto-generated from title"
                  className={inputClass}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => set({ status: e.target.value as 'DRAFT' | 'PUBLISHED' })}
                    className={inputClass}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {form.status === 'PUBLISHED'
                      ? 'Visible to everyone on the blog.'
                      : 'Only visible to admins. Change to Published to go live.'}
                  </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Schedule Publish
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => set({ scheduledAt: e.target.value })}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {form.scheduledAt
                    ? `Post will be published at the scheduled time.`
                    : 'Set a future date to schedule. Leave empty to publish immediately.'}
                </p>
              </div>
              <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => set({ categoryId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">No category</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Cover Image URL</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={form.coverImageUrl}
                    onChange={(e) => set({ coverImageUrl: e.target.value })}
                    placeholder="https://res.cloudinary.com/..."
                    className={inputClass}
                  />
                  <ImageUpload onUploaded={(url) => set({ coverImageUrl: url })} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">Excerpt<CharCounter current={form.excerpt.length} min={50} max={300} label="chars" /></label>
                <textarea
                  value={form.excerpt}
                  onChange={(e) => set({ excerpt: e.target.value })}
                  rows={3}
                  placeholder="Short summary shown on the blog listing page"
                  className={inputClass}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(e) => set({ isFeatured: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-teal-500 focus:ring-brand-teal-500"
                />
                Featured post
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Content *</label>
              {form.bodyHtml ? (
                <span className="text-xs tabular-nums text-gray-400">
                  ~{estimateReadingTime(form.bodyHtml)}
                </span>
              ) : null}
            </div>
            <TipTapEditor value={form.bodyHtml} onChange={(html) => set({ bodyHtml: html })} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">SEO</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Overrides for search engine metadata. Falls back to title/excerpt when empty.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">Meta Title<CharCounter current={form.metaTitle.length} max={60} label="chars" /></label>
                <input
                  type="text"
                  value={form.metaTitle}
                  onChange={(e) => set({ metaTitle: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">Meta Description<CharCounter current={form.metaDescription.length} min={70} max={160} label="chars" /></label>
                <textarea
                  value={form.metaDescription}
                  onChange={(e) => set({ metaDescription: e.target.value })}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                <span className="font-semibold uppercase tracking-[0.1em]">Status</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${form.status === 'PUBLISHED' ? 'bg-success-100 text-success-700 dark:bg-success-900/20 dark:text-success-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${form.status === 'PUBLISHED' ? 'bg-success-500' : 'bg-amber-500'}`} />
                  {form.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                </span>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Meta Keywords</label>
                <input
                  type="text"
                  value={form.metaKeywords}
                  onChange={(e) => set({ metaKeywords: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Canonical URL</label>
                <input
                  type="text"
                  value={form.canonicalUrl}
                  onChange={(e) => set({ canonicalUrl: e.target.value })}
                  className={inputClass}
                />
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
              {isEdit && post ? (
                <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Created: {new Date(post.createdAt).toLocaleDateString()}
                    {post.updatedAt !== post.createdAt ? ` · Updated: ${new Date(post.updatedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {formError ? (
        <p className="text-sm text-error-600 dark:text-error-400">{formError}</p>
      ) : null}
      {(createMutation.isError || updateMutation.isError) ? (
        <p className="text-sm text-error-600 dark:text-error-400">
          {(createMutation.error ?? updateMutation.error as { message?: string } | null)?.message ?? 'Failed to save post'}
        </p>
      ) : null}
    </div>
  );
}
