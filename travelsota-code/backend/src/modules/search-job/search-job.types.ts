export type SearchKind = 'flights' | 'hotels';
export type SupplierPhase = 'queued' | 'connecting' | 'searching' | 'completed' | 'failed' | 'timed_out';

export interface SearchSupplierProgress {
  key: string;
  label: string;
  phase: SupplierPhase;
  resultCount: number | null;
  elapsedMs?: number;
  errorCode?: string;
}

export type SearchJobLifecycle = 'pending' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';

export interface SearchJobState {
  searchId: string;
  kind: SearchKind;
  lifecycle: SearchJobLifecycle;
  suppliers: SearchSupplierProgress[];
  totalResults: number | null;
  startedAt: number;
  completedAt?: number;
  events: SearchProgressEvent[];
  resultKey?: string;
}

export type SearchProgressEvent =
  | { type: 'search_started'; searchId: string; kind: SearchKind; suppliers: Array<{ key: string; label: string }>; timestamp: number }
  | { type: 'supplier_started'; supplierKey: string; phase: 'connecting' | 'searching'; timestamp: number }
  | { type: 'supplier_completed'; supplierKey: string; resultCount: number; elapsedMs: number; timestamp: number }
  | { type: 'supplier_failed'; supplierKey: string; code: 'TIMEOUT' | 'UNAVAILABLE' | 'FAILED'; elapsedMs: number; timestamp: number }
  | { type: 'supplier_results'; supplierKey: string; results: unknown[]; timestamp: number }
  | { type: 'supplier_results_ready'; supplierKey: string; searchKey: string; results: unknown[]; resultCount: number; appendMode: 'append' | 'merge'; timestamp: number }
  | { type: 'supplier_results_enriched'; supplierKey: string; searchKey: string; results: unknown[]; resultCount: number; timestamp: number }
  | { type: 'search_completed'; totalResults: number; partial: boolean; timestamp: number }
  | { type: 'search_failed'; code: 'ALL_SUPPLIERS_FAILED' | 'CANCELLED'; timestamp: number }
  | { type: 'heartbeat'; timestamp: number };

export interface SearchJobStartResponse {
  searchId: string;
  eventsUrl: string;
  resultUrl: string;
}

export interface SearchJobResultResponse {
  searchId: string;
  kind: SearchKind;
  lifecycle: SearchJobLifecycle;
  totalResults: number | null;
  suppliers: SearchSupplierProgress[];
}
