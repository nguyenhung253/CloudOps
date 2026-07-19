export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
  meta: {
    requestId: string;
    timestamp: string;
    path?: string;
  };
}
