import { getClientTokens, setClientTokens, generateToken, initializeState } from './utils.js';
import { KV_KEYS } from './constants.js';

// 获取所有客户端 token
export async function getTokens() {
  await initializeState();
  return getClientTokens();
}

// 创建新的客户端 token
export async function createToken(name, customToken, env) {
  await initializeState(env);
  const currentTokens = getClientTokens();
  
  // 检查是否已存在相同名称的 token
  if (currentTokens.some(t => t.name === name)) {
    throw new Error('Token 名称已存在');
  }

  // 处理 token 值
  let tokenValue;
  if (customToken && customToken.trim()) {
    // 使用用户提供的自定义 token
    tokenValue = customToken.trim();

    // 检查是否已存在相同的 token 值
    if (currentTokens.some(t => t.token === tokenValue)) {
      throw new Error('Token 值已存在，请使用不同的 token');
    }
  } else {
    // 自动生成 token
    tokenValue = generateToken();
  }

  // 创建新的 token
  const newToken = {
    name,
    token: tokenValue,
    enabled: true,
    createdAt: new Date().toISOString()
  };
  currentTokens.push(newToken);
  setClientTokens(currentTokens);

  // 保存到 KV
  await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(currentTokens));

  return newToken;
}

// 更新 token 状态
export async function updateTokenStatus(name, enabled, env) {
  await initializeState(env);
  const currentTokens = getClientTokens();
  
  const tokenIndex = currentTokens.findIndex(token => token.name === name);
  if (tokenIndex === -1) {
    throw new Error('Token 不存在');
  }

  currentTokens[tokenIndex].enabled = enabled;
  setClientTokens(currentTokens);
  await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(currentTokens));
}

// 删除 token
export async function deleteToken(name, env) {
  await initializeState(env);
  const currentTokens = getClientTokens();
  
  const tokenIndex = currentTokens.findIndex(token => token.name === name);
  if (tokenIndex === -1) {
    throw new Error('Token 不存在');
  }

  currentTokens.splice(tokenIndex, 1);
  setClientTokens(currentTokens);
  await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(currentTokens));
}