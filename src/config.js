// 配置文件 - 常量和配置项

// OpenRouter API 基础URL
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// 存储键名常量
export const STORAGE_KEYS = {
  API_KEYS: 'api_keys',
  REQUEST_STATS: 'request_stats',
  CLIENT_TOKENS: 'client_tokens',
  ADMIN_PASSWORD: 'admin_password'
};

// 统计相关常量
export const STATS_CONFIG = {
  MINUTE_WINDOW: 2, // 保留最近2分钟的统计数据
  TOKEN_BYTES_PER: 4 // 估算token时每4字节约等于1个token
};

// 负载均衡配置
export const LOAD_BALANCER_CONFIG = {
  STRATEGY: 'round_robin', // 'round_robin' | 'least_used'
  FALLBACK_ENABLED: true
};

// API请求配置
export const API_CONFIG = {
  TIMEOUT: 30000, // 30秒超时
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000
};

// 客户端token配置
export const CLIENT_TOKEN_CONFIG = {
  PREFIX: 'cr_', // token前缀
  LENGTH: 32, // token总长度
  EXPIRE_DAYS: 30, // 默认过期天数
  GENERATE_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
};

// 错误消息常量
export const ERROR_MESSAGES = {
  NO_API_KEYS: '没有可用的API密钥',
  API_ERROR: 'OpenRouter API错误',
  INVALID_KEY_FORMAT: '密钥格式无效',
  KEY_NOT_FOUND: '密钥不存在',
  STATS_ERROR: '获取统计数据失败',
  INVALID_CLIENT_TOKEN: '无效的客户端访问token',
  CLIENT_TOKEN_REQUIRED: '需要客户端访问token',
  TOKEN_EXPIRED: '客户端访问token已过期'
};