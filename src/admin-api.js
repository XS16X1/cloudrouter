import { initializeState, getAdminPasswordHash, setAdminPasswordHash, hashPassword, verifyPassword } from './utils.js';
import { requireAdminAuth } from './auth.js';
import { getApiKeysData, addApiKey, deleteApiKey, refreshAllKeyHealth, batchAddApiKeys, batchDeleteApiKeys, getRequestCounts } from './api-keys.js';
import { getTokens, createToken, updateTokenStatus, deleteToken } from './tokens.js';
import { KV_KEYS } from './constants.js';

// 管理员认证 API
export function setupAdminApiRoutes(router) {
  // 检查管理员密码设置状态
  router.get('/api/admin/auth/status', async (request, env) => {
    await initializeState(env);
    const currentHash = getAdminPasswordHash();
    return new Response(JSON.stringify({ isPasswordSet: !!currentHash }), {
      headers: { 'Content-Type': 'application/json' }
    });
  });

  // 设置管理员密码
  router.post('/api/admin/auth/setup', async (request, env) => {
    await initializeState(env);
    const currentHash = getAdminPasswordHash();
    if (currentHash) {
      return new Response(JSON.stringify({ error: '密码已设置' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    try {
      const { password } = await request.json();
      if (!password || password.length < 8) {
        return new Response(JSON.stringify({ error: '密码无效或太短（至少8位）' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const newHash = await hashPassword(password);
      await env.ROUTER_KV.put(KV_KEYS.ADMIN_PASSWORD_HASH, newHash);
      setAdminPasswordHash(newHash);

      return new Response(JSON.stringify({ success: true, message: '管理员密码设置成功' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("密码设置失败:", error);
      return new Response(JSON.stringify({ error: '设置密码时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 管理员登录
  router.post('/api/admin/auth/login', async (request, env) => {
    await initializeState(env);
    const currentHash = getAdminPasswordHash();
    if (!currentHash) {
      return new Response(JSON.stringify({ error: '管理员密码尚未设置' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    try {
      const { password } = await request.json();
      const isValid = await verifyPassword(password, currentHash);

      if (isValid) {
        return new Response(JSON.stringify({ success: true, message: '登录成功' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error) {
       console.error("登录失败:", error);
       return new Response(JSON.stringify({ error: '登录时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 修改管理员密码
  router.post('/api/admin/auth/change-password', requireAdminAuth, async (request, env) => {
    try {
      const { newPassword } = await request.json();

      if (!newPassword || newPassword.length < 8) {
        return new Response(JSON.stringify({ error: '新密码无效或太短（至少8位）' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const newHash = await hashPassword(newPassword);
      await env.ROUTER_KV.put(KV_KEYS.ADMIN_PASSWORD_HASH, newHash);
      setAdminPasswordHash(newHash);

      return new Response(JSON.stringify({ success: true, message: '密码修改成功' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("密码修改失败:", error);
      return new Response(JSON.stringify({ error: '修改密码时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // API 密钥管理
  router.get('/api/admin/keys', requireAdminAuth, async (request, env) => {
    const keys = await getApiKeysData();
    return new Response(JSON.stringify({ success: true, keys }), {
      headers: { 'Content-Type': 'application/json' }
    });
  });

  // 手动刷新所有密钥健康状态
  router.post('/api/admin/keys/refresh', requireAdminAuth, async (request, env) => {
    try {
      const result = await refreshAllKeyHealth(env);
      return new Response(JSON.stringify({
        success: true,
        message: `健康检查完成: ${result.healthyCount}/${result.totalCount} 个密钥可用`,
        keys: result.keys
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("刷新密钥状态失败:", error);
      return new Response(JSON.stringify({ error: '刷新密钥状态时发生内部错误' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  // 添加 API 密钥
  router.post('/api/admin/keys', requireAdminAuth, async (request, env) => {
    try {
      const { name, value } = await request.json();
      if (!name || !value) {
        return new Response(JSON.stringify({ error: '密钥名称和值不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const newKey = await addApiKey(name, value, env);

      return new Response(JSON.stringify({ success: true, message: 'API 密钥添加成功', key: { name: newKey.name, isHealthy: newKey.isHealthy } }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("添加 API 密钥失败:", error);
      return new Response(JSON.stringify({ error: '添加密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 删除 API 密钥
  router.delete('/api/admin/keys/:name', requireAdminAuth, async (request, env) => {
    try {
      const { name } = request.params;
      await deleteApiKey(name, env);

      return new Response(JSON.stringify({ success: true, message: 'API 密钥删除成功' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("删除 API 密钥失败:", error);
      return new Response(JSON.stringify({ error: '删除密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 客户端 Token 管理
  router.get('/api/admin/tokens', requireAdminAuth, async (request, env) => {
    const tokens = await getTokens();
    return new Response(JSON.stringify({ success: true, tokens }), {
      headers: { 'Content-Type': 'application/json' }
    });
  });

  // 创建客户端 Token
  router.post('/api/admin/tokens', requireAdminAuth, async (request, env) => {
    try {
      const { name, token } = await request.json();
      if (!name) {
        return new Response(JSON.stringify({ error: 'Token 名称不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const newToken = await createToken(name, token, env);

      return new Response(JSON.stringify({
        success: true,
        message: 'Token 创建成功',
        token: newToken
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("创建 Token 失败:", error);
      return new Response(JSON.stringify({ error: '创建 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 更新 Token 状态
  router.patch('/api/admin/tokens/:name', requireAdminAuth, async (request, env) => {
    try {
      const { name } = request.params;
      const { enabled } = await request.json();

      await updateTokenStatus(name, enabled, env);

      return new Response(JSON.stringify({ success: true, message: 'Token 状态更新成功' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("更新 Token 失败:", error);
      return new Response(JSON.stringify({ error: '更新 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 删除 Token
  router.delete('/api/admin/tokens/:name', requireAdminAuth, async (request, env) => {
    try {
      const { name } = request.params;
      await deleteToken(name, env);

      return new Response(JSON.stringify({ success: true, message: 'Token 删除成功' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("删除 Token 失败:", error);
      return new Response(JSON.stringify({ error: '删除 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 批量添加 API 密钥
  router.post('/api/admin/keys/batch-add', requireAdminAuth, async (request, env) => {
    try {
      const { keys } = await request.json();
      if (!keys || !Array.isArray(keys) || keys.length === 0) {
        return new Response(JSON.stringify({ error: '请提供要添加的密钥列表' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const results = await batchAddApiKeys(keys, env);
      return new Response(JSON.stringify({
        success: true,
        message: `批量添加完成: ${results.summary.successCount} 成功, ${results.summary.failedCount} 失败`,
        results
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('批量添加 API 密钥失败:', error);
      return new Response(JSON.stringify({ error: '批量添加密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 批量删除 API 密钥
  router.post('/api/admin/keys/batch-delete', requireAdminAuth, async (request, env) => {
    try {
      const { names } = await request.json();
      if (!names || !Array.isArray(names) || names.length === 0) {
        return new Response(JSON.stringify({ error: '请提供要删除的密钥名称列表' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const results = await batchDeleteApiKeys(names, env);
      return new Response(JSON.stringify({
        success: true,
        message: `批量删除完成: ${results.summary.successCount} 成功, ${results.summary.failedCount} 失败`,
        results
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('批量删除 API 密钥失败:', error);
      return new Response(JSON.stringify({ error: '批量删除密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });

  // 获取 API 密钥请求计数
  router.get('/api/admin/keys/request-counts', requireAdminAuth, async (request, env) => {
    try {
      const counts = await getRequestCounts(env);
      return new Response(JSON.stringify({
        success: true,
        counts
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('获取请求计数失败:', error);
      return new Response(JSON.stringify({ error: '获取请求计数时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });
}