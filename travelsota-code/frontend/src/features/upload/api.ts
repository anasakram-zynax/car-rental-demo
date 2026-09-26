import { getPublicEnv } from '@/lib/env/env';
import { getAccessToken } from '@/lib/auth/storage';

export async function uploadImage(file: File): Promise<string> {
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
  const form = new FormData();
  form.append('file', file);

  const token = getAccessToken();
  const res = await fetch(`${NEXT_PUBLIC_API_BASE_URL}/admin/upload/image`, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Upload failed');
  }
  const payload = await res.json();
  return payload.data.url;
}
