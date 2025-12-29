// 认证中间件 - 处理客户端token验证

import { validateClientToken, updateTokenUsage } from './state.js';
import { ERROR_MESSAGES } from './config.js';

// 客户端token验证中间件
export async function validateClientTokenMiddleware(request, env) {
  // 获取Authorization头中的token
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return new Response(JSON.stringify({ 
      error: { 
        message: ERROR_MESSAGES.CLIENT_TOKEN_REQUIRED, 
        type: 'unauthorized' 
      } 
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 解析Bearer token
  let token;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = authHeader;
  }

  // 验证token
  const validation = validateClientToken(token);
  
  if (!validation.valid) {
    return new Response(JSON.stringify({ 
      error: { 
        message: validation.error, 
        type: 'unauthorized' 
      } 
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 更新token使用统计
  updateTokenUsage(token);

  // 将验证结果附加到请求对象上
  request.clientTokenData = validation.tokenData;
  
  return null; // 验证通过，继续处理请求
}

// 检查请求是否需要认证的辅助函数
export function shouldSkipAuth(pathname) {
  // 管理API和管理页面不需要客户端token验证
  // 注意：必须使用精确匹配，不能使用 startsWith('/') 因为所有路径都以/开头
  const skipPaths = [
    '/',
    '/login',
    '/logout',
    '/api/keys',
    '/api/client-tokens',
    '/favicon.ico',
    '/favicon.svg',
    '/static/',
    '/.well-known/'
  ];
  
  // 使用精确匹配或前缀匹配（仅适用于特定路径）
  return skipPaths.some(path => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  });
}

// 应用认证中间件的包装函数
export function withAuth(handler) {
  return async (request, env, ctx) => {
    const url = new URL(request.url);
    
    // 检查是否需要认证
    if (shouldSkipAuth(url.pathname)) {
      return handler(request, env, ctx);
    }

    // 应用token验证
    const authResult = await validateClientTokenMiddleware(request, env);
    if (authResult) {
      return authResult;
    }

    // 验证通过，继续处理请求
    return handler(request, env, ctx);
  };
}