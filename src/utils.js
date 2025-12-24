import { KV_KEYS, HEALTH_CHECK_INTERVAL } from './constants.js';

// 全局变量
let apiKeys = []; // 缓存 API 密钥
let currentKeyIndex = 0;
let lastHealthCheck = 0;
let adminPasswordHash = null; // 缓存管理员密码哈希
let clientTokens = []; // 缓存客户端访问 token

// 导出 getter 函数
export function getApiKeys() {
  return apiKeys;
}

export function getCurrentKeyIndex() {
  return currentKeyIndex;
}

export function getLastHealthCheck() {
  return lastHealthCheck;
}

export function getAdminPasswordHash() {
  return adminPasswordHash;
}

export function getClientTokens() {
  return clientTokens;
}

// 导出 setter 函数
export function setApiKeys(newApiKeys) {
  apiKeys = newApiKeys;
}

export function setCurrentKeyIndex(index) {
  currentKeyIndex = index;
}

export function setLastHealthCheck(timestamp) {
  lastHealthCheck = timestamp;
}

export function setAdminPasswordHash(hash) {
  adminPasswordHash = hash;
}

export function setClientTokens(tokens) {
  clientTokens = tokens;
}

// 初始化：从 KV 加载 API 密钥、管理员密码哈希和客户端 token
export async function initializeState(env) {
  try {
    const [keysData, passwordHashData, tokensData] = await Promise.all([
      env.ROUTER_KV.get(KV_KEYS.API_KEYS, { type: 'json' }),
      env.ROUTER_KV.get(KV_KEYS.ADMIN_PASSWORD_HASH, { type: 'text' }),
      env.ROUTER_KV.get(KV_KEYS.CLIENT_TOKENS, { type: 'json' }),
    ]);

    if (keysData && Array.isArray(keysData)) {
      apiKeys = keysData;
      console.log(`已加载 ${apiKeys.length} 个API密钥`);
    } else {
      apiKeys = [];
      console.log('未找到API密钥');
    }

    if (passwordHashData) {
      adminPasswordHash = passwordHashData;
      console.log('已加载管理员密码哈希');
    } else {
      adminPasswordHash = null;
      console.log('未设置管理员密码');
    }

    if (tokensData && Array.isArray(tokensData)) {
      clientTokens = tokensData;
      console.log(`已加载 ${clientTokens.length} 个客户端 token`);
    } else {
      clientTokens = [];
      console.log('未找到客户端 token');
    }
  } catch (error) {
    console.error('初始化状态失败:', error);
    apiKeys = [];
    adminPasswordHash = null;
    clientTokens = [];
  }
}

// 密码哈希函数 (SHA-256)
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// 验证密码
export async function verifyPassword(providedPassword, storedHash) {
  if (!providedPassword || !storedHash) {
    return false;
  }
  const providedHash = await hashPassword(providedPassword);
  return providedHash === storedHash;
}

// 验证客户端 token
export function verifyClientToken(token) {
  if (!token || clientTokens.length === 0) {
    return false;
  }
  return clientTokens.some(tokenObj => tokenObj.token === token && tokenObj.enabled);
}

// 生成随机 token
export function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'sk-';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 获取下一个可用的 API 密钥
export async function getNextApiKey() {
  const currentKeys = getApiKeys();
  if (currentKeys.length === 0) {
    throw new Error('没有可用的 API 密钥');
  }

  // 每5分钟检查一次健康状态
  const now = Date.now();
  if (now - getLastHealthCheck() > HEALTH_CHECK_INTERVAL) {
    console.log('执行 API 密钥健康检查...');
    for (let i = 0; i < currentKeys.length; i++) {
      currentKeys[i].isHealthy = await checkKeyHealth(currentKeys[i].value);
    }
    setLastHealthCheck(now);
  }

  // 寻找健康的密钥
  const healthyKeys = currentKeys.filter(key => key.isHealthy !== false);
  if (healthyKeys.length === 0) {
    throw new Error('没有健康的 API 密钥可用');
  }

  // 轮询使用健康的密钥
  const currentIndex = getCurrentKeyIndex();
  const keyToUse = healthyKeys[currentIndex % healthyKeys.length];
  setCurrentKeyIndex((currentIndex + 1) % healthyKeys.length);
  
  return keyToUse.value;
}

// 检查 API 密钥健康状态
export async function checkKeyHealth(key) {
  try {
    // 1. 基础连通性检查 - 获取模型列表
    const modelsResponse = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });

    if (!modelsResponse.ok) {
      console.log(`密钥 ${key.substring(0, 8)}... 基础检查失败:`, modelsResponse.status);
      return false;
    }

    // 2. 实际调用检查 - 测试一个常用的免费模型
    const testResponse = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-r1-0528:free',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      })
    });

    // 检查是否是数据策略错误
    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      if (errorText.includes('No endpoints found matching your data policy')) {
        console.log(`密钥 ${key.substring(0, 8)}... 数据策略限制，无法访问免费模型`);
        return false;
      }
      // 其他错误（如余额不足）也认为是不健康
      console.log(`密钥 ${key.substring(0, 8)}... 实际调用失败:`, testResponse.status);
      return false;
    }

    console.log(`密钥 ${key.substring(0, 8)}... 健康检查通过`);
    return true;
  } catch (error) {
    console.error('健康检查失败:', error);
    return false;
  }
}

// 获取当前使用的 API 密钥（供 openai-api.js 使用）
export function getCurrentApiKey() {
  const currentKeys = getApiKeys();
  const currentIndex = getCurrentKeyIndex();
  if (currentKeys.length === 0) {
    throw new Error('没有可用的 API 密钥');
  }
  
  // 寻找健康的密钥
  const healthyKeys = currentKeys.filter(key => key.isHealthy !== false);
  if (healthyKeys.length === 0) {
    throw new Error('没有健康的 API 密钥可用');
  }
  
  const keyToUse = healthyKeys[currentIndex % healthyKeys.length];
  return keyToUse.value;
}