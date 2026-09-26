/**
 * Standard pagination metadata included in every paginated search response.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Result of applying pagination to an array of items.
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Extract validated page and pageSize from a search DTO.
 * Falls back to sensible defaults when not provided.
 */
export function parsePagination(page?: number, pageSize?: number): { page: number; pageSize: number } {
  return {
    page: Math.max(1, page ?? 1),
    pageSize: Math.min(200, Math.max(1, pageSize ?? 20)),
  };
}

/**
 * Slice an array into a page and return the paginated result with metadata.
 *
 * @param items - full result array before pagination
 * @param page  - 1-based page number
 * @param pageSize - number of items per page
 */
export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return {
    items: paged,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}
