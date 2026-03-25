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
