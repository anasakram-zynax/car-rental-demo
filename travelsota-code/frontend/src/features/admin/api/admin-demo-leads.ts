import { apiRequest, apiRequestBlob } from '@/lib/api/client';

export interface DemoLead {
  id: string;
  requestId: string;
  name: string | null;
  companyName: string | null;
  email: string;
  whatsappNumber: string | null;
  emailStatus: string;
  createdAt: string;
  submittedAt: string | null;
}

export interface DemoLeadsResponse {
  items: DemoLead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getDemoLeads(params: {
  page?: number;
  limit?: number;
  search?: string;
  emailStatus?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.search) searchParams.set('search', params.search);
  if (params.emailStatus) searchParams.set('emailStatus', params.emailStatus);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const qs = searchParams.toString();
  return apiRequest<DemoLeadsResponse>(`/admin/demo-leads${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export async function exportDemoLeadsCsv(params?: {
  search?: string;
  emailStatus?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.emailStatus) searchParams.set('emailStatus', params.emailStatus);

  const qs = searchParams.toString();
  return apiRequestBlob(`/admin/demo-leads/export${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export async function bulkDeleteDemoLeads(ids: string[]) {
  return apiRequest<{ deleted: number }>('/admin/demo-leads/bulk-delete', {
    method: 'POST',
    body: { ids },
  });
}

export async function bulkUpdateLeadStatus(ids: string[], emailStatus: string) {
  // apiRequest stringifies the body itself — passing a pre-stringified value
  // double-encodes it and the request gets rejected upstream.
  return apiRequest<{ updated: number }>('/admin/demo-leads/bulk-status', {
    method: 'POST',
    body: { ids, emailStatus },
  });
}

export async function updateLeadStatus(id: string, emailStatus: string) {
  return apiRequest<{ updated: number }>(`/admin/demo-leads/${id}/status`, {
    method: 'PATCH',
    body: { emailStatus },
  });
}
