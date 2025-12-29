// 统计模块 - 处理API请求统计和实时数据

import { STORAGE_KEYS, ERROR_MESSAGES } from './config.js';

// 记录API请求统计
export async function recordApiRequest(apiKey, env, promptTokens = 0, completionTokens = 0) {
  try {
    const currentTime = Date.now();
    const currentDate = new Date().toDateString();
    
    // 从KV存储获取现有统计数据
    let statsData = await env.ROUTER_KV.get(STORAGE_KEYS.REQUEST_STATS, { type: 'json' });
    
    if (!statsData) {
      statsData = {
        daily: {
          counts: {},
          tokens: {},
          lastDate: currentDate
        },
        minute: []
      };
    }
    
    // 如果是新的一天，重置每日数据
    if (statsData.daily.lastDate !== currentDate) {
      statsData.daily.counts = {};
      statsData.daily.tokens = {};
      statsData.daily.lastDate = currentDate;
    }
    
    // 更新每日请求统计
    if (!statsData.daily.counts[apiKey]) {
      statsData.daily.counts[apiKey] = 0;
    }
    if (!statsData.daily.tokens[apiKey]) {
      statsData.daily.tokens[apiKey] = 0;
    }
    statsData.daily.counts[apiKey]++;
    statsData.daily.tokens[apiKey] += promptTokens + completionTokens;
    
    // 更新每分钟统计
    const minuteKey = Math.floor(currentTime / (60 * 1000)); // 每分钟一个key
    statsData.minute = statsData.minute.filter(item => item.time >= minuteKey - 1); // 只保留最近2分钟
    
    const existingMinute = statsData.minute.find(item => item.time === minuteKey);
    if (existingMinute) {
      existingMinute.requests++;
      existingMinute.tokens += promptTokens + completionTokens;
    } else {
      statsData.minute.push({
        time: minuteKey,
        requests: 1,
        tokens: promptTokens + completionTokens
      });
    }
    
    // 保存统计
    await env.ROUTER_KV.put(STORAGE_KEYS.REQUEST_STATS, JSON.stringify(statsData));
    
    console.log(`API密钥 ${apiKey.substring(0, 8)}... 今日请求数: ${statsData.daily.counts[apiKey]}, 总Token数: ${statsData.daily.tokens[apiKey]}`);
  } catch (error) {
    console.error('记录API请求统计失败:', error);
  }
}

// 获取实时统计
export async function getRealTimeStats(env, apiKeysCount = 0) {
  try {
    const currentTime = Date.now();
    const currentDate = new Date().toDateString();
    
    const statsData = await env.ROUTER_KV.get(STORAGE_KEYS.REQUEST_STATS, { type: 'json' }) || {};
    
    // 计算每分钟统计 (最近1分钟)
    const oneMinuteAgo = Math.floor((currentTime - 60 * 1000) / (60 * 1000));
    let rpm = 0;
    let tpm = 0;
    
    if (statsData.minute) {
      for (const item of statsData.minute) {
        if (item.time >= oneMinuteAgo) {
          rpm += item.requests;
          tpm += item.tokens;
        }
      }
    }
    
    // 计算每日统计
    let rpd = 0;
    let tpd = 0;
    
    if (statsData.daily && statsData.daily.lastDate === currentDate) {
      const dailyCounts = statsData.daily.counts || {};
      const dailyTokens = statsData.daily.tokens || {};
      
      rpd = Object.values(dailyCounts).reduce((sum, count) => sum + count, 0);
      tpd = Object.values(dailyTokens).reduce((sum, tokens) => sum + tokens, 0);
    }
    
    return {
      rpm,
      tpm,
      rpd,
      tpd,
      api_keys_count: apiKeysCount
    };
  } catch (error) {
    console.error('获取实时统计失败:', error);
    return {
      rpm: 0,
      tpm: 0,
      rpd: 0,
      tpd: 0,
      api_keys_count: apiKeysCount
    };
  }
}

// 获取每日统计数据
export async function getDailyStats(env) {
  try {
    const currentDate = new Date().toDateString();
    const statsData = await env.ROUTER_KV.get(STORAGE_KEYS.REQUEST_STATS, { type: 'json' }) || {};
    
    if (statsData.daily && statsData.daily.lastDate === currentDate && statsData.daily.counts) {
      return statsData.daily.counts;
    }
    
    return {};
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return {};
  }
}

// 获取密钥使用统计
export async function getKeyUsageStats(env, apiKeys) {
  try {
    const dailyStats = await getDailyStats(env);
    
    return apiKeys.map(key => ({
      key: key.substring(0, 8) + '...' + key.substring(key.length - 8),
      full_key: key,
      status: 'active',
      daily_requests: dailyStats[key] || 0
    }));
  } catch (error) {
    console.error('获取密钥使用统计失败:', error);
    return apiKeys.map(key => ({
      key: key.substring(0, 8) + '...' + key.substring(key.length - 8),
      full_key: key,
      status: 'active',
      daily_requests: 0
    }));
  }
}