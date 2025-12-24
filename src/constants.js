// 常量定义
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const KV_KEYS = {
  API_KEYS: 'api_keys',
  ADMIN_PASSWORD_HASH: 'admin_password_hash',
  CLIENT_TOKENS: 'client_tokens',
  REQUEST_COUNTS: 'request_counts', // 请求计数
};

export const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟

export const DEFAULT_MODEL = 'deepseek/deepseek-r1-0528:free';

// 请求计数相关
export const REQUEST_COUNT_KEY_PREFIX = 'req_count_';
export const DATE_FORMAT = 'YYYY-MM-DD';