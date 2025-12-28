import { Router } from 'itty-router';
import { getAdminPageHtml } from './templates.js';

// 创建路由器
const router = Router();

// --- 核心全局变量 ---
let apiKeys = []; // API密钥轮询池
let currentKeyIndex = 0;
let isInitialized = false;

// OpenRouter API 基础URL
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// --- 初始化函数 ---
async function initializeState(env) {
  if (isInitialized) {
    return;
  }

  try {
    // 从KV存储加载API密钥
    const keysData = await env.ROUTER_KV.get('api_keys', { type: 'json' });
    
    if (keysData && Array.isArray(keysData)) {
      apiKeys = keysData.filter(key => typeof key === 'string' && key.startsWith('sk-'));
      console.log(`已加载 ${apiKeys.length} 个API密钥`);
    } else {
      apiKeys = [];
      console.log('未找到API密钥');
    }

    isInitialized = true;
  } catch (error) {
    console.error('初始化状态失败:', error);
    apiKeys = [];
  }
}

// --- API密钥负载均衡选择 ---
async function getNextApiKey(env) {
  if (apiKeys.length === 0) {
    throw new Error('没有可用的API密钥');
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
  const keyToUse = apiKeys[currentKeyIndex % apiKeys.length];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  
  return keyToUse;
}

// --- 查找使用次数最少的API密钥 ---
async function findLeastUsedApiKey(env) {
  try {
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

// --- 获取每日统计数据 ---
async function getDailyStats(env) {
  try {
    const currentDate = new Date().toDateString();
    const statsData = await env.ROUTER_KV.get('request_stats', { type: 'json' }) || {};
    
    if (statsData.daily && statsData.daily.lastDate === currentDate && statsData.daily.counts) {
      return statsData.daily.counts;
    }
    
    return {};
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return {};
  }
}

// --- 记录API请求统计 ---
async function recordApiRequest(apiKey, env, promptTokens = 0, completionTokens = 0) {
  try {
    const currentTime = Date.now();
    const currentDate = new Date().toDateString();
    
    // 从KV存储获取现有统计数据
    let statsData = await env.ROUTER_KV.get('request_stats', { type: 'json' });
    
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
    await env.ROUTER_KV.put('request_stats', JSON.stringify(statsData));
    
    console.log(`API密钥 ${apiKey.substring(0, 8)}... 今日请求数: ${statsData.daily.counts[apiKey]}, 总Token数: ${statsData.daily.tokens[apiKey]}`);
  } catch (error) {
    console.error('记录API请求统计失败:', error);
  }
}

// --- 获取实时统计 ---
async function getRealTimeStats(env) {
  try {
    const currentTime = Date.now();
    const currentDate = new Date().toDateString();
    
    const statsData = await env.ROUTER_KV.get('request_stats', { type: 'json' }) || {};
    
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
      api_keys_count: apiKeys.length
    };
  } catch (error) {
    console.error('获取实时统计失败:', error);
    return {
      rpm: 0,
      tpm: 0,
      rpd: 0,
      tpd: 0,
      api_keys_count: apiKeys.length
    };
  }
}

// --- OpenAI 兼容 API ---

// 获取模型列表
router.get('/v1/models', async (request, env) => {
  await initializeState(env);

  try {
    const apiKey = await getNextApiKey(env);
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API错误: ${response.status}`);
    }

    const data = await response.text();
    return new Response(data, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取模型列表失败:', error);
    return new Response(JSON.stringify({ error: { message: '获取模型列表失败', type: 'api_error' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// 聊天完成
router.post('/v1/chat/completions', async (request, env) => {
  await initializeState(env);

  try {
    const requestBody = await request.json();
    const apiKey = await getNextApiKey(env);

    // 记录API请求统计
    let promptTokens = 0;
    let completionTokens = 0;
    
    // 记录API请求统计 - 等待真实响应后更新
    let requestStartTime = Date.now();

    const isStream = requestBody.stream === true;
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: { message: 'OpenRouter API请求失败', type: 'api_error' } }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    if (isStream) {
      // 处理流式响应，提取真实的token使用量
      const streamResponse = await handleStreamResponse(response, apiKey, env, requestStartTime);
      return streamResponse;
    } else {
      // 处理非流式响应，提取真实的token使用量
      const responseData = await response.json();
      
      // 从响应中提取真实的token使用量
      try {
        const usage = responseData.usage || {};
        promptTokens = usage.prompt_tokens || 0;
        completionTokens = usage.completion_tokens || 0;
        
        console.log(`API密钥 ${apiKey.substring(0, 8)}... 真实token使用量 - Prompt: ${promptTokens}, Completion: ${completionTokens}`);
        
        // 记录真实的API请求统计
        await recordApiRequest(apiKey, env, promptTokens, completionTokens);
      } catch (e) {
        console.error('解析响应token信息失败:', e);
        // 如果解析失败，使用估算值
        await recordApiRequest(apiKey, env, 0, 0);
      }
      
      return new Response(JSON.stringify(responseData), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('聊天完成请求失败:', error);
    return new Response(JSON.stringify({ error: { message: '聊天完成请求失败', type: 'api_error' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- 管理API ---

// 获取API密钥列表
router.get('/api/keys', async (request, env) => {
  await initializeState(env);
  
  // 获取每日请求统计
  let dailyStats = {};
  try {
    const statsData = await env.ROUTER_KV.get('request_stats', { type: 'json' });
    if (statsData && statsData.daily && statsData.daily.counts) {
      // 确保日期匹配
      const currentDate = new Date().toDateString();
      if (statsData.daily.lastDate === currentDate) {
        dailyStats = statsData.daily.counts;
      }
    }
  } catch (error) {
    console.error('获取每日统计失败:', error);
  }
  
  return new Response(JSON.stringify({ 
    success: true, 
    keys: apiKeys.map(key => ({
      key: key.substring(0, 8) + '...' + key.substring(key.length - 8),
      full_key: key, // 添加完整密钥用于删除操作
      status: 'active',
      daily_requests: dailyStats[key] || 0 // 添加每日请求数
    }))
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// 添加API密钥（支持批量添加）
router.post('/api/keys', async (request, env) => {
  await initializeState(env);
  try {
    const { keys } = await request.json();
    
    if (!keys || (!Array.isArray(keys) && typeof keys !== 'string')) {
      return new Response(JSON.stringify({ error: '无效的请求格式' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    let keyList = [];
    if (Array.isArray(keys)) {
      keyList = keys;
    } else {
      // 解析逗号或换行分隔的字符串
      keyList = keys.split(/[\n,]/)
        .map(k => k.trim())
        .filter(k => k.length > 0);
    }

    const validKeys = [];
    const invalidKeys = [];
    const duplicateKeys = [];

    for (const key of keyList) {
      if (!key.startsWith('sk-')) {
        invalidKeys.push(key);
        continue;
      }
      
      if (apiKeys.includes(key)) {
        duplicateKeys.push(key);
        continue;
      }
      
      validKeys.push(key);
    }

    // 添加有效的新密钥
    if (validKeys.length > 0) {
      apiKeys.push(...validKeys);
      await env.ROUTER_KV.put('api_keys', JSON.stringify(apiKeys));
      console.log(`添加了 ${validKeys.length} 个新密钥`);
    }

    const result = {
      success: true,
      added: validKeys.length,
      duplicates: duplicateKeys.length,
      invalid: invalidKeys.length,
      message: `成功添加 ${validKeys.length} 个密钥`
    };

    if (duplicateKeys.length > 0) {
      result.message += `，${duplicateKeys.length} 个密钥已存在`;
    }

    if (invalidKeys.length > 0) {
      result.message += `，${invalidKeys.length} 个密钥格式无效`;
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("添加API密钥失败:", error);
    return new Response(JSON.stringify({ error: '添加密钥时发生内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// 删除API密钥
router.delete('/api/keys/:key', async (request, env) => {
  await initializeState(env);
  try {
    const { key } = request.params;
    const keyIndex = apiKeys.indexOf(key);

    if (keyIndex === -1) {
      return new Response(JSON.stringify({ error: '密钥不存在' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    apiKeys.splice(keyIndex, 1);
    await env.ROUTER_KV.put('api_keys', JSON.stringify(apiKeys));

    return new Response(JSON.stringify({ success: true, message: 'API密钥删除成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("删除API密钥失败:", error);
    return new Response(JSON.stringify({ error: '删除密钥时发生内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});



// --- 主页 ---
router.get('/', async (request, env) => {
  await initializeState(env);

  // 获取实时统计数据
  const stats = await getRealTimeStats(env);

  const html = getAdminPageHtml(
    new URL(request.url).origin, 
    stats.rpm, 
    stats.tpm, 
    stats.rpd, 
    stats.tpd
  );

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
});

// 404 处理
router.all('*', () => new Response('Not Found', { status: 404 }));

// --- 处理流式响应 ---
async function handleStreamResponse(response, apiKey, env, requestStartTime) {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    let accumulatedData = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let finalUsage = null;
    
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body.getReader();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // 解码数据块
            const chunk = decoder.decode(value, { stream: true });
            accumulatedData += chunk;
            
            // 解析当前积累的数据中的usage信息
            try {
              const lines = accumulatedData.split('\n');
              for (const line of lines) {
                if (line.startsWith('data:') && line !== 'data: [DONE]') {
                  try {
                    const dataContent = line.substring(5).trim();
                    if (dataContent) {
                      const parsed = JSON.parse(dataContent);
                      if (parsed.usage) {
                        // 更新最终usage信息
                        finalUsage = parsed.usage;
                        promptTokens = finalUsage.prompt_tokens || 0;
                        completionTokens = finalUsage.completion_tokens || 0;
                      }
                    }
                  } catch (parseError) {
                    // 忽略解析错误，继续处理
                  }
                }
              }
            } catch (parseError) {
              // 忽略解析错误
            }
            
            // 发送数据块给客户端
            controller.enqueue(value);
          }
          
          // 流结束时记录统计
          if (finalUsage) {
            console.log(`API密钥 ${apiKey.substring(0, 8)}... 流式响应真实token使用量 - Prompt: ${promptTokens}, Completion: ${completionTokens}`);
            await recordApiRequest(apiKey, env, promptTokens, completionTokens);
          } else {
            console.log(`API密钥 ${apiKey.substring(0, 8)}... 未获取到usage信息，使用默认值`);
            await recordApiRequest(apiKey, env, 0, 0);
          }
          
          controller.close();
        } catch (error) {
          console.error('流式响应处理错误:', error);
          controller.error(error);
        }
      }
    });
    
    return new Response(readable, {
      status: response.status,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Transfer-Encoding': 'chunked',
      }
    });
  } catch (error) {
    console.error('创建流式响应失败:', error);
    // 降级到直接转发
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Transfer-Encoding': 'chunked',
      }
    });
  }
}

// --- 导出 ---
export default {
  async fetch(request, env, ctx) {
    await initializeState(env);
    return router.handle(request, env, ctx);
  },
};
