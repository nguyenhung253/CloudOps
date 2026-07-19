export interface ApiResponse<T = any> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}
