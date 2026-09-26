import { adminRequest } from '@/lib/api/admin-client';

// ─── Types ────────────────────────────────────────────────────────

export interface MarkupRule {
  id: string;
  name: string;
  type: 'global' | 'agent' | 'supplier' | 'product' | 'route';
  applyTo: 'flights' | 'hotels' | 'packages' | 'all';
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  /** Only meaningful for markupType 'fixed' (percentage rules are currency-
   *  agnostic). Null = legacy/unset — the fixed amount is added raw to
   *  whatever currency the offer happens to be in. */
  currency: string | null;
  priority: number;
  agentId: string | null;
  supplierId: string | null;
  sourceTemplateId?: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarkupRuleInput {
  name: string;
  type: 'global' | 'agent' | 'supplier' | 'product' | 'route';
  applyTo: 'flights' | 'hotels' | 'packages' | 'all';
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  currency?: string | null;
  priority?: number;
  agentId?: string | null;
  supplierId?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
}

export interface PricePreviewInput {
  basePrice: number;
  productType: 'flights' | 'hotels' | 'packages';
  agentId?: string;
  supplierId?: string;
  routeFrom?: string;
  routeTo?: string;
  targetCurrency?: string;
}

export interface AppliedRule {
  rule: MarkupRule;
  markupAmount: number;
}

export interface PricePreviewResult {
  basePrice: number;
  appliedRules: AppliedRule[];
  finalPrice: number;
  effectiveMarkupPercent: number;
}

// ─── API Functions ────────────────────────────────────────────────

export function getMarkupRules() {
  return adminRequest<MarkupRule[]>('/admin/markups');
}

export function getMarkupRule(id: string) {
  return adminRequest<MarkupRule>(`/admin/markups/${id}`);
}

export function createMarkupRule(data: MarkupRuleInput) {
  return adminRequest<MarkupRule>('/admin/markups', { method: 'POST', body: data });
}

export function updateMarkupRule(id: string, data: Partial<MarkupRuleInput>) {
  return adminRequest<MarkupRule>(`/admin/markups/${id}`, { method: 'PUT', body: data });
}

export function deleteMarkupRule(id: string) {
  return adminRequest<{ success: boolean }>(`/admin/markups/${id}`, { method: 'DELETE' });
}

export function toggleMarkupRule(id: string) {
  return adminRequest<MarkupRule>(`/admin/markups/${id}/toggle`, { method: 'POST', body: {} });
}

export function reorderMarkupRules(items: { id: string; priority: number }[]) {
  return adminRequest<{ success: boolean }>('/admin/markups/reorder', { method: 'POST', body: { items } });
}

export function previewMarkupPrice(input: PricePreviewInput) {
  const params = new URLSearchParams();
  params.set('basePrice', String(input.basePrice));
  params.set('productType', input.productType);
  if (input.agentId) params.set('agentId', input.agentId);
  if (input.supplierId) params.set('supplierId', input.supplierId);
  if (input.routeFrom) params.set('routeFrom', input.routeFrom);
  if (input.routeTo) params.set('routeTo', input.routeTo);
  if (input.targetCurrency) params.set('targetCurrency', input.targetCurrency);
  return adminRequest<PricePreviewResult>(`/admin/markups/preview?${params.toString()}`);
}

// ─── Markup Templates ────────────────────────────────────────────

export interface MarkupTemplate {
  id: string;
  name: string;
  description: string | null;
  rules: Array<{
    name?: string;
    applyTo?: string;
    markupType?: 'percentage' | 'fixed';
    markupValue?: number;
    currency?: string | null;
    routeFrom?: string;
    routeTo?: string;
    priority?: number;
    isActive?: boolean;
  }>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getMarkupTemplates() {
  return adminRequest<MarkupTemplate[]>('/admin/markups/templates');
}

export function createMarkupTemplate(data: { name: string; description?: string; rules?: MarkupTemplate['rules'] }) {
  return adminRequest<MarkupTemplate>('/admin/markups/templates', { method: 'POST', body: data });
}

export function updateMarkupTemplate(id: string, data: Partial<Pick<MarkupTemplate, 'name' | 'description' | 'rules'>>) {
  return adminRequest<MarkupTemplate>(`/admin/markups/templates/${id}`, { method: 'PUT', body: data });
}

export function deleteMarkupTemplate(id: string) {
  return adminRequest<{ success: boolean }>(`/admin/markups/templates/${id}`, { method: 'DELETE' });
}

export function applyMarkupTemplate(templateId: string, scope: { supplierId?: string; agentId?: string; applyTo?: string }) {
  return adminRequest<{ template: MarkupTemplate; rulesCreated: number; rulesSkipped: number; productType?: string }>(`/admin/markups/templates/${templateId}/apply`, { method: 'POST', body: scope });
}
