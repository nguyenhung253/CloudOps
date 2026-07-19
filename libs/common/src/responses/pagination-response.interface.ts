export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  requestId: string;
  timestamp: string;
}

export interface PaginationResponse<T = any> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}
