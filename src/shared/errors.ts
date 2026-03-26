export enum ErrorCode {
  // Network
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',

  // Auth
  SESSION_EXPIRED = 'session_expired',
  LOGIN_REQUIRED = 'login_required',

  // Validation
  INVALID_INPUT = 'invalid_input',

  // Business
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  CONTENT_MODERATION_FAILED = 'content_moderation_failed',

  // Automation
  SELECTOR_ERROR = 'selector_error',
  AUTOMATION_ERROR = 'automation_error',
  ELEMENT_NOT_FOUND = 'element_not_found',
  PAGE_ACTION_FAILED = 'page_action_failed',

  // System
  UNKNOWN_ERROR = 'unknown_error',
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export enum ErrorType {
  SELECTOR = 'selector',
  RATE_LIMIT = 'rate_limit',
  NETWORK = 'network',
  LOGIN = 'login',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

// ErrorCode to ErrorType mapping
export function classifyErrorCode(code: ErrorCode): ErrorType {
  switch (code) {
    case ErrorCode.SELECTOR_ERROR:
    case ErrorCode.ELEMENT_NOT_FOUND:
    case ErrorCode.PAGE_ACTION_FAILED:
      return ErrorType.SELECTOR;
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return ErrorType.RATE_LIMIT;
    case ErrorCode.NETWORK_ERROR:
      return ErrorType.NETWORK;
    case ErrorCode.SESSION_EXPIRED:
    case ErrorCode.LOGIN_REQUIRED:
      return ErrorType.LOGIN;
    case ErrorCode.TIMEOUT:
      return ErrorType.TIMEOUT;
    default:
      return ErrorType.UNKNOWN;
  }
}
