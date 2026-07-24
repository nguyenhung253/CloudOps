/**
 * Parse CloudOps API error envelope:
 * { success: false, error: { code, message, details? }, meta }
 * and map known auth codes to user-friendly Vietnamese copy.
 */

export interface ApiErrorBody {
  success?: false;
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field?: string; message?: string }>;
  };
  message?: string;
  meta?: unknown;
}

const AUTH_CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác',
  ACCOUNT_LOCKED: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên',
  ACCOUNT_DISABLED: 'Tài khoản của bạn đã bị vô hiệu hóa',
  EMAIL_ALREADY_EXISTS: 'Email này đã được đăng ký',
  VALIDATION_ERROR: 'Dữ liệu gửi lên không hợp lệ',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại',
  REFRESH_TOKEN_MISSING: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại',
  REFRESH_TOKEN_REUSED: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại',
  UNAUTHORIZED: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
};

const TECHNICAL_PATTERNS = [
  /^request failed with status code \d+$/i,
  /^unauthorized$/i,
  /^forbidden$/i,
  /authorization/i,
  /www-authenticate/i,
  /^network error$/i,
  /^failed to fetch$/i,
];

function isTechnicalMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  return TECHNICAL_PATTERNS.some((re) => re.test(trimmed));
}

/** Map remaining English validation leftovers to Vietnamese. */
function humanizeDetailMessage(message: string, field?: string): string {
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(message)) {
    return message;
  }

  const lower = message.toLowerCase();
  const fieldLabel =
    field === 'email'
      ? 'Email'
      : field === 'password'
        ? 'Mật khẩu'
        : field === 'fullName' || field === 'username'
          ? 'Họ tên'
          : 'Trường này';

  if (lower.includes('must be longer than or equal to') || lower.includes('must be at least')) {
    const lenMatch = message.match(/(\d+)/);
    return `${fieldLabel} phải có ít nhất ${lenMatch?.[1] ?? '6'} ký tự`;
  }
  if (lower.includes('should not be empty')) {
    return `Vui lòng nhập ${fieldLabel.toLowerCase()}`;
  }
  if (lower.includes('must be an email')) {
    return 'Email không hợp lệ';
  }

  return message.replace(/^[a-zA-Z0-9_]+\s+/, '').replace(/^./, (c) => c.toUpperCase());
}

export function extractApiError(error: unknown): {
  code?: string;
  message: string;
  details?: Array<{ field?: string; message?: string }>;
  status?: number;
} {
  const err = error as {
    response?: { status?: number; data?: ApiErrorBody };
    data?: ApiErrorBody;
    message?: string;
    code?: string;
  };

  const data = err?.response?.data ?? err?.data;
  const status = err?.response?.status;
  const code = data?.error?.code;
  const apiMessage = data?.error?.message;
  const rawDetails = data?.error?.details;
  const details = rawDetails?.map((d) => ({
    field: d.field,
    message: d.message ? humanizeDetailMessage(d.message, d.field) : d.message,
  }));

  // Validation: prefer first field message (not generic banner)
  if (code === 'VALIDATION_ERROR' && details?.length) {
    const first = details[0]?.message;
    if (first) {
      return { code, message: first, details, status };
    }
  }

  if (apiMessage && !isTechnicalMessage(apiMessage) && code !== 'VALIDATION_ERROR') {
    return {
      code,
      message: apiMessage,
      details,
      status,
    };
  }

  if (apiMessage && code === 'VALIDATION_ERROR' && !isTechnicalMessage(apiMessage)) {
    return {
      code,
      message: humanizeDetailMessage(apiMessage),
      details,
      status,
    };
  }

  if (code && AUTH_CODE_MESSAGES[code]) {
    return {
      code,
      message: AUTH_CODE_MESSAGES[code],
      details,
      status,
    };
  }

  if (apiMessage && !isTechnicalMessage(apiMessage)) {
    return {
      code,
      message: apiMessage,
      details,
      status,
    };
  }

  const fallback = err?.message;
  if (fallback && !isTechnicalMessage(fallback)) {
    return { code, message: fallback, details, status };
  }

  if (status === 401) {
    return {
      code: code || 'UNAUTHORIZED',
      message: AUTH_CODE_MESSAGES.UNAUTHORIZED,
      details,
      status,
    };
  }
  if (status === 403) {
    return {
      code: code || 'FORBIDDEN',
      message: AUTH_CODE_MESSAGES.FORBIDDEN,
      details,
      status,
    };
  }
  if (status === 409) {
    return {
      code: code || 'EMAIL_ALREADY_EXISTS',
      message: AUTH_CODE_MESSAGES.EMAIL_ALREADY_EXISTS,
      details,
      status,
    };
  }

  return {
    code,
    message: 'Thao tác thất bại, vui lòng thử lại',
    details,
    status,
  };
}

/** Convenience for toast/message.error */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Thao tác thất bại, vui lòng thử lại',
): string {
  const parsed = extractApiError(error);
  return parsed.message || fallback;
}
