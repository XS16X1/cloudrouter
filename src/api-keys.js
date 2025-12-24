import { KV_KEYS, REQUEST_COUNT_KEY_PREFIX } from './constants.js';
import { getApiKeys, setApiKeys, getClientTokens, setClientTokens, initializeState, checkKeyHealth } from './utils.js';

// 获取所有 API 密钥
export async function getApiKeysData() {
  await initializeState();
  return getApiKeys();
}

// 添加新的 API 密钥
export async function addApiKey(name, value, env) {
  await initializeState(env);
  const currentKeys = getApiKeys();
  
  // 检查是否已存在相同名称的密钥
  if (currentKeys.some(key => key.name === name)) {
    throw new Error('密钥名称已存在');
  }

  // 检查密钥健康状态
  const isHealthy = await checkKeyHealth(value);
  const newKey = { name, value, isHealthy };
  currentKeys.push(newKey);
  setApiKeys(currentKeys);

  // 保存到 KV
  await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(currentKeys));

  return newKey;
}

// 删除 API 密钥
export async function deleteApiKey(name, env) {
  await initializeState(env);
  const currentKeys = getApiKeys();
  
  const keyIndex = currentKeys.findIndex(key => key.name === name);
  if (keyIndex === -1) {
    throw new Error('密钥不存在');
  }

  currentKeys.splice(keyIndex, 1);
  setApiKeys(currentKeys);
  await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(currentKeys));
}

// 刷新所有密钥健康状态
export async function refreshAllKeyHealth(env) {
  await initializeState(env);
  
  const currentKeys = getApiKeys();
  console.log('开始手动刷新所有密钥健康状态...');
  for (let i = 0; i < currentKeys.length; i++) {
    console.log(`检查密钥 ${i + 1}/${currentKeys.length}: ${currentKeys[i].name}`);
    currentKeys[i].isHealthy = await checkKeyHealth(currentKeys[i].value);
  }

  // 保存更新后的状态
  setApiKeys(currentKeys);
  await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(currentKeys));
  
  const healthyCount = currentKeys.filter(key => key.isHealthy).length;
  console.log(`健康检查完成: ${healthyCount}/${currentKeys.length} 个密钥可用`);

  return {
    healthyCount,
    totalCount: currentKeys.length,
    keys: currentKeys
  };
}

// 生成密钥名称（自动生成）
export function generateKeyName(index) {
  return `Key-${Date.now()}-${index.toString().padStart(3, '0')}`;
}

// 批量添加 API 密钥
export async function batchAddApiKeys(keyValues, env) {
  await initializeState(env);
  const currentKeys = getApiKeys();
  
  const results = {
    success: [],
    failed: [],
    summary: {
      total: keyValues.length,
      successCount: 0,
      failedCount: 0
    }
  };

  for (let i = 0; i < keyValues.length; i++) {
    const keyValue = keyValues[i].trim();
    if (!keyValue) continue;

    try {
      // 检查是否已存在相同值的密钥
      if (currentKeys.some(key => key.value === keyValue)) {
        results.failed.push({
          key: keyValue.substring(0, 8) + '...',
          reason: '密钥值已存在'
        });
        results.summary.failedCount++;
        continue;
      }

      const keyName = generateKeyName(i + 1);
      const isHealthy = await checkKeyHealth(keyValue);
      const newKey = { name: keyName, value: keyValue, isHealthy };
      currentKeys.push(newKey);

      results.success.push({
        name: keyName,
        key: keyValue.substring(0, 8) + '...',
        isHealthy
      });
      results.summary.successCount++;
    } catch (error) {
      results.failed.push({
        key: keyValue.substring(0, 8) + '...',
        reason: error.message
      });
      results.summary.failedCount++;
    }
  }

  // 保存到 KV
  setApiKeys(currentKeys);
  await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(currentKeys));

  return results;
}

// 批量删除 API 密钥
export async function batchDeleteApiKeys(names, env) {
  await initializeState(env);
  const currentKeys = getApiKeys();
  
  const results = {
    success: [],
    failed: [],
    summary: {
      total: names.length,
      successCount: 0,
      failedCount: 0
    }
  };

  for (const name of names) {
    try {
      const keyIndex = currentKeys.findIndex(key => key.name === name);
      if (keyIndex === -1) {
        results.failed.push({
          name,
          reason: '密钥不存在'
        });
        results.summary.failedCount++;
        continue;
      }

      currentKeys.splice(keyIndex, 1);
      results.success.push({ name });
      results.summary.successCount++;
    } catch (error) {
      results.failed.push({
        name,
        reason: error.message
      });
      results.summary.failedCount++;
    }
  }

  // 保存到 KV
  setApiKeys(currentKeys);
  await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(currentKeys));

  return results;
}

// 获取请求计数
export async function getRequestCounts(env) {
  await initializeState(env);
  const currentKeys = getApiKeys();
  
  const counts = {};
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  for (const key of currentKeys) {
    const countKey = REQUEST_COUNT_KEY_PREFIX + key.name;
    try {
      const countData = await env.ROUTER_KV.get(countKey, { type: 'json' });
      if (countData && countData[today]) {
        counts[key.name] = countData[today];
      } else {
        counts[key.name] = 0;
      }
    } catch (error) {
      counts[key.name] = 0;
    }
  }
  
  return counts;
}

// 增加请求计数
export async function incrementRequestCount(keyName, env) {
  const today = new Date().toISOString().split('T')[0];
  const countKey = REQUEST_COUNT_KEY_PREFIX + keyName;
  
  try {
    const countData = await env.ROUTER_KV.get(countKey, { type: 'json' }) || {};
    countData[today] = (countData[today] || 0) + 1;
    await env.ROUTER_KV.put(countKey, JSON.stringify(countData));
  } catch (error) {
    console.error('更新请求计数失败:', error);
  }
}