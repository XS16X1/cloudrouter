// 密钥健康检查模块
// 负责定期检查 API 密钥的有效性

import { OPENROUTER_BASE_URL } from './config.js';
import { getApiKeys, updateKeyStatus } from './state.js';

// 检查单个密钥的有效性
async function checkKeyHealth(key) {
  try {
    // 使用一个轻量级的 API 调用来验证密钥
    // OpenRouter 的 /auth/key 接口可以用来检查密钥状态，如果不存在则尝试调用 models
    // 这里我们使用 models 接口，限制 limit=1 以减少开销
    const response = await fetch(`${OPENROUTER_BASE_URL}/models?limit=1`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return { status: 'active', error: null };
    } else if (response.status === 401) {
      return { status: 'invalid', error: '密钥无效' };
    } else if (response.status === 402) {
      return { status: 'expired', error: '余额不足或过期' };
    } else if (response.status === 429) {
      return { status: 'rate_limited', error: '速率限制' };
    } else {
      return { status: 'unknown', error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.error(`密钥 ${key.substring(0, 8)}... 检查失败:`, error);
    return { status: 'error', error: error.message };
  }
}

// 批量检查所有密钥的健康状态
export async function checkAllKeysHealth(env) {
  const keys = getApiKeys();
  if (keys.length === 0) return { checked: 0, updated: 0 };

  console.log(`开始检查 ${keys.length} 个密钥的健康状态...`);
  
  const results = await Promise.all(keys.map(async (key) => {
    const health = await checkKeyHealth(key);
    return { key, ...health };
  }));

  let updatedCount = 0;
  
  // 更新状态
  for (const result of results) {
    if (result.status !== 'error') { // 忽略网络错误，只处理明确的状态变化
      updateKeyStatus(result.key, result.status);
      updatedCount++;
    }
  }
  
  // 保存更新后的密钥状态到 KV (如果需要持久化状态)
  // 注意：这里假设 state.js 会处理内存中的状态更新，持久化可能在其他地方处理
  // 如果 updateKeyStatus 没有持久化，这里可能需要额外调用 saveApiKeys
  
  return {
    checked: keys.length,
    updated: updatedCount,
    details: results
  };
}

// 触发后台健康检查（不等待结果）
export function triggerBackgroundHealthCheck(env) {
  // Cloudflare Workers 中可以使用 waitUntil 来运行后台任务
  // 但需要在 fetch handler 中调用 ctx.waitUntil
  // 这里我们返回一个 Promise，让调用者决定如何处理
  return checkAllKeysHealth(env).catch(err => {
    console.error('后台健康检查失败:', err);
  });
}
