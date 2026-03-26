// 错误消息映射表 - 将技术错误转为用户友好提示
const ERROR_MESSAGE_MAP: Record<string, string> = {
  'rate_limit_exceeded': '操作太频繁，请稍后再试',
  'rate_limit': '操作太频繁，请稍后再试',
  'rate_limit_reached': '操作太频繁，请稍后再试',
  'element_not_found': '页面元素未找到，请刷新重试',
  'network_error': '网络连接失败，请检查网络',
  'timeout': '请求超时，请稍后重试',
  'unauthorized': '登录状态失效，请重新登录',
  'invalid_credentials': '账号信息无效，请检查设置',
  'session_expired': '会话已过期，请重新登录',
  'server_error': '服务器繁忙，请稍后重试',
  'bad_gateway': '服务器连接异常，请稍后重试',
  'service_unavailable': '服务暂不可用，请稍后重试',
  'internal_error': '系统内部错误，请联系支持',
  'quota_exceeded': 'API配额已用完，请明天再试',
  'invalid_request': '请求参数错误',
  'access_denied': '访问被拒绝，请检查权限',
  'not_found': '请求的资源不存在',
};

/**
 * 格式化技术错误消息为用户友好提示
 */
export function formatErrorMessage(error: string): string {
  const lowerError = error.toLowerCase();
  for (const [key, message] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (lowerError.includes(key.toLowerCase())) {
      return message;
    }
  }
  return error;
}
