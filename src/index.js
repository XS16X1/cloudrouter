// 主入口文件 - 路由和请求处理

import { Router } from 'itty-router';
import { getAdminPageHtml } from './templates.js';
import { getLoginPageHtml } from './login.js';
import { OPENROUTER_BASE_URL, STORAGE_KEYS } from './config.js';
import { 
  initializeState, 
  getApiKeys, 
  addApiKey, 
  removeApiKey,
  getClientTokens,
  addClientToken,
  removeClientToken,
  generateClientToken,
  saveClientTokens
} from './state.js';
import { 
  getRealTimeStats, 
  getKeyUsageStats 
} from './stats.js';
import { 
  getNextApiKey, 
  validateKeys 
} from './loadBalancer.js';
import { handleStreamResponse } from './streamHandler.js';
import { withAuth } from './authMiddleware.js';
import { FAVICON_ICO_BASE64, FAVICON_SVG } from './assets.js';
import { checkAllKeysHealth, triggerBackgroundHealthCheck } from './healthCheck.js';
import { getApiKeysWithStatus } from './state.js';

// 创建路由器
const router = Router();

// --- 静态资源路由 ---
router.get('/favicon.ico', () => {
  // 优先使用 Base64 编码的 ICO，如果需要 SVG 可以修改
  const buffer = Uint8Array.from(atob(FAVICON_ICO_BASE64), c => c.charCodeAt(0));
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/x-icon',
      'Cache-Control': 'public, max-age=86400'
    }
  });
});

router.get('/favicon.svg', () => {
  return new Response(FAVICON_SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400'
    }
  });
});

// --- 认证辅助函数 ---

function checkAuth(request) {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return false;
  
  // 简单的 Cookie 解析，实际生产环境建议使用更安全的 session 机制或 JWT
  return cookie.includes('admin_session=true');
}

// 登录页面
router.get('/login', (request) => {
  if (checkAuth(request)) {
    return Response.redirect(new URL(request.url).origin, 302);
  }
  
  return new Response(getLoginPageHtml(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
});

// 处理登录请求
router.post('/login', async (request, env) => {
  try {
    const { password } = await request.json();
    
    // 优先从 KV 中获取密码，如果没有则尝试环境变量，最后默认为 'admin'
    let adminPassword = await env.ROUTER_KV.get(STORAGE_KEYS.ADMIN_PASSWORD);
    if (!adminPassword) {
      adminPassword = env.ADMIN_PASSWORD || 'admin';
    }
    
    if (password === adminPassword) {
      // 登录成功，设置 Cookie
      // 注意：HttpOnly 和 Secure 标志在生产环境中非常重要
      // Secure 只有在 HTTPS 下才有效，本地开发可能需要去掉
      const headers = new Headers();
      headers.append('Set-Cookie', 'admin_session=true; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400'); // 24小时有效
      headers.append('Content-Type', 'application/json');
      
      return new Response(JSON.stringify({ success: true }), { headers });
    } else {
      return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('登录处理错误:', error);
    return new Response(JSON.stringify({ success: false, error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// 退出登录
router.get('/logout', (request) => {
  const headers = new Headers();
  headers.append('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); // 立即过期
  headers.append('Location', '/login');
  
  return new Response(null, { status: 302, headers });
});

// 修改密码
router.post('/api/change-password', async (request, env) => {
  // 检查是否登录
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { password } = await request.json();
    
    if (!password || password.length < 5) {
      return new Response(JSON.stringify({ success: false, error: '密码长度至少为5位' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 将新密码存储到 KV
    await env.ROUTER_KV.put(STORAGE_KEYS.ADMIN_PASSWORD, password);
    
    // 清除会话，要求重新登录
    const headers = new Headers();
    headers.append('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    headers.append('Content-Type', 'application/json');
    
    return new Response(JSON.stringify({ success: true, message: '密码修改成功' }), { headers });
  } catch (error) {
    console.error('修改密码失败:', error);
    return new Response(JSON.stringify({ success: false, error: '修改密码失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// --- OpenAI 兼容 API ---

// 获取模型列表 - 需要客户端token认证
router.get('/v1/models', withAuth(async (request, env) => {
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
}));

// 聊天完成 - 需要客户端token认证
router.post('/v1/chat/completions', withAuth(async (request, env) => {
  await initializeState(env);

  try {
    const requestBody = await request.json();
    const apiKey = await getNextApiKey(env);

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
        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;
        
        console.log(`API密钥 ${apiKey.substring(0, 8)}... 真实token使用量 - Prompt: ${promptTokens}, Completion: ${completionTokens}`);
        
        // 记录真实的API请求统计
        // 注意：这里需要导入recordApiRequest，但是为了避免循环依赖，我们在stats.js中直接调用
        // 这里使用import()动态导入
        const { recordApiRequest } = await import('./stats.js');
        await recordApiRequest(apiKey, env, promptTokens, completionTokens);
      } catch (e) {
        console.error('解析响应token信息失败:', e);
        // 如果解析失败，使用估算值
        const { recordApiRequest } = await import('./stats.js');
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
}));

// --- 客户端 Token 管理 API ---

// 获取客户端token列表
router.get('/api/client-tokens', async (request, env) => {
  await initializeState(env);
  
  try {
    const tokens = getClientTokens();
    
    return new Response(JSON.stringify({ 
      success: true, 
      tokens: tokens
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取客户端token列表失败:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: '获取客户端token列表失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// 生成新的客户端token
router.post('/api/client-tokens', async (request, env) => {
  await initializeState(env);
  
  try {
    const { name, expireSeconds, customToken } = await request.json();
    
    // 自动生成客户端名称（如果没有提供）
    let clientName = name;
    if (!clientName || !clientName.trim()) {
      const existingTokens = getClientTokens();
      const count = existingTokens.length + 1;
      clientName = '客户端' + count;
    }
    
    const tokenData = generateClientToken(
      clientName.trim(), 
      expireSeconds,
      customToken
    );
    
    if (addClientToken(tokenData)) {
      // 保存到KV存储
      await saveClientTokens(env);
      
      return new Response(JSON.stringify({ 
        success: true, 
        token: tokenData,
        message: '客户端token生成成功'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'token生成失败或已存在'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('生成客户端token失败:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || '生成客户端token失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// 删除客户端token
router.delete('/api/client-tokens/:token', async (request, env) => {
  await initializeState(env);
  
  try {
    const { token } = request.params;

    if (!removeClientToken(token)) {
      return new Response(JSON.stringify({ error: 'token不存在' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    await saveClientTokens(env);

    return new Response(JSON.stringify({ success: true, message: '客户端token删除成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('删除客户端token失败:', error);
    return new Response(JSON.stringify({ error: '删除客户端token时发生内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// --- 密钥健康检查 API ---

// 触发后台健康检查
router.post('/api/health-check/trigger', async (request, env) => {
  await initializeState(env);
  
  // 触发检查但不等待结果
  triggerBackgroundHealthCheck(env);
  
  return new Response(JSON.stringify({ 
    success: true, 
    message: '健康检查已触发，请稍后刷新查看状态' 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// 获取健康检查结果
router.get('/api/health-check/status', async (request, env) => {
  await initializeState(env);
  
  const keys = getApiKeysWithStatus();
  const healthyCount = keys.filter(k => k.status === 'active').length;
  
  return new Response(JSON.stringify({ 
    success: true, 
    total: keys.length,
    healthy: healthyCount,
    unhealthy: keys.length - healthyCount,
    details: keys
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// --- 管理API ---

// 获取API密钥列表
router.get('/api/keys', async (request, env) => {
  await initializeState(env);
  
  try {
    const apiKeys = getApiKeys();
    const keysWithStats = await getKeyUsageStats(env, apiKeys);
    
    return new Response(JSON.stringify({ 
      success: true, 
      keys: keysWithStats
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取API密钥列表失败:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: '获取API密钥列表失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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

    // 使用负载均衡模块的验证功能
    const { validKeys, invalidKeys, duplicateKeys } = validateKeys(keyList);

    // 添加有效的新密钥
    if (validKeys.length > 0) {
      for (const key of validKeys) {
        addApiKey(key);
      }
      await env.ROUTER_KV.put('api_keys', JSON.stringify(getApiKeys()));
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

    if (!removeApiKey(key)) {
      return new Response(JSON.stringify({ error: '密钥不存在' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    await env.ROUTER_KV.put('api_keys', JSON.stringify(getApiKeys()));

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
  // 检查是否登录
  if (!checkAuth(request)) {
    return Response.redirect(new URL(request.url).origin + '/login', 302);
  }

  await initializeState(env);

  // 获取实时统计数据
  const apiKeys = getApiKeys();
  const stats = await getRealTimeStats(env, apiKeys.length);

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

// --- 导出 ---
export default {
  async fetch(request, env, ctx) {
    await initializeState(env);
    return router.handle(request, env, ctx);
  },
};
