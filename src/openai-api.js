import { OPENROUTER_BASE_URL } from './constants.js';
import { initializeState, verifyClientToken, getNextApiKey, getCurrentApiKey, getApiKeys } from './utils.js';
import { incrementRequestCount } from './api-keys.js';

// OpenAI 兼容 API
export function setupOpenaiApiRoutes(router) {
  // 获取模型列表
  router.get('/v1/models', async (request, env) => {
    await initializeState(env);

    // 客户端 token 验证
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: { message: '未提供认证信息', type: 'invalid_request_error' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const token = authHeader.substring(7);
    if (!verifyClientToken(token)) {
      return new Response(JSON.stringify({ error: { message: '无效的 API 密钥', type: 'invalid_request_error' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    try {
      const apiKey = await getNextApiKey();
      const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API 错误: ${response.status}`);
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

    // 客户端 token 验证
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: { message: '未提供认证信息', type: 'invalid_request_error' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const token = authHeader.substring(7);
    if (!verifyClientToken(token)) {
      return new Response(JSON.stringify({ error: { message: '无效的 API 密钥', type: 'invalid_request_error' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    try {
      const apiKey = await getNextApiKey();
      const requestBody = await request.text();

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      // 记录请求计数（仅在成功响应时）
      if (response.ok) {
        const currentKeys = getApiKeys();
        const usedKey = currentKeys.find(key => key.value === apiKey);
        if (usedKey) {
          await incrementRequestCount(usedKey.name, env);
        }
      }

      const responseData = await response.text();
      return new Response(responseData, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('聊天完成请求失败:', error);
      return new Response(JSON.stringify({ error: { message: '聊天完成请求失败', type: 'api_error' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });
}