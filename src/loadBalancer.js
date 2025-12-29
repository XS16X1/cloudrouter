// 负载均衡模块 - 处理API密钥的选择和轮询

import { ERROR_MESSAGES } from './config.js';
import { getApiKeys, getCurrentKeyIndex, setCurrentKeyIndex } from './state.js';
import { getDailyStats } from './stats.js';

// 查找使用次数最少的API密钥
async function findLeastUsedApiKey(env) {
  try {
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      return null;
    }

    const dailyStats = await getDailyStats(env);
    
    let leastUsedKey = null;
    let minUsage = Infinity;
    
    for (const key of apiKeys) {
      const usage = dailyStats[key] || 0;
      if (usage < minUsage) {
        minUsage = usage;
        leastUsedKey = key;
      }
    }
    
    return leastUsedKey;
  } catch (error) {
    console.error('查找最少使用密钥失败:', error);
    return null;
  }
}

// 获取下一个API密钥（负载均衡选择）
export async function getNextApiKey(env) {
  const apiKeys = getApiKeys();
  
  if (apiKeys.length === 0) {
    throw new Error(ERROR_MESSAGES.NO_API_KEYS);
  }

  // 如果只有一个密钥，直接返回
  if (apiKeys.length === 1) {
    return apiKeys[0];
  }

  try {
    // 基于调用次数的负载均衡
    const leastUsedKey = await findLeastUsedApiKey(env);
    
    if (leastUsedKey) {
      console.log(`选择密钥 ${leastUsedKey.substring(0, 8)}... 用于负载均衡`);
      return leastUsedKey;
    }
  } catch (error) {
    console.error('负载均衡选择失败，使用轮询策略:', error);
  }

  // 降级到轮询策略
  const currentIndex = getCurrentKeyIndex();
  const keyToUse = apiKeys[currentIndex % apiKeys.length];
  setCurrentKeyIndex((currentIndex + 1) % apiKeys.length);
  
  return keyToUse;
}

// 验证API密钥格式
export function validateApiKey(key) {
  return typeof key === 'string' && key.startsWith('sk-');
}

// 获取密钥统计信息（用于管理界面）
export async function getKeyStats(env) {
  try {
    const apiKeys = getApiKeys();
    const dailyStats = await getDailyStats(env);
    
    return apiKeys.map(key => ({
      key: key.substring(0, 8) + '...' + key.substring(key.length - 8),
      full_key: key,
      status: 'active',
      daily_requests: dailyStats[key] || 0
    }));
  } catch (error) {
    console.error('获取密钥统计失败:', error);
    return getApiKeys().map(key => ({
      key: key.substring(0, 8) + '...' + key.substring(key.length - 8),
      full_key: key,
      status: 'active',
      daily_requests: 0
    }));
  }
}

// 批量验证密钥
export function validateKeys(keys) {
  const validKeys = [];
  const invalidKeys = [];
  const duplicateKeys = [];
  
  const existingKeys = new Set(getApiKeys());
  
  for (const key of keys) {
    if (!validateApiKey(key)) {
      invalidKeys.push(key);
      continue;
    }
    
    if (existingKeys.has(key)) {
      duplicateKeys.push(key);
      continue;
    }
    
    validKeys.push(key);
  }
  
  return { validKeys, invalidKeys, duplicateKeys };
}