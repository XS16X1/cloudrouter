// 状态管理模块 - 管理应用状态和初始化

import { STORAGE_KEYS, ERROR_MESSAGES, CLIENT_TOKEN_CONFIG } from './config.js';

// 核心全局变量
let apiKeys = [];
let clientTokens = []; // 新增：客户端token列表
let currentKeyIndex = 0;
let isInitialized = false;

// 初始化状态
export async function initializeState(env) {
  if (isInitialized) {
    return;
  }

  try {
    // 从KV存储加载API密钥
    const keysData = await env.ROUTER_KV.get(STORAGE_KEYS.API_KEYS, { type: 'json' });
    
    if (keysData && Array.isArray(keysData)) {
      apiKeys = keysData.filter(key => typeof key === 'string' && key.startsWith('sk-'));
      console.log(`已加载 ${apiKeys.length} 个API密钥`);
    } else {
      apiKeys = [];
      console.log('未找到API密钥');
    }

    // 从KV存储加载客户端token
    const tokensData = await env.ROUTER_KV.get(STORAGE_KEYS.CLIENT_TOKENS, { type: 'json' });
    
    if (tokensData && Array.isArray(tokensData)) {
      clientTokens = tokensData.filter(token => 
        typeof token === 'object' && 
        token.token
      );
      console.log(`已加载 ${clientTokens.length} 个客户端token`);
    } else {
      clientTokens = [];
      console.log('未找到客户端token');
    }

    isInitialized = true;
  } catch (error) {
    console.error('初始化状态失败:', error);
    apiKeys = [];
  }
}

// 获取API密钥列表
export function getApiKeys() {
  return [...apiKeys];
}

// 设置API密钥列表
export function setApiKeys(keys) {
  if (Array.isArray(keys)) {
    apiKeys = keys.filter(key => typeof key === 'string' && key.startsWith('sk-'));
  }
}

// 添加API密钥
export function addApiKey(key) {
  if (typeof key === 'string' && key.startsWith('sk-') && !apiKeys.includes(key)) {
    apiKeys.push(key);
    return true;
  }
  return false;
}

// 删除API密钥
export function removeApiKey(key) {
  const index = apiKeys.indexOf(key);
  if (index !== -1) {
    apiKeys.splice(index, 1);
    return true;
  }
  return false;
}

// 获取当前轮询索引
export function getCurrentKeyIndex() {
  return currentKeyIndex;
}

// 设置当前轮询索引
export function setCurrentKeyIndex(index) {
  currentKeyIndex = index;
}

// 重置初始化状态（用于测试）
export function resetInitialization() {
  isInitialized = false;
}

// ============== 客户端 Token 管理 ==============

// 生成客户端token
export function generateClientToken(name = '默认客户端', expireSeconds = null, customToken = null) {
  let token;
  
  if (customToken !== null && customToken !== undefined && customToken.trim() !== '') {
    // 使用自定义token
    const trimmedCustom = customToken.trim();
    // 检查最小长度（至少要有1个字符）
    if (trimmedCustom.length < 1) {
      throw new Error('自定义token不能为空');
    }
    // 去掉长度限制，支持任意长度
    token = trimmedCustom;
  } else {
    // 生成随机token
    const chars = CLIENT_TOKEN_CONFIG.GENERATE_CHARS;
    const prefix = CLIENT_TOKEN_CONFIG.PREFIX;
    
    token = prefix;
    for (let i = 0; i < CLIENT_TOKEN_CONFIG.LENGTH - prefix.length; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  
  // 计算过期时间
  const seconds = expireSeconds !== null ? expireSeconds : (CLIENT_TOKEN_CONFIG.EXPIRE_DAYS * 24 * 60 * 60);
  const expireAt = new Date(Date.now() + seconds * 1000);
  
  const tokenData = {
    token,
    name,
    createdAt: new Date().toISOString(),
    expireAt: expireAt.toISOString(),
    lastUsed: null,
    requestCount: 0
  };
  
  return tokenData;
}

// 添加客户端token
export function addClientToken(tokenData) {
  if (!tokenData.token) {
    return false;
  }
  
  // 检查是否已存在
  if (clientTokens.find(t => t.token === tokenData.token)) {
    return false;
  }
  
  clientTokens.push(tokenData);
  return true;
}

// 获取客户端token列表
export function getClientTokens() {
  return [...clientTokens];
}

// 删除客户端token
export function removeClientToken(token) {
  const index = clientTokens.findIndex(t => t.token === token);
  if (index !== -1) {
    clientTokens.splice(index, 1);
    return true;
  }
  return false;
}

// 验证客户端token
export function validateClientToken(token) {
  const tokenData = clientTokens.find(t => t.token === token);
  
  if (!tokenData) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_CLIENT_TOKEN };
  }
  
  // 检查是否过期
  if (new Date() > new Date(tokenData.expireAt)) {
    return { valid: false, error: ERROR_MESSAGES.TOKEN_EXPIRED };
  }
  
  return { valid: true, tokenData };
}

// 更新token使用统计
export function updateTokenUsage(token) {
  const tokenData = clientTokens.find(t => t.token === token);
  if (tokenData) {
    tokenData.lastUsed = new Date().toISOString();
    tokenData.requestCount = (tokenData.requestCount || 0) + 1;
  }
}

// 保存客户端token到KV存储
export async function saveClientTokens(env) {
  try {
    await env.ROUTER_KV.put(STORAGE_KEYS.CLIENT_TOKENS, JSON.stringify(clientTokens));
    return true;
  } catch (error) {
    console.error('保存客户端token失败:', error);
    return false;
  }
}